package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"voucher-kantin/internal/config"
	"voucher-kantin/internal/report"
	"voucher-kantin/internal/token"
	"voucher-kantin/internal/voucher"
)

var (
	wib    = time.FixedZone("WIB", 7*3600)
	qrKey  = []byte("0123456789abcdef0123456789abcdef")
	shKey  = []byte("fedcba9876543210fedcba9876543210")
	nowFix = time.Date(2026, 11, 4, 12, 20, 0, 0, wib)
)

type fakeScanner struct {
	calls    int
	gotHash  []byte
	gotCode  []byte
	gotDate  time.Time
	tenantID int64
	userID   int64
	reply    voucher.ScanResult
}

func (f *fakeScanner) ScanToken(_ context.Context, h []byte, tenantID, userID int64) (voucher.ScanResult, error) {
	f.calls++
	f.gotHash, f.tenantID, f.userID = h, tenantID, userID
	return f.reply, nil
}
func (f *fakeScanner) ScanShortCode(_ context.Context, h []byte, d time.Time, tenantID, userID int64) (voucher.ScanResult, error) {
	f.calls++
	f.gotCode, f.gotDate, f.tenantID, f.userID = h, d, tenantID, userID
	return f.reply, nil
}

type fakeReports struct {
	txFilter report.TxFilter
	txCalls  int
	summary  report.Summary
	dayFrom  time.Time
}

func (f *fakeReports) Tenant(_ context.Context, id int64) (report.Tenant, error) {
	return report.Tenant{ID: id, Name: "Kantin Dev", Stall: "Stan 1"}, nil
}
func (f *fakeReports) Tenants(context.Context) ([]report.Tenant, error) {
	return []report.Tenant{{ID: 1, Name: "Kantin Dev"}, {ID: 2, Name: "Warung Dev 2"}}, nil
}
func (f *fakeReports) TenantDay(_ context.Context, _ int64, from, _ time.Time) (report.TenantDay, error) {
	f.dayFrom = from
	return report.TenantDay{Count: 2, Total: 10000, Scans: []report.Scan{
		{At: time.Date(2026, 11, 4, 12, 14, 0, 0, wib), Staff: "Dr. Rina Kusuma", Unit: "Fakultas Teknik", Amount: 5000},
		{At: time.Date(2026, 11, 4, 11, 47, 0, 0, wib), Staff: "Budi Hartono, S.T.", Unit: "Biro Umum", Amount: 5000, Voided: true},
	}}, nil
}
func (f *fakeReports) Summary(context.Context, time.Time) (report.Summary, error) {
	return f.summary, nil
}
func (f *fakeReports) PerTenant(context.Context, time.Time) ([]report.TenantUsage, error) {
	return []report.TenantUsage{{Name: "Kantin Dev", Count: 14, Amount: 70000}, {Name: "Warung Dev 2", Count: 11, Amount: 55000}}, nil
}
func (f *fakeReports) Units(context.Context) ([]string, error) {
	return []string{"Fakultas Ekonomi", "Fakultas Teknik"}, nil
}
func (f *fakeReports) Transactions(_ context.Context, fl report.TxFilter) (report.TxPage, error) {
	f.txFilter = fl
	f.txCalls++
	return report.TxPage{Total: 120, Page: 2, Pages: 3, Rows: []report.Tx{
		{At: time.Date(2026, 11, 4, 12, 14, 0, 0, wib), Staff: "Dr. Rina Kusuma", Unit: "Fakultas Teknik", Tenant: "Kantin Dev", Amount: 5000},
		{At: time.Date(2026, 11, 4, 11, 47, 0, 0, wib), Staff: "Budi Hartono, S.T.", Unit: "Biro Umum", Tenant: "Kantin Dev", Amount: 5000, Voided: true},
	}}, nil
}

type okPinger struct{}

func (okPinger) Ping(context.Context) error { return nil }

