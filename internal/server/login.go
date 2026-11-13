package server

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"voucher-kantin/internal/master"
)

// Halaman koneksi HP: kasir bisa langsung memilih stan kantin yang dikelola,
// atau memasukkan kode koneksi HP jika diperlukan.
func (s *Server) handleLoginPage(w http.ResponseWriter, r *http.Request) {
	tenants, err := s.deps.Master.ListTenants(r.Context())
	if err != nil {
		s.log.Error("list tenants for login", "err", err)
	}
	var active []master.TenantRow
	for _, t := range tenants {
		if t.Active {
			active = append(active, t)
		}
	}
	s.render(w, "masuk", map[string]any{
		"Title":   "Pilih Stan Kantin",
		"Tenants": active,
	})
}

// handleLoginSelect langsung menghubungkan HP ke stan kantin yang dipilih pedagang.
func (s *Server) handleLoginSelect(w http.ResponseWriter, r *http.Request) {
	if !s.parseForm(w, r) {
		return
	}
	id, err := strconv.ParseInt(r.PostFormValue("tenant_id"), 10, 64)
	if err != nil || id <= 0 {
		http.Redirect(w, r, "/masuk", http.StatusSeeOther)
		return
	}
	ver, err := s.deps.Master.TenantVersion(r.Context(), id)
	if err != nil {
		s.render(w, "masuk", map[string]any{
			"Title": "Pilih Stan Kantin",
			"Error": "Stan tidak aktif atau tidak ditemukan.",
		})
		return
	}
	s.setSession(w, r, master.Session{TenantID: id, Version: ver})
	http.Redirect(w, r, "/scan", http.StatusSeeOther)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !s.parseForm(w, r) {
		return
	}
	now := s.now()
	key := clientKey(r)
	if s.loginLimit.blocked(key, now) {
		w.WriteHeader(http.StatusTooManyRequests)
		s.render(w, "masuk", map[string]any{"Title": "Pilih Stan Kantin", "Error": "Terlalu banyak percobaan. Tunggu satu menit, lalu coba lagi."})
		return
	}
	ss, err := s.deps.Master.Redeem(r.Context(), r.PostFormValue("kode"))
	if errors.Is(err, master.ErrBadCode) {
		s.loginLimit.fail(key, now)
		w.WriteHeader(http.StatusUnprocessableEntity)
		s.render(w, "masuk", map[string]any{"Title": "Pilih Stan Kantin", "Error": "Kode tidak dikenal atau sudah diganti. Minta kode baru ke admin."})
		return
	}
	if err != nil {
		s.fail(w, "masuk", err)
		return
	}
	s.setSession(w, r, ss)
	http.Redirect(w, r, "/scan", http.StatusSeeOther)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	s.clearSession(w, r)
	http.Redirect(w, r, "/masuk", http.StatusSeeOther)
}

func newLoginLimiter() *limiter { return newLimiter(8, time.Minute) }
