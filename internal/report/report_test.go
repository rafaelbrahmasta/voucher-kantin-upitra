package report

import (
	"strings"
	"testing"
	"time"
)

var wib = time.FixedZone("WIB", 7*3600)

func day(s string) time.Time {
	d, _ := time.ParseInLocation("2006-01-02", s, wib)
	return d
}

func TestEscapeLike(t *testing.T) {
	if got := EscapeLike(`50%_a\`); got != `50\%\_a\\` {
		t.Errorf("EscapeLike = %q", got)
	}
}

func TestBuildWhere(t *testing.T) {
	f := TxFilter{From: day("2026-11-02"), To: day("2026-11-04"), TenantID: 2, Unit: "Fakultas Teknik", Q: "rina_"}.normalized()
	w, args := buildWhere(f)
	if len(args) != 5 {
		t.Fatalf("args = %d, want 5 (from, to, tenant, unit, q)", len(args))
	}
	for i := 1; i <= 5; i++ {
		if !strings.Contains(w, "$"+string(rune('0'+i))) {
			t.Errorf("placeholder $%d tidak ada: %s", i, w)
		}
	}
	if strings.Contains(w, "$6") {
		t.Errorf("placeholder berlebih: %s", w)
	}
	// batas atas = awal hari setelah 'To' (inklusif)
	if !args[1].(time.Time).Equal(day("2026-11-05")) {
		t.Errorf("batas atas = %v", args[1])
	}
	if q := args[4].(string); q != `%rina\_%` {
		t.Errorf("pola cari = %q", q)
	}
	// q dipakai dua kali (nama dan NIP) dengan placeholder yang sama
	if !strings.Contains(w, "s.name ILIKE $5 OR s.nip ILIKE $5") {
		t.Errorf("kondisi cari salah: %s", w)
	}
}

func TestBuildWhereMinimal(t *testing.T) {
	w, args := buildWhere(TxFilter{From: day("2026-11-04"), To: day("2026-11-04")}.normalized())
	if len(args) != 2 || strings.Contains(w, "tenant_id") || strings.Contains(w, "unit") {
		t.Errorf("tanpa filter: %s %v", w, args)
	}
}

func TestNormalized(t *testing.T) {
	f := TxFilter{From: day("2026-11-10"), To: day("2026-11-01"), Page: -3, PerPage: 9999}.normalized()
	if f.From.After(f.To) || f.Page != 1 || f.PerPage != maxPerPage {
		t.Errorf("normalized = %+v", f)
	}
	if g := (TxFilter{}).normalized(); g.PerPage != defaultPerPage {
		t.Errorf("default per halaman = %d", g.PerPage)
	}
}

func TestSummaryUnused(t *testing.T) {
	if got := (Summary{Issued: 98, Used: 71, Void: 2}).Unused(); got != 25 {
		t.Errorf("Unused = %d", got)
	}
}
