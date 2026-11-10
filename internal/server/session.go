package server

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"voucher-kantin/internal/master"
)

const (
	sessionCookie = "tenant_sess"
	sessionTTL    = 30 * 24 * time.Hour
)

// sessionKey diturunkan dari QR_KEY, jadi tidak perlu variabel konfigurasi baru.
func (s *Server) sessionKey() []byte {
	m := hmac.New(sha256.New, s.cfg.QRKey)
	m.Write([]byte("tenant-session-v1"))
	return m.Sum(nil)
}

func (s *Server) sign(payload string) string {
	m := hmac.New(sha256.New, s.sessionKey())
	m.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

// encodeSession: "tenantID:versi:kedaluwarsa" bertanda tangan HMAC.
func (s *Server) encodeSession(ss master.Session, exp time.Time) string {
	return s.sign(strconv.FormatInt(ss.TenantID, 10) + ":" + strconv.Itoa(ss.Version) + ":" + strconv.FormatInt(exp.Unix(), 10))
}

func (s *Server) decodeSession(v string) (master.Session, bool) {
	i := strings.IndexByte(v, '.')
	if i < 1 {
		return master.Session{}, false
	}
	raw, err := base64.RawURLEncoding.DecodeString(v[:i])
	if err != nil {
		return master.Session{}, false
	}
	if !hmac.Equal([]byte(s.sign(string(raw))), []byte(v)) {
		return master.Session{}, false
	}
	parts := strings.Split(string(raw), ":")
	if len(parts) != 3 {
		return master.Session{}, false
	}
	id, e1 := strconv.ParseInt(parts[0], 10, 64)
	ver, e2 := strconv.Atoi(parts[1])
	exp, e3 := strconv.ParseInt(parts[2], 10, 64)
	if e1 != nil || e2 != nil || e3 != nil || s.now().Unix() > exp {
		return master.Session{}, false
	}
	return master.Session{TenantID: id, Version: ver}, true
}

func (s *Server) isHTTPS(r *http.Request) bool {
	return r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
}

func (s *Server) setSession(w http.ResponseWriter, r *http.Request, ss master.Session) {
	exp := s.now().Add(sessionTTL)
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: s.encodeSession(ss, exp), Path: "/",
		Expires: exp, MaxAge: int(sessionTTL.Seconds()),
		HttpOnly: true, Secure: s.isHTTPS(r), SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) clearSession(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: s.isHTTPS(r), SameSite: http.SameSiteLaxMode,
	})
}

// tenantID menentukan tenant pemilik HP ini.
//   - Ada cookie: harus sah (tanda tangan, belum kedaluwarsa, versi cocok, tenant aktif).
//     Jika tidak, cookie dihapus dan HP dianggap belum masuk.
//   - Tidak ada cookie: hanya mode dev yang memakai DEV_TENANT_ID.
func (s *Server) tenantID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	if c, err := r.Cookie(sessionCookie); err == nil && c.Value != "" {
		ss, ok := s.decodeSession(c.Value)
		if ok {
			valid, err := s.deps.Master.SessionValid(r.Context(), ss)
			if err != nil {
				s.log.Error("cek sesi", "err", err)
				return 0, false
			}
			ok = valid
		}
		if !ok {
			s.clearSession(w, r)
			return 0, false
		}
		return ss.TenantID, true
	}
	if s.cfg.Env == "dev" && s.cfg.DevTenantID > 0 {
		return s.cfg.DevTenantID, true
	}
	return 0, false
}

// ---------- pembatas percobaan kode ----------

// limiter membatasi percobaan kode salah per alamat (memori saja, cukup untuk satu server).
type limiter struct {
	mu   sync.Mutex
	max  int
	win  time.Duration
	hits map[string][]time.Time
}

func newLimiter(max int, win time.Duration) *limiter {
	return &limiter{max: max, win: win, hits: map[string][]time.Time{}}
}

func (l *limiter) prune(key string, now time.Time) []time.Time {
	var keep []time.Time
	for _, t := range l.hits[key] {
		if now.Sub(t) < l.win {
			keep = append(keep, t)
		}
	}
	if len(keep) == 0 {
		delete(l.hits, key)
	} else {
		l.hits[key] = keep
	}
	return keep
}

func (l *limiter) blocked(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.prune(key, now)) >= l.max
}

func (l *limiter) fail(key string, now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.hits[key] = append(l.prune(key, now), now)
}

func clientKey(r *http.Request) string {
	h, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return h
}

// sameOrigin menolak POST dari situs lain (perlindungan CSRF dasar sampai M10).
//
// Urutan keputusan:
//  1. Sec-Fetch-Site (dikirim semua browser modern, dihitung oleh browser sendiri, jadi
//     tidak terpengaruh tunnel/proxy): hanya "same-origin" dan "none" yang lolos.
//  2. Tanpa Sec-Fetch-Site (browser lama): Origin harus sama dengan Host (atau
//     X-Forwarded-Host). Origin "null" ditolak di jalur ini.
//  3. Tanpa keduanya (curl, Postman, tes): lolos; tidak ada cookie yang dibawa browser.
//
// Origin "null" tidak boleh dipakai sebagai tanda serangan di jalur 1: browser mengirimnya
// pada form POST biasa bila Referrer-Policy adalah no-referrer.
func sameOrigin(next http.Handler) http.Handler {
	deny := func(w http.ResponseWriter) {
		http.Error(w, "permintaan ditolak (bukan dari situs ini)", http.StatusForbidden)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			next.ServeHTTP(w, r)
			return
		}
		if sfs := r.Header.Get("Sec-Fetch-Site"); sfs != "" {
			if sfs != "same-origin" && sfs != "none" {
				deny(w)
				return
			}
			next.ServeHTTP(w, r)
			return
		}
		if o := r.Header.Get("Origin"); o != "" {
			u, err := url.Parse(o)
			if err != nil || u.Host == "" || (u.Host != r.Host && u.Host != r.Header.Get("X-Forwarded-Host")) {
				deny(w)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
