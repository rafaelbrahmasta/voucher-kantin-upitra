package server

// admin_auth.go — login/logout dan middleware autentikasi untuk portal Admin IT
// dan Biro Keuangan. Menggunakan cookie HMAC-signed terpisah dari sesi tenant.
//
// ⚠ Sementara mendukung password plain text dengan prefix "plain:" untuk kemudahan
// pengembangan. Sebelum produksi, ganti dengan argon2id hash.

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var errNoDB = errors.New("DB bukan pgxpool")

// ───────────────────────── konstanta cookie ──────────────────────────────────

const (
	adminCookie   = "admin_sess"   // cookie untuk portal Admin IT
	financeCookie = "finance_sess" // cookie untuk portal Biro Keuangan
	adminSessTTL  = 8 * time.Hour  // sesi habis setelah 8 jam
)

// ───────────────────────── tipe sesi admin ───────────────────────────────────

type adminSession struct {
	UserID      int64
	DisplayName string
	Role        string // "admin" atau "finance"
}

// ─────────────────────── kunci & tanda tangan cookie ─────────────────────────

func (s *Server) adminSessionKey() []byte {
	m := hmac.New(sha256.New, s.cfg.QRKey)
	m.Write([]byte("admin-session-v1"))
	return m.Sum(nil)
}

func (s *Server) signAdmin(payload string) string {
	m := hmac.New(sha256.New, s.adminSessionKey())
	m.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." +
		base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

func (s *Server) encodeAdminSession(ss adminSession, exp time.Time) string {
	payload := strings.Join([]string{
		strconv.FormatInt(ss.UserID, 10),
		ss.DisplayName,
		ss.Role,
		strconv.FormatInt(exp.Unix(), 10),
	}, "|")
	return s.signAdmin(payload)
}

func (s *Server) decodeAdminSession(v string) (adminSession, bool) {
	i := strings.IndexByte(v, '.')
	if i < 1 {
		return adminSession{}, false
	}
	raw, err := base64.RawURLEncoding.DecodeString(v[:i])
	if err != nil {
		return adminSession{}, false
	}
	if !hmac.Equal([]byte(s.signAdmin(string(raw))), []byte(v)) {
		return adminSession{}, false
	}
	parts := strings.SplitN(string(raw), "|", 4)
	if len(parts) != 4 {
		return adminSession{}, false
	}
	id, err2 := strconv.ParseInt(parts[0], 10, 64)
	if err2 != nil {
		return adminSession{}, false
	}
	exp, err3 := strconv.ParseInt(parts[3], 10, 64)
	if err3 != nil || s.now().Unix() > exp {
		return adminSession{}, false
	}
	return adminSession{UserID: id, DisplayName: parts[1], Role: parts[2]}, true
}

// ─────────────────────── set/clear cookie admin ──────────────────────────────

func (s *Server) setAdminCookie(w http.ResponseWriter, r *http.Request, ss adminSession, cookieName string) {
	exp := s.now().Add(adminSessTTL)
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    s.encodeAdminSession(ss, exp),
		Path:     "/",
		Expires:  exp,
		MaxAge:   int(adminSessTTL.Seconds()),
		HttpOnly: true,
		Secure:   s.isHTTPS(r),
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) clearAdminCookie(w http.ResponseWriter, r *http.Request, cookieName string) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.isHTTPS(r),
		SameSite: http.SameSiteLaxMode,
	})
}

// ──────────────────────── ambil sesi dari cookie ─────────────────────────────

func (s *Server) adminFromCookie(r *http.Request, cookieName string) (adminSession, bool) {
	c, err := r.Cookie(cookieName)
	if err != nil || c.Value == "" {
		return adminSession{}, false
	}
	return s.decodeAdminSession(c.Value)
}

// ─────────────────────── verifikasi password di DB ───────────────────────────

type adminUser struct {
	ID           int64
	DisplayName  string
	Role         string
	PasswordHash string
}

// lookupAdminUser mencari user aktif di DB berdasarkan username dan role.
// Memakai pgxpool.Pool (jackc/pgx) yang dipakai seluruh aplikasi.
func (s *Server) lookupAdminUser(ctx context.Context, username string, role string) (adminUser, error) {
	pool, ok := s.deps.DB.(*pgxpool.Pool)
	if !ok {
		// fallback untuk test (okPinger tidak punya QueryRow)
		return adminUser{}, errNoDB
	}
	const q = `SELECT id, display_name, role::text, password_hash
	             FROM users
	            WHERE username = $1
	              AND role::text = $2
	              AND is_active = true
	              AND password_hash IS NOT NULL`
	var u adminUser
	err := pool.QueryRow(ctx, q, strings.ToLower(username), role).
		Scan(&u.ID, &u.DisplayName, &u.Role, &u.PasswordHash)
	if err != nil {
		return adminUser{}, err
	}
	return u, nil
}

// checkPassword memverifikasi password terhadap hash yang tersimpan.
// Mendukung "plain:<password>" untuk dev; argon2id ditambahkan di M7.
func checkPassword(hash, plain string) bool {
	if strings.HasPrefix(hash, "plain:") {
		return hash[6:] == plain
	}
	// TODO M7: argon2id verify
	return false
}

// ─────────────────────── context key sesi admin ──────────────────────────────

type ctxKeyAdmin struct{}

func withAdminSession(ctx context.Context, ss adminSession) context.Context {
	return context.WithValue(ctx, ctxKeyAdmin{}, ss)
}

