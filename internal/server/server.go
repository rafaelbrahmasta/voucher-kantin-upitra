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

	"voucher-kantin/internal/config"
	"voucher-kantin/internal/idfmt"
	"voucher-kantin/internal/master"
	"voucher-kantin/internal/report"
	"voucher-kantin/internal/voucher"
	"voucher-kantin/web"
)

// Antarmuka ke lapisan data; dipenuhi oleh paket voucher dan report, dan oleh
// objek palsu di unit test.
type (
	Pinger interface {
		Ping(ctx context.Context) error
	}
	Scanner interface {
		ScanToken(ctx context.Context, tokenHash []byte, tenantID, userID int64) (voucher.ScanResult, error)
		ScanShortCode(ctx context.Context, codeHash []byte, date time.Time, tenantID, userID int64) (voucher.ScanResult, error)
	}
	Reporter interface {
		Tenant(ctx context.Context, id int64) (report.Tenant, error)
		Tenants(ctx context.Context) ([]report.Tenant, error)
		TenantDay(ctx context.Context, tenantID int64, from, to time.Time) (report.TenantDay, error)
		Summary(ctx context.Context, date time.Time) (report.Summary, error)
		PerTenant(ctx context.Context, date time.Time) ([]report.TenantUsage, error)
		Units(ctx context.Context) ([]string, error)
		Transactions(ctx context.Context, f report.TxFilter) (report.TxPage, error)
	}
)

// Master = data induk yang dikelola admin (tenant, koneksi HP, menu).
type Master interface {
	ListTenants(ctx context.Context) ([]master.TenantRow, error)
	GetTenant(ctx context.Context, id int64) (master.TenantRow, error)
	CreateTenant(ctx context.Context, in master.TenantInput) (int64, error)
	UpdateTenant(ctx context.Context, id int64, in master.TenantInput) error
	DeleteTenant(ctx context.Context, id int64) error
	TenantUser(ctx context.Context, tenantID int64) (int64, error)
	IssueCode(ctx context.Context, tenantID int64) (string, error)
	RevokeDevices(ctx context.Context, tenantID int64) error
	Redeem(ctx context.Context, rawCode string) (master.Session, error)
	SessionValid(ctx context.Context, ss master.Session) (bool, error)
	ListMenu(ctx context.Context, tenantID int64, onlyAvailable bool) ([]master.MenuItem, error)
	CreateMenu(ctx context.Context, tenantID int64, in master.MenuInput) error
	UpdateMenu(ctx context.Context, tenantID, menuID int64, in master.MenuInput) error
	DeleteMenu(ctx context.Context, tenantID, menuID int64) error
	PriceOrder(ctx context.Context, tenantID int64, lines []master.OrderLine) ([]master.PricedLine, error)
	RecordOrder(ctx context.Context, tenantID int64, usedAt time.Time, lines []master.PricedLine) (bool, error)
}

type Deps struct {
	DB      Pinger
	Scanner Scanner
	Reports Reporter
	Master  Master
}

type Server struct {
	cfg   config.Config
	log   *slog.Logger
	deps  Deps
	pages map[string]*template.Template
	now   func() time.Time

	loginLimit *limiter
}

// Setiap halaman = kerangka (base) + isi halaman.
var pageFiles = map[string][]string{
	"home":       {"templates/base.html", "templates/home.html"},
	"scan":       {"templates/tenant.html", "templates/scan.html"},
	"today":      {"templates/tenant.html", "templates/today.html"},
	"admin_home": {"templates/admin.html", "templates/admin_home.html"},
	"admin_tx":   {"templates/admin.html", "templates/admin_tx.html"},

	"masuk":            {"templates/masuk.html"},
	"admin_tenants":    {"templates/admin.html", "templates/admin_tenants.html"},
	"admin_tenant_new": {"templates/admin.html", "templates/admin_tenant_new.html"},
	"admin_tenant":     {"templates/admin.html", "templates/admin_tenant.html"},
}

