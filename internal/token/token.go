// Package token membuat dan memvalidasi token QR dan kode pendek voucher.
//
// Payload QR:  UPV1.<token>.<sig>
//
//	token = 16 byte acak (base64url, 22 karakter)
//	sig   = 16 byte pertama HMAC-SHA256(QR_KEY, token) (base64url)
//
// Database hanya menyimpan SHA-256(token), sehingga isi database
// tidak cukup untuk membuat QR yang valid.
package token

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
)

const (
	Prefix     = "UPV1"
	tokenBytes = 16
	sigBytes   = 16
	tokenChars = 22 // panjang base64url (tanpa padding) dari 16 byte
	crockford  = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
	codeLen    = 8
)

var ErrInvalid = errors.New("token: payload tidak valid")

var b64 = base64.RawURLEncoding

// New membuat token acak baru.
func New() (string, error) {
	b := make([]byte, tokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return b64.EncodeToString(b), nil
}

func sign(key []byte, tok string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(tok))
	return m.Sum(nil)[:sigBytes]
}

// Payload menghasilkan isi QR untuk sebuah token.
func Payload(key []byte, tok string) string {
	return Prefix + "." + tok + "." + b64.EncodeToString(sign(key, tok))
}

// Parse memeriksa format dan tanda tangan payload, lalu mengembalikan token.
// Dipanggil sebelum menyentuh database; payload palsu ditolak di sini.
func Parse(key []byte, payload string) (string, error) {
	parts := strings.Split(strings.TrimSpace(payload), ".")
	if len(parts) != 3 || parts[0] != Prefix {
		return "", ErrInvalid
	}
	tok := parts[1]
	if len(tok) != tokenChars {
		return "", ErrInvalid
	}
	got, err := b64.DecodeString(parts[2])
	if err != nil || len(got) != sigBytes {
		return "", ErrInvalid
	}
	if !hmac.Equal(got, sign(key, tok)) { // perbandingan waktu-konstan
		return "", ErrInvalid
	}
	return tok, nil
}

// Hash adalah nilai yang disimpan di database (kolom token_hash).
func Hash(tok string) []byte {
	h := sha256.Sum256([]byte(tok))
	return h[:]
}

// NewShortCode membuat kode cadangan 8 karakter Crockford base32, format XXXX-XXXX.
func NewShortCode() (string, error) {
	b := make([]byte, codeLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	out := make([]byte, codeLen)
	for i, v := range b {
		out[i] = crockford[v&31] // 32 simbol, jadi distribusi seragam
	}
	return string(out[:4]) + "-" + string(out[4:]), nil
}

// NormalizeShortCode merapikan input ketikan tenant: huruf besar, tanpa
// tanda hubung/spasi, I dan L dianggap 1, O dianggap 0.
func NormalizeShortCode(s string) (string, bool) {
	s = strings.ToUpper(s)
	var sb strings.Builder
	for _, r := range s {
		switch r {
		case '-', ' ':
			continue
		case 'I', 'L':
			r = '1'
		case 'O':
			r = '0'
		}
		if !strings.ContainsRune(crockford, r) {
			return "", false
		}
		sb.WriteRune(r)
	}
	out := sb.String()
	if len(out) != codeLen {
		return "", false
	}
	return out, true
}

// ShortCodeHash = HMAC-SHA256(SHORT_KEY, tanggal|kode). code harus sudah dinormalisasi.
func ShortCodeHash(key []byte, date, code string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(date + "|" + code))
	return m.Sum(nil)
}
