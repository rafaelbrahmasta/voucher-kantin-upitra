package idfmt

import (
	"testing"
	"time"
)

func TestDate(t *testing.T) {
	wib := time.FixedZone("WIB", 7*3600)
	cases := map[string]string{
		"2026-12-25": "Jumat, 25 Des 2026",
		"2027-01-04": "Senin, 4 Jan 2027",
		"2026-08-17": "Senin, 17 Agu 2026",
		"2026-05-01": "Jumat, 1 Mei 2026",
	}
	for in, want := range cases {
		d, _ := time.ParseInLocation("2006-01-02", in, wib)
		if got := Date(d); got != want {
			t.Errorf("%s: %q != %q", in, got, want)
		}
	}
}

func TestRupiah(t *testing.T) {
	cases := map[int]string{0: "Rp0", 500: "Rp500", 5000: "Rp5.000", 115000: "Rp115.000", 1234567: "Rp1.234.567", -15000: "-Rp15.000"}
	for in, want := range cases {
		if got := Rupiah(in); got != want {
			t.Errorf("%d: %q != %q", in, got, want)
		}
	}
}

func TestClock(t *testing.T) {
	if got := Clock(time.Date(2026, 11, 4, 9, 5, 0, 0, time.UTC)); got != "09.05" {
		t.Errorf("Clock = %q", got)
	}
}
