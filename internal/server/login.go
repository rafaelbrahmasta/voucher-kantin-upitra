package server

import (
	"errors"
	"net/http"
	"time"

	"voucher-kantin/internal/master"
)

// Halaman koneksi HP: tenant memasukkan kode dari admin (atau memindai QR di layar admin,
// yang membuka /masuk#KODE sehingga kolom kode terisi otomatis lewat masuk.js).
func (s *Server) handleLoginPage(w http.ResponseWriter, r *http.Request) {
	s.render(w, "masuk", map[string]any{"Title": "Hubungkan HP"})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !s.parseForm(w, r) {
		return
	}
	now := s.now()
	key := clientKey(r)
	if s.loginLimit.blocked(key, now) {
		w.WriteHeader(http.StatusTooManyRequests)
		s.render(w, "masuk", map[string]any{"Title": "Hubungkan HP", "Error": "Terlalu banyak percobaan. Tunggu satu menit, lalu coba lagi."})
		return
	}
	ss, err := s.deps.Master.Redeem(r.Context(), r.PostFormValue("kode"))
	if errors.Is(err, master.ErrBadCode) {
		s.loginLimit.fail(key, now)
		w.WriteHeader(http.StatusUnprocessableEntity)
		s.render(w, "masuk", map[string]any{"Title": "Hubungkan HP", "Error": "Kode tidak dikenal atau sudah diganti. Minta kode baru ke admin."})
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
