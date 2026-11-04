// Package config membaca konfigurasi dari environment (dan file .env saat pengembangan).
package config

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type MailConfig struct {
	Driver string // "log" atau "smtp"
	From   string
	Host   string
	Port   int
	User   string
	Pass   string
}

type Config struct {
	Env         string // "dev" atau "prod"
	Addr        string
	DatabaseURL string
	QRKey       []byte
	ShortKey    []byte
	Location    *time.Location
	Mail        MailConfig

	// Hanya dipakai di mode dev sampai login tenant selesai dibangun.
	DevTenantID int64
	DevUserID   int64
}

// LoadDotEnv membaca file .env sederhana (KEY=VALUE). Variabel yang sudah
// ada di environment tidak ditimpa. File yang tidak ada diabaikan.
func LoadDotEnv(path string) error {
	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		v = strings.Trim(strings.TrimSpace(v), `"'`)
		if _, exists := os.LookupEnv(k); !exists {
			os.Setenv(k, v)
		}
	}
	return sc.Err()
}

func getenv(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

func getint(key string, def int64) (int64, error) {
	s := os.Getenv(key)
	if s == "" {
		return def, nil
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%s harus angka: %w", key, err)
	}
	return n, nil
}

func Load() (Config, error) {
	var c Config
	c.Env = getenv("APP_ENV", "dev")
	c.Addr = getenv("APP_ADDR", ":8080")
	c.DatabaseURL = os.Getenv("DATABASE_URL")
	if c.DatabaseURL == "" {
		return c, errors.New("DATABASE_URL wajib diisi")
	}

	qr, short := os.Getenv("QR_KEY"), os.Getenv("SHORT_KEY")
	if len(qr) < 32 || len(short) < 32 {
		return c, errors.New("QR_KEY dan SHORT_KEY wajib diisi, minimal 32 karakter")
	}
	c.QRKey, c.ShortKey = []byte(qr), []byte(short)

	loc, err := time.LoadLocation(getenv("TZ_NAME", "Asia/Jakarta"))
	if err != nil {
		return c, fmt.Errorf("zona waktu tidak valid: %w", err)
	}
	c.Location = loc

	port, err := getint("SMTP_PORT", 1025)
	if err != nil {
		return c, err
	}
	c.Mail = MailConfig{
		Driver: getenv("MAIL_DRIVER", "log"),
		From:   getenv("MAIL_FROM", "Voucher Kantin UPITRA <voucher@example.com>"),
		Host:   getenv("SMTP_HOST", "localhost"),
		Port:   int(port),
		User:   os.Getenv("SMTP_USER"),
		Pass:   os.Getenv("SMTP_PASS"),
	}

	if c.DevTenantID, err = getint("DEV_TENANT_ID", 1); err != nil {
		return c, err
	}
	if c.DevUserID, err = getint("DEV_TENANT_USER_ID", 1); err != nil {
		return c, err
	}
	return c, nil
}