func newTestServer(t *testing.T, env string) (http.Handler, *fakeScanner, *fakeReports) {
	t.Helper()
	sc := &fakeScanner{}
	rp := &fakeReports{summary: report.Summary{Issued: 98, Used: 71, Void: 2, Amount: 355000, Inactive: 2}}
	cfg := config.Config{Env: env, QRKey: qrKey, ShortKey: shKey, Location: wib, DevTenantID: 1, DevUserID: 1}
	s, err := New(cfg, Deps{DB: okPinger{}, Scanner: sc, Reports: rp, Master: newFakeMaster()}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	s.now = func() time.Time { return nowFix }
	return s.Handler(), sc, rp
}

func get(h http.Handler, path string) (int, string, http.Header) {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
	return rec.Code, rec.Body.String(), rec.Header()
}

// getWithAdminCookie melakukan GET dengan cookie sesi Admin IT yang valid (untuk test).
func getWithAdminCookie(h http.Handler, s *Server, path string) (int, string, http.Header) {
	ss := adminSession{UserID: 1, DisplayName: "Admin Test", Role: "admin"}
	val := s.encodeAdminSession(ss, s.now().Add(adminSessTTL))
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", path, nil)
	req.AddCookie(&http.Cookie{Name: adminCookie, Value: val})
	h.ServeHTTP(rec, req)
	return rec.Code, rec.Body.String(), rec.Header()
}

// getWithFinanceCookie melakukan GET dengan cookie sesi Finance yang valid (untuk test).
func getWithFinanceCookie(h http.Handler, s *Server, path string) (int, string, http.Header) {
	ss := adminSession{UserID: 2, DisplayName: "Finance Test", Role: "finance"}
	val := s.encodeAdminSession(ss, s.now().Add(adminSessTTL))
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", path, nil)
	req.AddCookie(&http.Cookie{Name: financeCookie, Value: val})
	h.ServeHTTP(rec, req)
	return rec.Code, rec.Body.String(), rec.Header()
}

func post(h http.Handler, path, body string) (int, map[string]any) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec, req)
	var out map[string]any
	json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

func mustContain(t *testing.T, body string, parts ...string) {
	t.Helper()
	for _, p := range parts {
		if !strings.Contains(body, p) {
			t.Errorf("halaman tidak memuat %q", p)
		}
	}
}