func New(cfg config.Config, deps Deps, log *slog.Logger) (*Server, error) {
	loc := cfg.Location
	funcs := template.FuncMap{
		"rupiah": idfmt.Rupiah,
		"jam":    func(t time.Time) string { return idfmt.Clock(t.In(loc)) },
		"tgl":    func(t time.Time) string { return idfmt.Date(t.In(loc)) },
		"kode":   master.FormatCode,
	}
	pages := make(map[string]*template.Template, len(pageFiles))
	for name, files := range pageFiles {
		t, err := template.New(name).Funcs(funcs).ParseFS(web.FS, files...)
		if err != nil {
			return nil, fmt.Errorf("template %s: %w", name, err)
		}
		pages[name] = t
	}
	return &Server{cfg: cfg, log: log, deps: deps, pages: pages, now: time.Now, loginLimit: newLoginLimiter()}, nil
}

func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.Recoverer, middleware.Timeout(15*time.Second))
	r.Use(securityHeaders, sameOrigin)

	static, _ := fs.Sub(web.FS, "static")
	r.Handle("/static/*", http.StripPrefix("/static/", http.FileServer(http.FS(static))))
	r.Get("/healthz", s.handleHealth)

	// Sementara semua halaman hanya aktif di mode dev, karena belum ada login:
	// tenant memakai DEV_TENANT_ID, dan dashboard terbuka untuk siapa saja.
	// Login tenant (M6-M7) dan login Microsoft untuk keuangan/admin (M7) menggantikannya.
	if s.cfg.Env == "dev" {
		s.log.Warn("mode dev: halaman tenant dan admin terbuka tanpa login")
		r.Get("/", s.handleHome)
		r.Get("/masuk", s.handleLoginPage)
		r.Post("/masuk", s.handleLogin)
		r.Post("/keluar", s.handleLogout)
		r.Get("/scan", s.handleScanPage)
		r.Get("/today", s.handleToday)
		r.Get("/api/today", s.handleAPIToday)
		r.Get("/api/menu", s.handleAPIMenu)
		r.Post("/api/scan", s.handleScan)
		r.Post("/api/scan/code", s.handleScanCode)
		r.Get("/admin", s.handleAdminHome)
		r.Get("/admin/transaksi", s.handleAdminTx)

		// Admin master: tenant, koneksi HP, menu kantin.
		r.Get("/admin/tenant", s.handleAdminTenants)
		r.Get("/admin/tenant/baru", s.handleAdminTenantNew)
		r.Post("/admin/tenant", s.handleAdminTenantCreate)
		r.Get("/admin/tenant/{id}", s.handleAdminTenantShow)
		r.Post("/admin/tenant/{id}", s.handleAdminTenantUpdate)
		r.Post("/admin/tenant/{id}/hapus", s.handleAdminTenantDelete)
		r.Post("/admin/tenant/{id}/kode", s.handleAdminCode)
		r.Post("/admin/tenant/{id}/putus", s.handleAdminRevoke)
		r.Post("/admin/tenant/{id}/menu", s.handleAdminMenuCreate)
		r.Post("/admin/tenant/{id}/menu/{mid}", s.handleAdminMenuUpdate)
		r.Post("/admin/tenant/{id}/menu/{mid}/hapus", s.handleAdminMenuDelete)
	}
	return r
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "same-origin") // tidak membocorkan alamat ke situs lain, tapi Origin form POST tetap benar
		h.Set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
		h.Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'")
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
	w.Header().Set("Cache-Control", "no-store")
	if err := t.ExecuteTemplate(w, "base", data); err != nil {
		s.log.Error("render", "page", page, "err", err)
	}
}

func (s *Server) fail(w http.ResponseWriter, what string, err error) {
	s.log.Error(what, "err", err)
	http.Error(w, "Terjadi kesalahan saat memuat data. Coba muat ulang halaman.", http.StatusInternalServerError)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// today mengembalikan awal hari ini dan awal besok di zona waktu kampus.
func (s *Server) dayRange(t time.Time) (from, to time.Time) {
	t = t.In(s.cfg.Location)
	from = time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, s.cfg.Location)
	return from, from.AddDate(0, 0, 1)
}

func (s *Server) handleHome(w http.ResponseWriter, r *http.Request) {
	s.render(w, "home", map[string]any{"Title": "Beranda", "Env": s.cfg.Env})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.deps.DB.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "db error"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
