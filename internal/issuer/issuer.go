// Package issuer membuat voucher harian untuk semua staf aktif dan mengirim emailnya.
//
// Setiap hari kerja dibuat voucher BARU (token baru, kode cadangan baru).
// Voucher kemarin tidak di-refresh; ia kedaluwarsa dan dibiarkan.
//
// Aman dijalankan ulang:
//   - staf yang vouchernya belum ada          -> dibuat lalu dikirim
//   - staf yang vouchernya ada tapi email belum terkirim (misalnya job gagal di
//     tengah) -> token DIGANTI lalu dikirim (token lama otomatis mati)
//   - staf yang emailnya sudah terkirim, atau voucher sudah dipakai/void -> dilewati
package issuer

import (
	"context"
	"fmt"
	"html"
	"log/slog"
	"time"

	"github.com/skip2/go-qrcode"

	"voucher-kantin/internal/idfmt"
	"voucher-kantin/internal/mail"
	"voucher-kantin/internal/token"
)

const (
	validFromHour  = 10
	validUntilHour = 16
)

type Staff struct {
	ID    int64
	Name  string
	Email string
}

type NewVoucher struct {
	StaffID    int64
	Date       time.Time
	TokenHash  []byte
	CodeHash   []byte
	ValidFrom  time.Time
	ValidUntil time.Time
}

// Store adalah akses ke database. Implementasi sungguhan: PGStore.
type Store interface {
	IsHoliday(ctx context.Context, date time.Time) (bool, error)
	ActiveStaff(ctx context.Context) ([]Staff, error)
	// CreateVoucher mengembalikan created=false jika staf itu sudah punya voucher di tanggal tsb.
	CreateVoucher(ctx context.Context, v NewVoucher) (id int64, created bool, err error)
	// RotateUnsent mengganti token voucher yang masih 'issued' dan emailnya belum terkirim.
	RotateUnsent(ctx context.Context, v NewVoucher) (id int64, ok bool, err error)
	MarkSent(ctx context.Context, id int64) error
}

type Options struct {
	Date     time.Time // tanggal bisnis; nol = hari ini di Location
	Location *time.Location
	QRKey    []byte
	ShortKey []byte

	Open  bool // dev: voucher berlaku sekarang sampai +8 jam
	Force bool // abaikan akhir pekan dan hari libur

	Delay    time.Duration // jeda antar email (batas kecepatan Microsoft 365)
	Attempts int           // percobaan kirim per email (default 3)
	Backoff  time.Duration // jeda antar percobaan (default 2 dtk x nomor percobaan)

	// OnIssued dipanggil setelah voucher dibuat (hanya untuk alat dev; jangan dipakai di produksi).
	OnIssued func(s Staff, code, payload string)

	Now   func() time.Time
	Sleep func(time.Duration)
}

type Summary struct {
	Skipped     string // alasan jika seluruh job dilewati
	Staff       int
	Created     int
	Rotated     int
	Sent        int
	AlreadySent int
	Failed      int
}

func (o Options) withDefaults() Options {
	if o.Now == nil {
		o.Now = time.Now
	}
	if o.Sleep == nil {
		o.Sleep = time.Sleep
	}
	if o.Attempts <= 0 {
		o.Attempts = 3
	}
	if o.Backoff <= 0 {
		o.Backoff = 2 * time.Second
	}
	if o.Location == nil {
		o.Location = time.UTC
	}
	return o
}

