package mail

import (
	"bytes"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	stdmail "net/mail"
	"strings"
	"testing"
	"time"
)

func TestBuildMIME(t *testing.T) {
	from, _ := stdmail.ParseAddress("Voucher Kantin UPITRA <voucher@example.com>")
	png := bytes.Repeat([]byte{0x89, 'P', 'N', 'G', 1, 2, 3}, 40) // > 76 karakter base64
	m := Message{
		To:      "rina@example.com",
		Subject: "Voucher kantin · Selasa, 3 Nov 2026",
		HTML:    `<p>Halo <b>Dr. Rina</b></p><img src="cid:qr">`,
		Inline:  []InlineImage{{CID: "qr", ContentType: "image/png", Data: png}},
	}
	raw, err := BuildMIME(from, m, time.Date(2026, 11, 3, 10, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	msg, err := stdmail.ReadMessage(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	if got := msg.Header.Get("To"); !strings.Contains(got, "rina@example.com") {
		t.Errorf("To = %q", got)
	}
	subj, err := new(mime.WordDecoder).DecodeHeader(msg.Header.Get("Subject"))
	if err != nil || subj != m.Subject {
		t.Errorf("Subject = %q (%v)", subj, err)
	}
	mt, params, err := mime.ParseMediaType(msg.Header.Get("Content-Type"))
	if err != nil || mt != "multipart/related" {
		t.Fatalf("content-type = %q %v", mt, err)
	}
	mr := multipart.NewReader(msg.Body, params["boundary"])

	p1, err := mr.NextPart()
	if err != nil {
		t.Fatal(err)
	}
	html, _ := io.ReadAll(quotedprintable.NewReader(p1))
	if string(html) != m.HTML {
		t.Errorf("HTML berbeda: %q", html)
	}

	p2, err := mr.NextPart()
	if err != nil {
		t.Fatal(err)
	}
	if p2.Header.Get("Content-ID") != "<qr>" {
		t.Errorf("Content-ID = %q", p2.Header.Get("Content-ID"))
	}
	b64, _ := io.ReadAll(p2)
	dec, err := decodeB64(string(b64))
	if err != nil || !bytes.Equal(dec, png) {
		t.Errorf("gambar tidak sama setelah decode (err=%v)", err)
	}
	if _, err := mr.NextPart(); err != io.EOF {
		t.Errorf("seharusnya hanya 2 bagian, err=%v", err)
	}
}

func TestBuildMIMEBadRecipient(t *testing.T) {
	from, _ := stdmail.ParseAddress("a@b.id")
	if _, err := BuildMIME(from, Message{To: "bukan-email"}, time.Now()); err == nil {
		t.Fatal("alamat salah seharusnya ditolak")
	}
}
