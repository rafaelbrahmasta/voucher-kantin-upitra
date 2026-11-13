// Package mail menyediakan antarmuka pengiriman email.
//
// Sekarang: LogMailer (cetak ke log) dan SMTPMailer (Mailpit / Gmail dummy).
// Nanti, saat izin Entra ID turun, cukup tambah GraphMailer yang memenuhi
// antarmuka Mailer yang sama, tanpa mengubah logika voucher.
package mail

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"log/slog"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	stdmail "net/mail"
	"net/smtp"
	"net/textproto"
	"strconv"
	"strings"
	"time"

	"voucher-kantin/internal/config"
)

type InlineImage struct {
	CID         string // dipakai di HTML: <img src="cid:qr">
	ContentType string // mis. image/png
	Data        []byte
}

type Message struct {
	To      string
	Subject string
	HTML    string
	Inline  []InlineImage
}

type Mailer interface {
	Send(ctx context.Context, m Message) error
}

// New memilih implementasi berdasarkan konfigurasi.
func New(cfg config.MailConfig, msCfg config.MSConfig, log *slog.Logger) (Mailer, error) {
	switch cfg.Driver {
	case "log":
		return &LogMailer{Log: log}, nil
	case "smtp":
		if _, err := stdmail.ParseAddress(cfg.From); err != nil {
			return nil, fmt.Errorf("MAIL_FROM tidak valid: %w", err)
		}
		return &SMTPMailer{Host: cfg.Host, Port: cfg.Port, User: cfg.User, Pass: cfg.Pass, From: cfg.From}, nil
	case "graph":
		if msCfg.TenantID == "" || msCfg.ClientID == "" || msCfg.ClientSecret == "" {
			return nil, fmt.Errorf("MAIL_DRIVER=graph membutuhkan MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET")
		}
		if msCfg.MailFrom == "" {
			return nil, fmt.Errorf("MAIL_DRIVER=graph membutuhkan MS_MAIL_FROM (mis. voucher@upitra.ac.id)")
		}
		return &GraphMailer{
			TenantID:     msCfg.TenantID,
			ClientID:     msCfg.ClientID,
			ClientSecret: msCfg.ClientSecret,
			MailFrom:     msCfg.MailFrom,
			Log:          log,
		}, nil
	default:
		return nil, fmt.Errorf("MAIL_DRIVER tidak dikenal: %q (pakai log, smtp, atau graph)", cfg.Driver)
	}
}

// LogMailer tidak mengirim apa pun, hanya mencatat.
type LogMailer struct{ Log *slog.Logger }

func (l *LogMailer) Send(_ context.Context, m Message) error {
	l.Log.Info("email (tidak dikirim, driver=log)", "to", m.To, "subject", m.Subject, "inline", len(m.Inline))
	return nil
}

// SMTPMailer mengirim lewat SMTP. Untuk Gmail: host smtp.gmail.com, port 587,
// dan App Password (bukan password biasa). Untuk Mailpit: localhost:1025 tanpa auth.
type SMTPMailer struct {
	Host string
	Port int
	User string
	Pass string
	From string
}

func (s *SMTPMailer) Send(_ context.Context, m Message) error {
	from, err := stdmail.ParseAddress(s.From)
	if err != nil {
		return err
	}
	raw, err := BuildMIME(from, m, time.Now())
	if err != nil {
		return err
	}
	var auth smtp.Auth
	if s.User != "" {
		auth = smtp.PlainAuth("", s.User, s.Pass, s.Host)
	}
	addr := s.Host + ":" + strconv.Itoa(s.Port)
	// net/smtp tidak mendukung context; timeout bisa ditambahkan nanti jika perlu.
	return smtp.SendMail(addr, auth, from.Address, []string{m.To}, raw)
}

// BuildMIME menyusun email multipart/related: HTML + gambar inline (cid:).
func BuildMIME(from *stdmail.Address, m Message, now time.Time) ([]byte, error) {
	to, err := stdmail.ParseAddress(m.To)
	if err != nil {
		return nil, fmt.Errorf("alamat tujuan tidak valid: %w", err)
	}

	var body bytes.Buffer
	mw := multipart.NewWriter(&body)

	// Bagian HTML (quoted-printable)
	hp, err := mw.CreatePart(textproto.MIMEHeader{
		"Content-Type":              {`text/html; charset="utf-8"`},
		"Content-Transfer-Encoding": {"quoted-printable"},
	})
	if err != nil {
		return nil, err
	}
	qp := quotedprintable.NewWriter(hp)
	if _, err := qp.Write([]byte(m.HTML)); err != nil {
		return nil, err
	}
	if err := qp.Close(); err != nil {
		return nil, err
	}

	// Gambar inline (base64, baris maks 76 karakter)
	for _, img := range m.Inline {
		ip, err := mw.CreatePart(textproto.MIMEHeader{
			"Content-Type":              {img.ContentType},
			"Content-Transfer-Encoding": {"base64"},
			"Content-ID":                {"<" + img.CID + ">"},
			"Content-Disposition":       {`inline; filename="` + img.CID + `.png"`},
		})
		if err != nil {
			return nil, err
		}
		enc := base64.StdEncoding.EncodeToString(img.Data)
		for len(enc) > 76 {
			ip.Write([]byte(enc[:76] + "\r\n"))
			enc = enc[76:]
		}
		ip.Write([]byte(enc + "\r\n"))
	}
	if err := mw.Close(); err != nil {
		return nil, err
	}

	idBytes := make([]byte, 12)
	if _, err := rand.Read(idBytes); err != nil {
		return nil, err
	}
	domain := "localhost"
	if i := strings.LastIndex(from.Address, "@"); i >= 0 {
		domain = from.Address[i+1:]
	}

	var out bytes.Buffer
	h := func(k, v string) { out.WriteString(k + ": " + v + "\r\n") }
	h("From", from.String())
	h("To", to.String())
	h("Subject", mime.QEncoding.Encode("utf-8", m.Subject))
	h("Date", now.Format(time.RFC1123Z))
	h("Message-ID", "<"+hex.EncodeToString(idBytes)+"@"+domain+">")
	h("MIME-Version", "1.0")
	h("Content-Type", `multipart/related; boundary="`+mw.Boundary()+`"`)
	out.WriteString("\r\n")
	out.Write(body.Bytes())
	return out.Bytes(), nil
}