func Run(ctx context.Context, st Store, mailer mail.Mailer, log *slog.Logger, opt Options) (Summary, error) {
	opt = opt.withDefaults()
	var sum Summary

	d := opt.Date
	if d.IsZero() {
		d = opt.Now().In(opt.Location)
	}
	day := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, opt.Location)

	if !opt.Force {
		if wd := day.Weekday(); wd == time.Saturday || wd == time.Sunday {
			sum.Skipped = "akhir pekan"
			return sum, nil
		}
		hol, err := st.IsHoliday(ctx, day)
		if err != nil {
			return sum, fmt.Errorf("cek hari libur: %w", err)
		}
		if hol {
			sum.Skipped = "hari libur"
			return sum, nil
		}
	}

	staff, err := st.ActiveStaff(ctx)
	if err != nil {
		return sum, fmt.Errorf("ambil daftar staf: %w", err)
	}
	sum.Staff = len(staff)

	validFrom := time.Date(day.Year(), day.Month(), day.Day(), validFromHour, 0, 0, 0, opt.Location)
	validUntil := time.Date(day.Year(), day.Month(), day.Day(), validUntilHour, 0, 0, 0, opt.Location)
	if opt.Open {
		now := opt.Now()
		validFrom, validUntil = now.Add(-time.Minute), now.Add(8*time.Hour)
	}
	dateStr := day.Format("2006-01-02")

	for i, s := range staff {
		if err := ctx.Err(); err != nil {
			return sum, err
		}

		tok, err := token.New()
		if err != nil {
			return sum, err
		}
		code, err := token.NewShortCode()
		if err != nil {
			return sum, err
		}
		norm, _ := token.NormalizeShortCode(code)
		payload := token.Payload(opt.QRKey, tok)
		nv := NewVoucher{
			StaffID: s.ID, Date: day,
			TokenHash: token.Hash(tok), CodeHash: token.ShortCodeHash(opt.ShortKey, dateStr, norm),
			ValidFrom: validFrom, ValidUntil: validUntil,
		}

		id, created, err := st.CreateVoucher(ctx, nv)
		if err != nil {
			log.Error("buat voucher gagal", "staf", s.Name, "err", err)
			sum.Failed++
			continue
		}
		if created {
			sum.Created++
		} else {
			rid, ok, err := st.RotateUnsent(ctx, nv)
			if err != nil {
				log.Error("ganti token gagal", "staf", s.Name, "err", err)
				sum.Failed++
				continue
			}
			if !ok {
				sum.AlreadySent++ // email sudah terkirim, atau voucher sudah dipakai/void
				continue
			}
			id = rid
			sum.Rotated++
		}

		if opt.OnIssued != nil {
			opt.OnIssued(s, code, payload)
		}

		png, err := qrcode.Encode(payload, qrcode.Medium, 240)
		if err != nil {
			return sum, err
		}
		msg := buildMessage(s, day, code, validUntil, png)
		if err := sendWithRetry(ctx, mailer, msg, log, opt); err != nil {
			log.Error("email gagal", "staf", s.Name, "to", s.Email, "err", err)
			sum.Failed++
			continue
		}
		if err := st.MarkSent(ctx, id); err != nil {
			// Email sudah terkirim tapi tidak tercatat. Dijalankan ulang akan mengganti
			// token dan mengirim lagi; QR di email pertama menjadi tidak berlaku.
			log.Error("catat pengiriman gagal", "staf", s.Name, "err", err)
			sum.Failed++
			continue
		}
		sum.Sent++

		if opt.Delay > 0 && i < len(staff)-1 {
			opt.Sleep(opt.Delay)
		}
	}
	return sum, nil
}

func sendWithRetry(ctx context.Context, m mail.Mailer, msg mail.Message, log *slog.Logger, opt Options) error {
	var err error
	for attempt := 1; attempt <= opt.Attempts; attempt++ {
		if err = m.Send(ctx, msg); err == nil {
			return nil
		}
		log.Warn("kirim email gagal, akan dicoba lagi", "to", msg.To, "percobaan", attempt, "err", err)
		if attempt < opt.Attempts {
			opt.Sleep(time.Duration(attempt) * opt.Backoff)
		}
	}
	return err
}

func buildMessage(s Staff, day time.Time, code string, validUntil time.Time, png []byte) mail.Message {
	return mail.Message{
		To:      s.Email,
		Subject: "Voucher kantin · " + idfmt.Date(day),
		HTML: fmt.Sprintf(`<p>Halo <b>%s</b>, ini voucher kantin Anda untuk hari ini.</p>
<p style="font-size:20px"><b>Potongan Rp5.000</b></p>
<p><img src="cid:qr" width="240" height="240" alt="QR voucher"></p>
<p>Kode cadangan: <b style="font-family:monospace;font-size:18px">%s</b></p>
<p>Berlaku sampai %s WIB. Hanya bisa dipakai sekali.</p>
<p style="color:#6b7280;font-size:12px">Email otomatis, mohon tidak dibalas.</p>`,
			html.EscapeString(s.Name), code, validUntil.Format("15.04")),
		Inline: []mail.InlineImage{{CID: "qr", ContentType: "image/png", Data: png}},
	}
}
