package token

import (
	"bytes"
	"strings"
	"testing"
)

var key = []byte("0123456789abcdef0123456789abcdef")

func TestRoundTrip(t *testing.T) {
	tok, err := New()
	if err != nil || len(tok) != tokenChars {
		t.Fatalf("New: %q %v", tok, err)
	}
	got, err := Parse(key, Payload(key, tok))
	if err != nil || got != tok {
		t.Fatalf("Parse: %q %v", got, err)
	}
}

func TestParseRejects(t *testing.T) {
	tok, _ := New()
	good := Payload(key, tok)
	other, _ := New()
	cases := map[string]string{
		"kosong":        "",
		"prefix salah":  strings.Replace(good, "UPV1", "UPV2", 1),
		"tanpa sig":     Prefix + "." + tok,
		"token diganti": Prefix + "." + other + "." + strings.Split(good, ".")[2],
		"sig rusak":     good[:len(good)-2] + "AA",
		"sampah":        "https://contoh.com",
	}
	for name, p := range cases {
		if _, err := Parse(key, p); err == nil {
			t.Errorf("%s: seharusnya ditolak", name)
		}
	}
	if _, err := Parse([]byte("kunci-lain-kunci-lain-kunci-lain-!!"), good); err == nil {
		t.Error("kunci berbeda seharusnya ditolak")
	}
}

func TestHashStable(t *testing.T) {
	if !bytes.Equal(Hash("abc"), Hash("abc")) || bytes.Equal(Hash("abc"), Hash("abd")) {
		t.Fatal("Hash tidak konsisten")
	}
	if len(Hash("abc")) != 32 {
		t.Fatal("Hash harus 32 byte")
	}
}

func TestShortCode(t *testing.T) {
	c, err := NewShortCode()
	if err != nil || len(c) != 9 || c[4] != '-' {
		t.Fatalf("NewShortCode: %q %v", c, err)
	}
	n, ok := NormalizeShortCode(strings.ToLower(c))
	if !ok || len(n) != 8 {
		t.Fatalf("Normalize: %q %v", n, ok)
	}
	if n2, ok := NormalizeShortCode("k7m-4qxp"); !ok || n2 != "K7M4QXP" {
		// 7 karakter -> harus gagal
		if ok {
			t.Fatalf("7 karakter seharusnya ditolak, dapat %q", n2)
		}
	}
	if n, ok := NormalizeShortCode("OIL0-1111"); !ok || n != "01101111" {
		t.Fatalf("O/I/L harus dipetakan: %q %v", n, ok)
	}
	if _, ok := NormalizeShortCode("UUUU-UUUU"); ok {
		t.Fatal("huruf U tidak ada di alfabet Crockford")
	}
}

func TestShortCodeHashBoundToDate(t *testing.T) {
	a := ShortCodeHash(key, "2026-11-03", "K7M4QXP8")
	b := ShortCodeHash(key, "2026-11-04", "K7M4QXP8")
	if bytes.Equal(a, b) {
		t.Fatal("hash harus berbeda untuk tanggal berbeda")
	}
}
