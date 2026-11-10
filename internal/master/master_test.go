package master

import (
	"errors"
	"strings"
	"testing"
)

func TestParsePrice(t *testing.T) {
	ok := map[string]int{"15000": 15000, "15.000": 15000, "Rp 15.000": 15000, " rp15000 ": 15000, "0": 0, "1,500": 1500}
	for in, want := range ok {
		if got, err := ParsePrice(in); err != nil || got != want {
			t.Errorf("ParsePrice(%q) = %d, %v; want %d", in, got, err, want)
		}
	}
	for _, in := range []string{"", "abc", "-5", "1.5e3", "12 ribu", "99999999999", "1000001"} {
		_, err := ParsePrice(in)
		var ve ValidationError
		if !errors.As(err, &ve) {
			t.Errorf("ParsePrice(%q) harus ValidationError, dapat %v", in, err)
		}
	}
}

func TestKodeKoneksi(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		c, err := NewCode()
		if err != nil {
			t.Fatal(err)
		}
		if len(c) != codeLen || seen[c] {
			t.Fatalf("kode %q salah panjang atau kembar", c)
		}
		seen[c] = true
		if n, ok := NormalizeCode(FormatCode(c)); !ok || n != c {
			t.Fatalf("NormalizeCode(FormatCode(%q)) = %q, %v", c, n, ok)
		}
	}
	for _, bad := range []string{"", "abc", "7M4QXP8RT", "7M4QXP8RTKK", "0M4QXP8RTK", "7M4QXP8RT!", "OOOOOOOOOO"} {
		if _, ok := NormalizeCode(bad); ok {
			t.Errorf("NormalizeCode(%q) harus ditolak", bad)
		}
	}
	if n, ok := NormalizeCode(" 7m4qx-p8rtk "); !ok || n != "7M4QXP8RTK" {
		t.Errorf("huruf kecil, strip, dan spasi harus diterima: %q %v", n, ok)
	}
	if string(hashCode("7M4QXP8RTK")) == string(hashCode("7M4QXP8RTL")) || len(hashCode("A")) != 32 {
		t.Error("hash kode salah")
	}
}

func TestValidasiTenantDanMenu(t *testing.T) {
	ok := TenantInput{Name: "Kantin", Owner: "Bu Sri"}
	bad := map[string]TenantInput{
		"nama kosong":          {Name: "   ", Owner: "Bu Sri"},
		"pemilik kosong":       {Name: "Kantin"},
		"nama > 100":           {Name: strings.Repeat("a", 101), Owner: "x"},
		"stan > 50":            {Name: "K", Owner: "x", Stall: strings.Repeat("a", 51)},
		"pemilik > 150":        {Name: "K", Owner: strings.Repeat("a", 151)},
		"bank > 50":            {Name: "K", Owner: "x", BankName: strings.Repeat("a", 51)},
		"rekening bukan angka": {Name: "K", Owner: "x", BankName: "BCA", BankAccount: "12ab"},
		"rekening > 30":        {Name: "K", Owner: "x", BankName: "BCA", BankAccount: strings.Repeat("1", 31)},
		"rekening tanpa bank":  {Name: "K", Owner: "x", BankAccount: "123"},
	}
	if _, err := ok.clean(); err != nil {
		t.Errorf("input minimal harus sah: %v", err)
	}
	for name, in := range bad {
		var ve ValidationError
		if _, err := in.clean(); !errors.As(err, &ve) {
			t.Errorf("%s: harus ValidationError, dapat %v", name, err)
		}
	}
	// batas persis (sesuai varchar di DDL) harus lolos
	edge := TenantInput{Name: strings.Repeat("a", 100), Owner: strings.Repeat("b", 150), Stall: strings.Repeat("c", 50), BankName: strings.Repeat("d", 50), BankAccount: strings.Repeat("1", 30)}
	if _, err := edge.clean(); err != nil {
		t.Errorf("batas persis harus lolos: %v", err)
	}
	in, err := (TenantInput{Name: "  Kantin   Dev ", Owner: " Bu  Sri ", Stall: " Stan  1 ", BankName: "BCA", BankAccount: "123-456 789"}).clean()
	if err != nil || in.Name != "Kantin Dev" || in.Owner != "Bu Sri" || in.Stall != "Stan 1" || in.BankAccount != "123456789" {
		t.Errorf("spasi dan strip harus dirapikan: %+v %v", in, err)
	}
	if _, _, err := (MenuInput{Name: "Es teh", Price: "x"}).clean(); err == nil {
		t.Error("harga salah harus ditolak")
	}
	if n, p, err := (MenuInput{Name: " Es  teh ", Price: "Rp 4.000"}).clean(); err != nil || n != "Es teh" || p != 4000 {
		t.Errorf("menu = %q %d %v", n, p, err)
	}
}

func TestPriceLines(t *testing.T) {
	menu := []MenuItem{{ID: 1, Name: "Nasi goreng", Price: 15000}, {ID: 2, Name: "Es teh", Price: 4000}}
	got := PriceLines(menu, []OrderLine{
		{MenuID: 2, Qty: 1},
		{MenuID: 1, Qty: 2},
		{MenuID: 2, Qty: 2},  // digabung dengan baris es teh pertama
		{MenuID: 99, Qty: 1}, // bukan menu tenant ini: diabaikan
		{MenuID: 1, Qty: 0},  // qty nol: diabaikan
		{MenuID: 1, Qty: -3}, // qty negatif: diabaikan
	})
	if len(got) != 2 || got[0].MenuID != 2 || got[0].Qty != 3 || got[1].MenuID != 1 || got[1].Qty != 2 {
		t.Fatalf("PriceLines = %+v", got)
	}
	if got[1].Name != "Nasi goreng" || got[1].Price != 15000 {
		t.Error("nama dan harga harus dari menu, bukan dari HP")
	}
	if OrderTotal(got) != 3*4000+2*15000 {
		t.Errorf("total = %d", OrderTotal(got))
	}
	// batas jumlah per menu
	if g := PriceLines(menu, []OrderLine{{MenuID: 1, Qty: 500}}); g[0].Qty != MaxQty {
		t.Errorf("qty harus dibatasi %d, dapat %d", MaxQty, g[0].Qty)
	}
	if g := PriceLines(menu, nil); len(g) != 0 {
		t.Error("tanpa pilihan harus kosong")
	}
	// batas jumlah baris
	many := make([]MenuItem, 0, 50)
	var lines []OrderLine
	for i := 1; i <= 50; i++ {
		many = append(many, MenuItem{ID: int64(i), Name: "m", Price: 1})
		lines = append(lines, OrderLine{MenuID: int64(i), Qty: 1})
	}
	if g := PriceLines(many, lines); len(g) != MaxOrderLen {
		t.Errorf("baris harus dibatasi %d, dapat %d", MaxOrderLen, len(g))
	}
}
