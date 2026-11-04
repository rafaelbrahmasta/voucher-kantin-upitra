package issuer

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"voucher-kantin/internal/mail"
)

var wib = time.FixedZone("WIB", 7*3600)

type vrow struct {
	id        int64
	tokenHash []byte
	sent      bool
	status    string
	from, to  time.Time
}

type fakeStore struct {
	staff    []Staff
	holidays map[string]bool
	rows     map[string]*vrow
	next     int64
}

func newStore(n int) *fakeStore {
	f := &fakeStore{holidays: map[string]bool{}, rows: map[string]*vrow{}}
	for i := 1; i <= n; i++ {
		f.staff = append(f.staff, Staff{ID: int64(i), Name: "Staf " + string(rune('A'+i-1)), Email: "s" + string(rune('a'+i-1)) + "@example.com"})
	}
	return f
}
func key(id int64, d time.Time) string { return string(rune(id)) + d.Format("2006-01-02") }

func (f *fakeStore) IsHoliday(_ context.Context, d time.Time) (bool, error) {
	return f.holidays[d.Format("2006-01-02")], nil
}
func (f *fakeStore) ActiveStaff(context.Context) ([]Staff, error) { return f.staff, nil }
func (f *fakeStore) CreateVoucher(_ context.Context, v NewVoucher) (int64, bool, error) {
	k := key(v.StaffID, v.Date)
	if _, ok := f.rows[k]; ok {
		return 0, false, nil
	}
	f.next++
	f.rows[k] = &vrow{id: f.next, tokenHash: v.TokenHash, status: "issued", from: v.ValidFrom, to: v.ValidUntil}
	return f.next, true, nil
}
func (f *fakeStore) RotateUnsent(_ context.Context, v NewVoucher) (int64, bool, error) {
	r, ok := f.rows[key(v.StaffID, v.Date)]
	if !ok || r.status != "issued" || r.sent {
		return 0, false, nil
	}
	r.tokenHash = v.TokenHash
	return r.id, true, nil
}
func (f *fakeStore) MarkSent(_ context.Context, id int64) error {
	for _, r := range f.rows {
		if r.id == id {
			r.sent = true
		}
	}
	return nil
}

type fakeMailer struct {
	sent   []mail.Message
	failTo map[string]int // alamat -> berapa kali gagal sebelum berhasil (-1 = selalu gagal)
}

func (m *fakeMailer) Send(_ context.Context, msg mail.Message) error {
	if n, ok := m.failTo[msg.To]; ok && n != 0 {
		if n > 0 {
			m.failTo[msg.To] = n - 1
		}
		return errors.New("smtp: simulasi gagal")
	}
	m.sent = append(m.sent, msg)
	return nil
}

func opts(date string) Options {
	d, _ := time.ParseInLocation("2006-01-02", date, wib)
	return Options{
		Date: d, Location: wib,
		QRKey:    []byte("0123456789abcdef0123456789abcdef"),
		ShortKey: []byte("fedcba9876543210fedcba9876543210"),
		Sleep:    func(time.Duration) {},
		Now:      func() time.Time { return d.Add(9*time.Hour + 55*time.Minute) },
	}
}

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

func TestHariKerjaMembuatDanMengirimSemua(t *testing.T) {
	st, m := newStore(3), &fakeMailer{}
	sum, err := Run(context.Background(), st, m, quiet, opts("2026-11-04")) // Rabu
	if err != nil || sum.Created != 3 || sum.Sent != 3 || sum.Failed != 0 || len(m.sent) != 3 {
		t.Fatalf("sum=%+v err=%v mails=%d", sum, err, len(m.sent))
	}
	for _, r := range st.rows {
		if !r.sent {
			t.Error("email_sent_at harus terisi")
		}
		if r.from.In(wib).Format("15:04") != "10:00" || r.to.In(wib).Format("15:04") != "16:00" {
			t.Errorf("jam berlaku salah: %v - %v", r.from, r.to)
		}
	}
	msg := m.sent[0]
	if !strings.Contains(msg.Subject, "Rabu, 4 Nov 2026") || len(msg.Inline) != 1 || !bytes.HasPrefix(msg.Inline[0].Data, []byte("\x89PNG")) {
		t.Errorf("isi email salah: %q", msg.Subject)
	}
	if !strings.Contains(msg.HTML, "16.00 WIB") {
		t.Error("jam berlaku harus ada di email")
	}
}