// newTestServerRaw mengembalikan *Server sekaligus handler (untuk test yang butuh cookie).
func newTestServerRaw(t *testing.T, env string) (*Server, http.Handler, *fakeScanner, *fakeReports) {
	t.Helper()
	sc := &fakeScanner{}
	rp := &fakeReports{summary: report.Summary{Issued: 98, Used: 71, Void: 2, Amount: 355000, Inactive: 2}}
	cfg := config.Config{Env: env, QRKey: qrKey, ShortKey: shKey, Location: wib, DevTenantID: 1, DevUserID: 1}
	s, err := New(cfg, Deps{DB: okPinger{}, Scanner: sc, Reports: rp, Master: newFakeMaster()}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	s.now = func() time.Time { return nowFix }
	return s, s.Handler(), sc, rp
}

// ─────────────────────── TEST HALAMAN PUBLIK (dev) ───────────────────────────

func TestSemuaHalamanTampil(t *testing.T) {
	sv, h, _, _ := newTestServerRaw(t, "dev")

	// Halaman publik / tenant (tidak butuh auth)
	for _, p := range []string{
		"/", "/scan", "/today", "/healthz",
		"/static/app.css", "/static/scan.js", "/static/admin.css", "/static/masuk.js",
		"/masuk", "/api/menu",
	} {
		if code, _, _ := get(h, p); code != 200 {
			t.Errorf("GET %s = %d", p, code)
		}
	}

	// Halaman login admin & finance (tidak butuh auth)
	for _, p := range []string{"/admin/masuk", "/finance/masuk"} {
		if code, _, _ := get(h, p); code != 200 {
			t.Errorf("GET %s = %d", p, code)
		}
	}

	// Halaman yang butuh cookie Admin IT
	for _, p := range []string{
		"/admin", "/admin/transaksi", "/admin/pengguna",
		"/admin/tenant", "/admin/tenant/baru", "/admin/tenant/1",
	} {
		if code, _, _ := getWithAdminCookie(h, sv, p); code != 200 {
			t.Errorf("GET %s (dengan cookie admin) = %d", p, code)
		}
	}

	// Halaman yang butuh cookie Finance
	for _, p := range []string{"/finance", "/finance/pencairan", "/finance/transaksi"} {
		if code, _, _ := getWithFinanceCookie(h, sv, p); code != 200 {
			t.Errorf("GET %s (dengan cookie finance) = %d", p, code)
		}
	}
}

func TestAdminTanpaCookieRedirectKeLogin(t *testing.T) {
	h, _, _ := newTestServer(t, "dev")
	for _, p := range []string{"/admin", "/admin/transaksi", "/admin/pengguna", "/admin/tenant"} {
		code, _, hd := get(h, p)
		if code != 302 && code != 303 {
			t.Errorf("GET %s tanpa cookie = %d (harus redirect)", p, code)
		}
		if loc := hd.Get("Location"); loc != "/admin/masuk" {
			t.Errorf("GET %s redirect ke %q, harus /admin/masuk", p, loc)
		}
	}
}

func TestFinanceTanpaCookieRedirectKeLogin(t *testing.T) {
	h, _, _ := newTestServer(t, "dev")
	for _, p := range []string{"/finance", "/finance/transaksi", "/finance/pencairan"} {
		code, _, hd := get(h, p)
		if code != 302 && code != 303 {
			t.Errorf("GET %s tanpa cookie = %d (harus redirect)", p, code)
		}
		if loc := hd.Get("Location"); loc != "/finance/masuk" {
			t.Errorf("GET %s redirect ke %q, harus /finance/masuk", p, loc)
		}
	}
}

func TestHalamanScan(t *testing.T) {
	h, _, rp := newTestServer(t, "dev")
	_, body, hd := get(h, "/scan")
	mustContain(t, body, "Kantin Dev", "Stan 1", "2 · Rp10.000", "Ketik kode cadangan", "/static/scan.js", `id="video"`, `id="result"`)
	if csp := hd.Get("Content-Security-Policy"); !strings.Contains(csp, "default-src 'self'") {
		t.Errorf("CSP = %q", csp)
	}
	if hd.Get("Permissions-Policy") == "" || hd.Get("Cache-Control") != "no-store" {
		t.Error("header keamanan/cache kurang")
	}
	// "hari ini" dihitung dari awal hari WIB, bukan UTC
	if rp.dayFrom.In(wib).Format("2006-01-02 15:04") != "2026-11-04 00:00" {
		t.Errorf("awal hari = %v", rp.dayFrom)
	}
	if strings.Contains(body, " style=") || strings.Contains(body, "<script>") {
		t.Error("tidak boleh ada style/script inline (CSP)")
	}
}

func TestHalamanHariIni(t *testing.T) {
	h, _, _ := newTestServer(t, "dev")
	_, body, _ := get(h, "/today")
	mustContain(t, body, "Rabu, 4 Nov 2026", "Dr. Rina Kusuma", "12.14", "Rp5.000", "Dibatalkan", `class="void"`, "Rp10.000")
}

func TestAPIToday(t *testing.T) {
	h, _, _ := newTestServer(t, "dev")
	_, body, _ := get(h, "/api/today")
	if !strings.Contains(body, `"count":2`) || !strings.Contains(body, `"total":10000`) {
		t.Errorf("api today = %s", body)
	}
}

func TestScanQRValid(t *testing.T) {
	h, sc, _ := newTestServer(t, "dev")
	at := time.Date(2026, 11, 4, 5, 14, 3, 0, time.UTC) // 12.14 WIB
	sc.reply = voucher.ScanResult{Result: "ok", Staff: "Dr. Rina Kusuma", Unit: "Fakultas Teknik", Amount: 5000, At: &at}
	tok, _ := token.New()
	code, out := post(h, "/api/scan", `{"qr":"`+token.Payload(qrKey, tok)+`"}`)
	if code != 200 || out["result"] != "ok" || out["staff"] != "Dr. Rina Kusuma" {
		t.Fatalf("%d %v", code, out)
	}
	if !strings.HasPrefix(out["at"].(string), "2026-11-04T12:14:03+07:00") {
		t.Errorf("waktu harus dalam WIB: %v", out["at"])
	}
	if string(sc.gotHash) != string(token.Hash(tok)) || sc.tenantID != 1 {
		t.Error("hash token atau tenant salah dikirim ke database")
	}
}

func TestScanQRPalsuTidakMenyentuhDatabase(t *testing.T) {
	h, sc, _ := newTestServer(t, "dev")
	tok, _ := token.New()
	palsu := token.Payload([]byte("kunci-penyerang-kunci-penyerang-!!"), tok)
	for _, body := range []string{`{"qr":"halo"}`, `{"qr":"` + palsu + `"}`, `{"qr":""}`} {
		if _, out := post(h, "/api/scan", body); out["result"] != "invalid" {
			t.Errorf("%s -> %v", body, out)
		}
	}
	if code, _ := post(h, "/api/scan", `bukan json`); code != 400 {
		t.Errorf("json rusak = %d", code)
	}
	if sc.calls != 0 {
		t.Errorf("database dipanggil %d kali untuk payload palsu", sc.calls)
	}
}

func TestScanKodeCadangan(t *testing.T) {
	h, sc, _ := newTestServer(t, "dev")
	sc.reply = voucher.ScanResult{Result: "used", Tenant: "Warung Dev 2"}
	code, out := post(h, "/api/scan/code", `{"code":"k7m4-qxp8"}`)
	if code != 200 || out["result"] != "used" || out["tenant"] != "Warung Dev 2" {
		t.Fatalf("%d %v", code, out)
	}
	want := token.ShortCodeHash(shKey, "2026-11-04", "K7M4QXP8")
	if string(sc.gotCode) != string(want) || sc.gotDate.Format("2006-01-02") != "2026-11-04" {
		t.Error("hash kode cadangan atau tanggal salah")
	}
	sc.calls = 0
	if _, out := post(h, "/api/scan/code", `{"code":"abc"}`); out["result"] != "invalid" || sc.calls != 0 {
		t.Errorf("kode terlalu pendek harus ditolak tanpa query: %v", out)
	}
}

func TestDashboardRingkasan(t *testing.T) {
	sv, h, _, _ := newTestServerRaw(t, "dev")
	_, body, _ := getWithAdminCookie(h, sv, "/admin")
	mustContain(t, body, "Rabu, 4 Nov 2026", "diperbarui 12.20", ">98<", ">71<", "72%", "Rp355.000", "25 belum dipakai", "2 staf nonaktif",
		"Kantin Dev", "14 · Rp70.000", `<progress max="14" value="14"`, "Dr. Rina Kusuma", "Dibatalkan", "Lihat semua transaksi", "dari=2026-11-04")
	mustContain(t, body, `href="/admin/transaksi?dari=2026-11-04&amp;sampai=2026-11-04"`)
}

func TestFinancePages(t *testing.T) {
	sv, h, _, _ := newTestServerRaw(t, "dev")

	_, body, _ := getWithFinanceCookie(h, sv, "/finance")
	mustContain(t, body, "Ringkasan Kas Keuangan", "Anggaran Terbit", "Kewajiban Kas", "Efisiensi", "Realisasi Anggaran", "Kantin Dev")

	_, pBody, _ := getWithFinanceCookie(h, sv, "/finance/pencairan")
	mustContain(t, pBody, "Pencairan Kas Tenant", "Total Kas Penggantian", "Daftar Penggantian per Stan Kantin", "Kantin Dev")

	_, txBody, _ := getWithFinanceCookie(h, sv, "/finance/transaksi")
	mustContain(t, txBody, "Detail Transaksi Keuangan", "Dari tanggal", "Sampai tanggal")
}

func TestDashboardTanggalKosongdanPilihan(t *testing.T) {
	sv, h, _, rp := newTestServerRaw(t, "dev")
	rp.summary = report.Summary{}
	_, body, _ := getWithAdminCookie(h, sv, "/admin?tanggal=2026-12-25")
	mustContain(t, body, "Belum ada voucher untuk tanggal ini", "issue-vouchers", "Jumat, 25 Des 2026")
	if _, body, _ := getWithAdminCookie(h, sv, "/admin?tanggal=ngawur"); !strings.Contains(body, "Rabu, 4 Nov 2026") {
		t.Error("tanggal salah harus kembali ke hari ini")
	}
}

func TestTransaksiFilterDanPagination(t *testing.T) {
	sv, h, _, rp := newTestServerRaw(t, "dev")
	_, body, _ := getWithAdminCookie(h, sv, "/admin/transaksi?dari=2026-11-01&sampai=2026-11-04&tenant=2&unit=Fakultas+Teknik&q=rina&page=2")
	f := rp.txFilter
	if f.From.Format("2006-01-02") != "2026-11-01" || f.To.Format("2006-01-02") != "2026-11-04" ||
		f.TenantID != 2 || f.Unit != "Fakultas Teknik" || f.Q != "rina" || f.Page != 2 || f.PerPage != 50 {
		t.Errorf("filter terbaca salah: %+v", f)
	}
	mustContain(t, body, "Menampilkan 51–52 dari 120", "Halaman 2 dari 3", "Sebelumnya", "Berikutnya",
		`value="rina"`, `<option value="2" selected>Warung Dev 2</option>`, `<option selected>Fakultas Teknik</option>`, "Dibatalkan", "Rp5.000")
	mustContain(t, body, "page=1", "page=3", "tenant=2", "q=rina")
}

func TestTransaksiTanpaParameterMemakaiHariIni(t *testing.T) {
	sv, h, _, rp := newTestServerRaw(t, "dev")
	getWithAdminCookie(h, sv, "/admin/transaksi")
	if rp.txFilter.From.Format("2006-01-02") != "2026-11-04" || rp.txFilter.To.Format("2006-01-02") != "2026-11-04" || rp.txFilter.TenantID != 0 {
		t.Errorf("default = %+v", rp.txFilter)
	}
}

func TestSelainDevHalamanTertutup(t *testing.T) {
	h, _, _ := newTestServer(t, "prod")
	for _, p := range []string{
		"/", "/scan", "/today", "/admin", "/admin/transaksi", "/admin/pengguna",
		"/api/today", "/finance", "/finance/pencairan", "/finance/transaksi",
		"/admin/masuk", "/finance/masuk",
	} {
		if code, _, _ := get(h, p); code != 404 {
			t.Errorf("GET %s di prod = %d, harus 404", p, code)
		}
	}
	if code, _ := post(h, "/api/scan", `{"qr":"x"}`); code != 404 && code != 405 {
		t.Errorf("POST /api/scan di prod = %d", code)
	}
	if code, _, _ := get(h, "/healthz"); code != 200 {
		t.Errorf("/healthz = %d", code)
	}
}

func TestAdminAndFinanceLogout(t *testing.T) {
	sv, h, _, _ := newTestServerRaw(t, "dev")

	// Admin logout via GET
	code, _, hd := getWithAdminCookie(h, sv, "/admin/keluar")
	if code != http.StatusSeeOther {
		t.Errorf("GET /admin/keluar status = %d, expected 303", code)
	}
	if loc := hd.Get("Location"); loc != "/admin/masuk" {
		t.Errorf("GET /admin/keluar redirect ke %s, expected /admin/masuk", loc)
	}
	if setCookie := hd.Get("Set-Cookie"); !strings.Contains(setCookie, "admin_sess=") || !strings.Contains(setCookie, "Max-Age=0") {
		t.Errorf("Set-Cookie logout admin salah: %s", setCookie)
	}

	// Finance logout via GET
	code, _, hd = getWithFinanceCookie(h, sv, "/finance/keluar")
	if code != http.StatusSeeOther {
		t.Errorf("GET /finance/keluar status = %d, expected 303", code)
	}
	if loc := hd.Get("Location"); loc != "/finance/masuk" {
		t.Errorf("GET /finance/keluar redirect ke %s, expected /finance/masuk", loc)
	}
	if setCookie := hd.Get("Set-Cookie"); !strings.Contains(setCookie, "finance_sess=") || !strings.Contains(setCookie, "Max-Age=0") {
		t.Errorf("Set-Cookie logout finance salah: %s", setCookie)
	}
}

func TestDynamicUserNameRendering(t *testing.T) {
	sv, h, _, _ := newTestServerRaw(t, "dev")

	// Pastikan nama sesi "Admin Test" tampil di halaman admin
	_, bodyAdmin, _ := getWithAdminCookie(h, sv, "/admin")
	mustContain(t, bodyAdmin, "Admin Test", "Admin Super IT", "/admin/keluar")

	// Pastikan nama sesi "Finance Test" tampil di halaman finance
	_, bodyFinance, _ := getWithFinanceCookie(h, sv, "/finance")
	mustContain(t, bodyFinance, "Finance Test", "Biro Keuangan", "/finance/keluar")
}

