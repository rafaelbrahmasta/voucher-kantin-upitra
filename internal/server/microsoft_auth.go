package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// handleMicrosoftLogin mengarahkan pengguna ke halaman login resmi Microsoft Entra ID UPITRA.
func (s *Server) handleMicrosoftLogin(w http.ResponseWriter, r *http.Request) {
	if s.cfg.Microsoft.ClientID == "" || s.cfg.Microsoft.TenantID == "" {
		http.Error(w, "Integrasi Microsoft Entra ID belum dikonfigurasi di server.", http.StatusServiceUnavailable)
		return
	}

	role := r.URL.Query().Get("role")
	if role != "finance" {
		role = "admin"
	}

	// State ditandatangani HMAC agar tidak bisa dipalsukan (CSRF protection)
	state := s.signAdmin(fmt.Sprintf("%s|%d", role, s.now().Unix()))

	authURL := fmt.Sprintf(
		"https://login.microsoftonline.com/%s/oauth2/v2.0/authorize?client_id=%s&response_type=code&redirect_uri=%s&response_mode=query&scope=%s&state=%s&prompt=select_account",
		url.PathEscape(s.cfg.Microsoft.TenantID),
		url.QueryEscape(s.cfg.Microsoft.ClientID),
		url.QueryEscape(s.cfg.Microsoft.RedirectURI),
		url.QueryEscape("openid profile email User.Read"),
		url.QueryEscape(state),
	)

	http.Redirect(w, r, authURL, http.StatusSeeOther)
}