func adminSessionFromCtx(ctx context.Context) (adminSession, bool) {
	ss, ok := ctx.Value(ctxKeyAdmin{}).(adminSession)
	return ss, ok
}

// renderAdmin me-render halaman admin/finance dengan menyertakan nama dan peran sesi.
func (s *Server) renderAdmin(w http.ResponseWriter, r *http.Request, page string, data map[string]any) {
	if data == nil {
		data = make(map[string]any)
	}
	if ss, ok := adminSessionFromCtx(r.Context()); ok {
		if data["UserName"] == nil && ss.DisplayName != "" {
			data["UserName"] = ss.DisplayName
		}
		if data["UserRoleDesc"] == nil {
			if ss.Role == "admin" {
				data["UserRoleDesc"] = "Admin Super IT"
			} else if ss.Role == "finance" {
				data["UserRoleDesc"] = "Biro Keuangan"
			}
		}
	}
	s.render(w, page, data)
}

// ──────────────────────── middleware requireAdmin ─────────────────────────────

// requireAdmin memastikan request memiliki cookie sesi Admin IT yang valid.
// Jika tidak, redirect ke /admin/masuk.
func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ss, ok := s.adminFromCookie(r, adminCookie)
		if !ok || ss.Role != "admin" {
			http.Redirect(w, r, "/admin/masuk", http.StatusSeeOther)
			return
		}
		next.ServeHTTP(w, r.WithContext(withAdminSession(r.Context(), ss)))
	})
}

// requireFinance memastikan request memiliki cookie sesi Finance yang valid.
// Jika tidak, redirect ke /finance/masuk.
func (s *Server) requireFinance(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ss, ok := s.adminFromCookie(r, financeCookie)
		if !ok || ss.Role != "finance" {
			http.Redirect(w, r, "/finance/masuk", http.StatusSeeOther)
			return
		}
		next.ServeHTTP(w, r.WithContext(withAdminSession(r.Context(), ss)))
	})
}

// ─────────────────── handler login/logout Admin IT ──────────────────────────

func (s *Server) handleAdminLoginPage(w http.ResponseWriter, r *http.Request) {
	if ss, ok := s.adminFromCookie(r, adminCookie); ok && ss.Role == "admin" {
		http.Redirect(w, r, "/admin", http.StatusSeeOther)
		return
	}
	s.render(w, "admin_login", map[string]any{
		"Title": "Login Admin IT",
		"Error": r.URL.Query().Get("error"),
	})
}

func (s *Server) handleAdminLogin(w http.ResponseWriter, r *http.Request) {
	if !s.parseForm(w, r) {
		return
	}
	username := strings.TrimSpace(r.PostFormValue("username"))
	password := r.PostFormValue("password")

	renderErr := func(msg string) {
		w.WriteHeader(http.StatusUnprocessableEntity)
		s.render(w, "admin_login", map[string]any{
			"Title": "Login Admin IT", "Error": msg,
		})
	}

	u, err := s.lookupAdminUser(r.Context(), username, "admin")
	if err != nil || !checkPassword(u.PasswordHash, password) {
		renderErr("Username atau password salah.")
		return
	}
	// Pastikan sesi portal lain dibersihkan demi pemisahan wewenang
	s.clearAdminCookie(w, r, financeCookie)
	s.setAdminCookie(w, r, adminSession{
		UserID: u.ID, DisplayName: u.DisplayName, Role: u.Role,
	}, adminCookie)
	http.Redirect(w, r, "/admin", http.StatusSeeOther)
}

func (s *Server) handleAdminLogout(w http.ResponseWriter, r *http.Request) {
	s.clearAdminCookie(w, r, adminCookie)
	http.Redirect(w, r, "/admin/masuk", http.StatusSeeOther)
}

// ─────────────────── handler login/logout Finance ───────────────────────────

func (s *Server) handleFinanceLoginPage(w http.ResponseWriter, r *http.Request) {
	if ss, ok := s.adminFromCookie(r, financeCookie); ok && ss.Role == "finance" {
		http.Redirect(w, r, "/finance", http.StatusSeeOther)
		return
	}
	s.render(w, "finance_login", map[string]any{
		"Title": "Login Biro Keuangan",
		"Error": r.URL.Query().Get("error"),
	})
}

func (s *Server) handleFinanceLogin(w http.ResponseWriter, r *http.Request) {
	if !s.parseForm(w, r) {
		return
	}
	username := strings.TrimSpace(r.PostFormValue("username"))
	password := r.PostFormValue("password")

	renderErr := func(msg string) {
		w.WriteHeader(http.StatusUnprocessableEntity)
		s.render(w, "finance_login", map[string]any{
			"Title": "Login Biro Keuangan", "Error": msg,
		})
	}

	u, err := s.lookupAdminUser(r.Context(), username, "finance")
	if err != nil || !checkPassword(u.PasswordHash, password) {
		renderErr("Username atau password salah.")
		return
	}
	// Pastikan sesi portal lain dibersihkan demi pemisahan wewenang
	s.clearAdminCookie(w, r, adminCookie)
	s.setAdminCookie(w, r, adminSession{
		UserID: u.ID, DisplayName: u.DisplayName, Role: u.Role,
	}, financeCookie)
	http.Redirect(w, r, "/finance", http.StatusSeeOther)
}

func (s *Server) handleFinanceLogout(w http.ResponseWriter, r *http.Request) {
	s.clearAdminCookie(w, r, financeCookie)
	http.Redirect(w, r, "/finance/masuk", http.StatusSeeOther)
}
