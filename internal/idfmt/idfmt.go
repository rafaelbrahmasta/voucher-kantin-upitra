// Package idfmt memformat tanggal, jam, dan rupiah dengan gaya Indonesia.
package idfmt

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

var (
	hari  = [...]string{"Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"}
	bulan = [...]string{"Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"}
)

// Date: "Rabu, 4 Nov 2026"
func Date(t time.Time) string {
	return fmt.Sprintf("%s, %d %s %d", hari[t.Weekday()], t.Day(), bulan[t.Month()-1], t.Year())
}

// Clock: "12.14" (titik, seperti di mockup)
func Clock(t time.Time) string { return t.Format("15.04") }

// Rupiah: "Rp115.000"
func Rupiah(n int) string {
	neg := n < 0
	if neg {
		n = -n
	}
	s := strconv.Itoa(n)
	var parts []string
	for len(s) > 3 {
		parts = append([]string{s[len(s)-3:]}, parts...)
		s = s[:len(s)-3]
	}
	parts = append([]string{s}, parts...)
	out := "Rp" + strings.Join(parts, ".")
	if neg {
		out = "-" + out
	}
	return out
}