func TestAkhirPekanDanLiburDilewati(t *testing.T) {
	st, m := newStore(3), &fakeMailer{}
	if sum, _ := Run(context.Background(), st, m, quiet, opts("2026-11-07")); sum.Skipped != "akhir pekan" || len(m.sent) != 0 { // Sabtu
		t.Fatalf("Sabtu harus dilewati: %+v", sum)
	}
	st.holidays["2026-12-25"] = true
	if sum, _ := Run(context.Background(), st, m, quiet, opts("2026-12-25")); sum.Skipped != "hari libur" || len(m.sent) != 0 {
		t.Fatalf("libur harus dilewati: %+v", sum)
	}
	o := opts("2026-11-07")
	o.Force = true
	if sum, _ := Run(context.Background(), st, m, quiet, o); sum.Sent != 3 {
		t.Fatalf("-force harus mengabaikan akhir pekan: %+v", sum)
	}
}

func TestJalankanUlangTidakMenggandakan(t *testing.T) {
	st, m := newStore(3), &fakeMailer{}
	Run(context.Background(), st, m, quiet, opts("2026-11-04"))
	sum, _ := Run(context.Background(), st, m, quiet, opts("2026-11-04"))
	if sum.AlreadySent != 3 || sum.Sent != 0 || len(m.sent) != 3 || len(st.rows) != 3 {
		t.Fatalf("sum=%+v mails=%d rows=%d", sum, len(m.sent), len(st.rows))
	}
}

func TestEmailGagalLaluDiulangMenggantiToken(t *testing.T) {
	st := newStore(3)
	m := &fakeMailer{failTo: map[string]int{"sb@example.com": -1}}
	sum, _ := Run(context.Background(), st, m, quiet, opts("2026-11-04"))
	if sum.Sent != 2 || sum.Failed != 1 {
		t.Fatalf("sum=%+v", sum)
	}
	oldHash := append([]byte(nil), st.rows[key(2, mustDay("2026-11-04"))].tokenHash...)

	m.failTo = nil // jaringan pulih; job dijalankan ulang
	sum, _ = Run(context.Background(), st, m, quiet, opts("2026-11-04"))
	if sum.Rotated != 1 || sum.Sent != 1 || sum.AlreadySent != 2 || sum.Failed != 0 {
		t.Fatalf("sum=%+v", sum)
	}
	if bytes.Equal(oldHash, st.rows[key(2, mustDay("2026-11-04"))].tokenHash) {
		t.Error("token harus diganti saat dikirim ulang")
	}
}

func TestPercobaanKeduaBerhasil(t *testing.T) {
	st := newStore(1)
	m := &fakeMailer{failTo: map[string]int{"sa@example.com": 1}}
	sum, _ := Run(context.Background(), st, m, quiet, opts("2026-11-04"))
	if sum.Sent != 1 || sum.Failed != 0 {
		t.Fatalf("seharusnya berhasil di percobaan ke-2: %+v", sum)
	}
}

func TestVoucherSudahDipakaiTidakDiganti(t *testing.T) {
	st, m := newStore(1), &fakeMailer{}
	st.rows[key(1, mustDay("2026-11-04"))] = &vrow{id: 99, status: "used", tokenHash: []byte("x")}
	sum, _ := Run(context.Background(), st, m, quiet, opts("2026-11-04"))
	if sum.AlreadySent != 1 || len(m.sent) != 0 {
		t.Fatalf("voucher terpakai tidak boleh diganti/dikirim: %+v", sum)
	}
}

func TestIdDate(t *testing.T) {
	cases := map[string]string{
		"2026-12-25": "Jumat, 25 Des 2026",
		"2027-01-04": "Senin, 4 Jan 2027",
		"2026-08-17": "Senin, 17 Agu 2026",
		"2026-05-01": "Jumat, 1 Mei 2026",
	}
	for in, want := range cases {
		if got := idDate(mustDay(in)); got != want {
			t.Errorf("%s: %q != %q", in, got, want)
		}
	}
}

func mustDay(s string) time.Time {
	d, _ := time.ParseInLocation("2006-01-02", s, wib)
	return d
}
