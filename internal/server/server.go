// Package server berisi router HTTP dan handler.
package server

import (
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"io/fs"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"voucher-kantin/internal/config"
	"voucher-kantin/internal/token"
	"voucher-kantin/internal/voucher"
	"voucher-kantin/web"
)

type Server struct {
	cfg      config.Config
	log      *slog.Logger
	pool     *pgxpool.Pool
	vouchers *voucher.Service
	pages    map[string]*template.Template
}

// Daftar halaman. Setiap halaman = base.html + <nama>.html.
var pageNames = []string{"home"}

func New(cfg config.Config, pool *pgxpool.Pool, log *slog.Logger) (*Server, error) {
	pages := make(map[string]*template.Template, len(pageNames))
	for _, n := range pageNames {
		t, err := template.ParseFS(web.FS, "templates/base.html", "templates/"+n+".html")
		if err != nil {
			return nil, fmt.Errorf("template %s: %w", n, err)
		}
		pages[n] = t
	}
	return &Server{cfg: cfg, log: log, pool: pool, vouchers: voucher.NewService(pool), pages: pages}, nil
}

func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.Recoverer, middleware.Timeout(15*time.Second))
	r.Use(securityHeaders)

	static, _ := fs.Sub(web.FS, "static")
	r.Handle("/static/*", http.StripPrefix("/static/", http.FileServer(http.FS(static))))

	r.Get("/", s.handleHome)
	r.Get("/healthz", s.handleHealth)

	// Sementara: scan memakai tenant dev dari konfigurasi. Login tenant
	// (username + password + HP terdaftar) menggantikan ini di minggu 6.
	if s.cfg.Env == "dev" {
		s.log.Warn("mode dev: /api/scan memakai DEV_TENANT_ID tanpa login")
		r.Post("/api/scan", s.handleScan)
		r.Post("/api/scan/code", s.handleScanCode)
	}
	return r
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) render(w http.ResponseWriter, page string, data map[string]any) {
	t, ok := s.pages[page]
	if !ok {
		http.Error(w, "halaman tidak ada", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := t.ExecuteTemplate(w, "base", data); err != nil {
		s.log.Error("render", "page", page, "err", err)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func (s *Server) handleHome(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	s.render(w, "home", map[string]any{"Title": "Beranda", "Env": s.cfg.Env})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.pool.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "db error"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// toLocal mengubah waktu hasil scan ke zona waktu kampus (WIB).
func (s *Server) toLocal(res voucher.ScanResult) voucher.ScanResult {
	if res.At != nil {
		t := res.At.In(s.cfg.Location)
		res.At = &t
	}
	if res.UsedAt != nil {
		t := res.UsedAt.In(s.cfg.Location)
		res.UsedAt = &t
	}
	return res
}

func (s *Server) handleScan(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1024)
	var in struct {
		QR string `json:"qr"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, voucher.ScanResult{Result: "invalid"})
		return
	}
	// Payload palsu ditolak di sini, sebelum menyentuh database.
	tok, err := token.Parse(s.cfg.QRKey, in.QR)
	if err != nil {
		writeJSON(w, http.StatusOK, voucher.ScanResult{Result: "invalid"})
		return
	}
	res, err := s.vouchers.ScanToken(r.Context(), token.Hash(tok), s.cfg.DevTenantID, s.cfg.DevUserID)
	if err != nil {
		s.log.Error("scan", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal memeriksa voucher"})
		return
	}
	writeJSON(w, http.StatusOK, s.toLocal(res))
}

func (s *Server) handleScanCode(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1024)
	var in struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, voucher.ScanResult{Result: "invalid"})
		return
	}
	code, ok := token.NormalizeShortCode(in.Code)
	if !ok {
		writeJSON(w, http.StatusOK, voucher.ScanResult{Result: "invalid"})
		return
	}
	now := time.Now().In(s.cfg.Location)
	date := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	hash := token.ShortCodeHash(s.cfg.ShortKey, date.Format("2006-01-02"), code)

	// TODO (minggu 5): rate limit lebih ketat, maks 10 percobaan gagal per menit per tenant.
	res, err := s.vouchers.ScanShortCode(r.Context(), hash, date, s.cfg.DevTenantID, s.cfg.DevUserID)
	if err != nil {
		s.log.Error("scan code", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal memeriksa voucher"})
		return
	}
	writeJSON(w, http.StatusOK, s.toLocal(res))
}
