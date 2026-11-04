// Command issue-vouchers membuat voucher baru untuk semua staf aktif hari ini
// dan mengirim emailnya. Dijalankan terjadwal (systemd timer Senin-Jumat 09.55 WIB);
// untuk uji manual:  go run ./cmd/issue-vouchers -open -print
//
// Exit code 1 jika ada email yang gagal, supaya pemicu jadwal (systemd OnFailure=)
// bisa memberi peringatan ke admin.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "time/tzdata"

	"voucher-kantin/internal/config"
	"voucher-kantin/internal/db"
	"voucher-kantin/internal/issuer"
	"voucher-kantin/internal/mail"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, nil))
	os.Exit(run(log))
}

func run(log *slog.Logger) int {
	var (
		dateFlag = flag.String("date", "", "tanggal voucher YYYY-MM-DD (default: hari ini, WIB)")
		open     = flag.Bool("open", false, "DEV: voucher langsung berlaku sekarang sampai +8 jam, dan abaikan akhir pekan/libur")
		force    = flag.Bool("force", false, "abaikan pengecekan akhir pekan dan hari libur")
		print    = flag.Bool("print", false, "DEV: cetak QR dan kode cadangan ke layar (hanya APP_ENV=dev)")
		delay    = flag.Duration("delay", -1, "jeda antar email (default: 0 di dev, 2s di produksi)")
	)
	flag.Parse()

	if err := config.LoadDotEnv(".env"); err != nil {
		log.Error("baca .env", "err", err)
		return 1
	}
	cfg, err := config.Load()
	if err != nil {
		log.Error("konfigurasi", "err", err)
		return 1
	}
	if *print && cfg.Env != "dev" {
		log.Error("-print hanya boleh dipakai saat APP_ENV=dev")
		return 1
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("database", "err", err)
		return 1
	}
	defer pool.Close()

	mailer, err := mail.New(cfg.Mail, log)
	if err != nil {
		log.Error("email", "err", err)
		return 1
	}

	opt := issuer.Options{
		Location: cfg.Location,
		QRKey:    cfg.QRKey,
		ShortKey: cfg.ShortKey,
		Open:     *open,
		Force:    *force || *open,
		Delay:    *delay,
	}
	if opt.Delay < 0 {
		opt.Delay = 2 * time.Second
		if cfg.Env == "dev" {
			opt.Delay = 0
		}
	}
	if *dateFlag != "" {
		d, err := time.ParseInLocation("2006-01-02", *dateFlag, cfg.Location)
		if err != nil {
			log.Error("format -date salah, pakai YYYY-MM-DD", "err", err)
			return 1
		}
		opt.Date = d
	}
	if *print {
		opt.OnIssued = func(s issuer.Staff, code, payload string) {
			fmt.Printf("dibuat  %-22s kode=%s\n        QR=%s\n", s.Name, code, payload)
		}
	}

	sum, err := issuer.Run(ctx, issuer.PGStore{DB: pool}, mailer, log, opt)
	if err != nil {
		log.Error("job berhenti", "err", err)
		return 1
	}
	if sum.Skipped != "" {
		log.Info("dilewati", "alasan", sum.Skipped)
		return 0
	}
	log.Info("selesai", "staf_aktif", sum.Staff, "dibuat", sum.Created, "token_diganti", sum.Rotated,
		"terkirim", sum.Sent, "sudah_terkirim_sebelumnya", sum.AlreadySent, "gagal", sum.Failed)
	if sum.Failed > 0 {
		return 1
	}
	return 0
}