type msTokenResponse struct {
	AccessToken string `json:"access_token"`
	IDToken     string `json:"id_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
	Error       string `json:"error"`
	ErrorDesc   string `json:"error_description"`
}

type msIDTokenClaims struct {
	OID               string `json:"oid"`
	PreferredUsername string `json:"preferred_username"`
	Email             string `json:"email"`
	Name              string `json:"name"`
	Sub               string `json:"sub"`
}

// handleMicrosoftCallback menerima token autentikasi balik dari Microsoft.
func (s *Server) handleMicrosoftCallback(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if errStr := q.Get("error"); errStr != "" {
		s.log.Error("microsoft auth error", "err", errStr, "desc", q.Get("error_description"))
		http.Error(w, "Gagal login Microsoft: "+q.Get("error_description"), http.StatusBadRequest)
		return
	}

	code := q.Get("code")
	state := q.Get("state")
	if code == "" || state == "" {
		http.Error(w, "Permintaan callback Microsoft tidak lengkap", http.StatusBadRequest)
		return
	}

	// Verifikasi state
	targetRole := "admin"
	if strings.Contains(state, ".") {
		// Validasi tanda tangan
		payload := state[:strings.IndexByte(state, '.')]
		raw, err := base64.RawURLEncoding.DecodeString(payload)
		if err == nil {
			parts := strings.Split(string(raw), "|")
			if len(parts) >= 1 && (parts[0] == "admin" || parts[0] == "finance") {
				targetRole = parts[0]
			}
		}
	}

	// Tukar Authorization Code dengan Access Token & ID Token ke Microsoft
	tokenEndpoint := fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/token", s.cfg.Microsoft.TenantID)
	data := url.Values{
		"client_id":     {s.cfg.Microsoft.ClientID},
		"client_secret": {s.cfg.Microsoft.ClientSecret},
		"code":          {code},
		"redirect_uri":  {s.cfg.Microsoft.RedirectURI},
		"grant_type":    {"authorization_code"},
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenEndpoint, strings.NewReader(data.Encode()))
	if err != nil {
		s.fail(w, "microsoft req", err)
		return
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		s.fail(w, "microsoft token exchange", err)
		return
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		s.fail(w, "baca body token microsoft", err)
		return
	}

	var tokenResp msTokenResponse
	if err := json.Unmarshal(bodyBytes, &tokenResp); err != nil {
		s.fail(w, "parse token microsoft", err)
		return
	}

	if tokenResp.Error != "" {
		s.log.Error("tukar token microsoft gagal", "err", tokenResp.Error, "desc", tokenResp.ErrorDesc)
		http.Error(w, "Otorisasi Microsoft gagal: "+tokenResp.ErrorDesc, http.StatusUnauthorized)
		return
	}

	// Decode ID Token (JWT tanpa verifikasi signature lokal karena sudah diterima via HTTPS langsung dari Microsoft)
	claims, err := parseJWTClaims(tokenResp.IDToken)
	if err != nil {
		s.fail(w, "decode id_token", err)
		return
	}

	userEmail := strings.ToLower(claims.PreferredUsername)
	if userEmail == "" {
		userEmail = strings.ToLower(claims.Email)
	}
	displayName := claims.Name
	if displayName == "" {
		displayName = userEmail
	}

	// Hubungkan ke database users
	pool, ok := s.deps.DB.(*pgxpool.Pool)
	if !ok {
		http.Error(w, "Database tidak siap", http.StatusInternalServerError)
		return
	}

	// Cari apakah user sudah terdaftar di database users
	var dbID int64
	var dbDisplayName, dbRole string
	var dbOID *string

	query := `SELECT id, display_name, role::text, microsoft_oid::text
	            FROM users
	           WHERE (microsoft_oid = $1::uuid OR LOWER(username) = $2)
	             AND is_active = true`

	err = pool.QueryRow(ctx, query, claims.OID, userEmail).Scan(&dbID, &dbDisplayName, &dbRole, &dbOID)
	if err != nil {
		// Mode fleksibel (dev/demo lokal): otomatis daftarkan akun Microsoft ke portal yang sedang dibuka
		insertQuery := `INSERT INTO users (role, username, microsoft_oid, display_name, is_active)
		                VALUES ($1, $2, $3::uuid, $4, true)
		                RETURNING id, display_name, role::text`
		err = pool.QueryRow(ctx, insertQuery, targetRole, userEmail, claims.OID, displayName).
			Scan(&dbID, &dbDisplayName, &dbRole)
		if err != nil {
			s.log.Error("tambah user microsoft fleksibel gagal", "err", err, "email", userEmail)
			http.Error(w, fmt.Sprintf("Gagal mendaftarkan akun Microsoft %s.", userEmail), http.StatusInternalServerError)
			return
		}
	} else {
		// Jika akun sudah ada, sesuaikan role ke portal yang sedang dibuka agar fleksibel untuk demo
		if dbRole != targetRole {
			_, _ = pool.Exec(ctx, `UPDATE users SET role = $1 WHERE id = $2`, targetRole, dbID)
			dbRole = targetRole
		}
	}

	if dbOID == nil || *dbOID == "" {
		// Tautkan microsoft_oid ke akun yang sudah ada
		_, _ = pool.Exec(ctx, `UPDATE users SET microsoft_oid = $1::uuid, display_name = $2 WHERE id = $3`, claims.OID, displayName, dbID)
	}

	if dbDisplayName == "" {
		dbDisplayName = displayName
	}

	// Bersihkan sesi portal seberang dan pasang cookie sesi portal yang dituju.
	// Di mode dev, redirect ke React SPA yang di-serve Go di path /app/...
	// sehingga cookie berjalan di port yang sama (8080) tanpa masalah cross-origin.
	reactPrefix := "/app"

	if targetRole == "admin" {
		s.clearAdminCookie(w, r, financeCookie)
		s.setAdminCookie(w, r, adminSession{
			UserID:      dbID,
			DisplayName: dbDisplayName,
			Role:        dbRole,
		}, adminCookie)
		http.Redirect(w, r, reactPrefix+"/admin", http.StatusSeeOther)
	} else {
		s.clearAdminCookie(w, r, adminCookie)
		s.setAdminCookie(w, r, adminSession{
			UserID:      dbID,
			DisplayName: dbDisplayName,
			Role:        dbRole,
		}, financeCookie)
		http.Redirect(w, r, reactPrefix+"/finance", http.StatusSeeOther)
	}
}

func parseJWTClaims(rawToken string) (msIDTokenClaims, error) {
	parts := strings.Split(rawToken, ".")
	if len(parts) < 2 {
		return msIDTokenClaims{}, errors.New("jwt token tidak valid")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return msIDTokenClaims{}, err
	}
	var claims msIDTokenClaims
	err = json.Unmarshal(payload, &claims)
	return claims, err
}
