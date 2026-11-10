package server

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"voucher-kantin/internal/config"
	"voucher-kantin/internal/master"
	"voucher-kantin/internal/report"
	"voucher-kantin/internal/token"
	"voucher-kantin/internal/voucher"
)

const goodCode = "7M4QXP8RTK"

// fakeMaster menggantikan database untuk uji handler.
type fakeMaster struct {
	tenants  []master.TenantRow
	menu     map[int64][]master.MenuItem
	versions map[int64]int  // versi sesi sah per tenant; tenant yang tidak ada = nonaktif
	noUser   map[int64]bool // tenant yang belum punya akun users

	created   master.TenantInput
	createErr error
	updated   master.TenantInput
	deleted   int64
	deleteErr error
	issued    int64
	revoked   int64
	menuCalls []string
	recorded  []master.PricedLine
	recAt     time.Time
	recTenant int64
	recCalls  int
	recErr    error
}

func newFakeMaster() *fakeMaster {
	return &fakeMaster{
		tenants: []master.TenantRow{
			{ID: 1, Name: "Kantin Dev", Stall: "Stan 1", Owner: "Bu Sri", BankName: "BCA", BankAccount: "1234567890", Active: true, HasCode: true, MenuCount: 2},
			{ID: 2, Name: "Warung <b>Dev</b> 2", Owner: "Pak Darto", Active: true},
		},
		menu: map[int64][]master.MenuItem{
			1: {{ID: 10, TenantID: 1, Name: "Nasi goreng", Price: 15000, Available: true}, {ID: 11, TenantID: 1, Name: "Es teh", Price: 4000, Available: true}},
			2: {{ID: 20, TenantID: 2, Name: "Soto", Price: 12000, Available: true}},
		},
		versions: map[int64]int{1: 1, 2: 3},
	}
}

func (f *fakeMaster) ListTenants(context.Context) ([]master.TenantRow, error) { return f.tenants, nil }
func (f *fakeMaster) GetTenant(_ context.Context, id int64) (master.TenantRow, error) {
	for _, t := range f.tenants {
		if t.ID == id {
			return t, nil
		}
	}
	return master.TenantRow{}, master.ErrNotFound
}
func (f *fakeMaster) CreateTenant(_ context.Context, in master.TenantInput) (int64, error) {
	f.created = in
	if f.createErr != nil {
		return 0, f.createErr
	}
	if strings.TrimSpace(in.Name) == "" {
		return 0, master.ValidationError("Nama tenant wajib diisi")
	}
	if strings.TrimSpace(in.Owner) == "" {
		return 0, master.ValidationError("Nama pemilik wajib diisi")
	}
	return 7, nil
}
func (f *fakeMaster) UpdateTenant(_ context.Context, _ int64, in master.TenantInput) error {
	f.updated = in
	return nil
}
func (f *fakeMaster) DeleteTenant(_ context.Context, id int64) error {
	f.deleted = id
	return f.deleteErr
}
func (f *fakeMaster) TenantUser(_ context.Context, id int64) (int64, error) {
	if f.noUser[id] {
		return 0, master.ErrNotFound
	}
	return 100 + id, nil // akun pengguna tenant: 101, 102, ...
}
func (f *fakeMaster) IssueCode(_ context.Context, id int64) (string, error) {
	f.issued = id
	return goodCode, nil
}
func (f *fakeMaster) RevokeDevices(_ context.Context, id int64) error { f.revoked = id; return nil }
func (f *fakeMaster) Redeem(_ context.Context, raw string) (master.Session, error) {
	if c, ok := master.NormalizeCode(raw); ok && c == goodCode {
		return master.Session{TenantID: 2, Version: f.versions[2]}, nil
	}
	return master.Session{}, master.ErrBadCode
}
func (f *fakeMaster) SessionValid(_ context.Context, ss master.Session) (bool, error) {
	v, ok := f.versions[ss.TenantID]
	return ok && v == ss.Version, nil
}
func (f *fakeMaster) ListMenu(_ context.Context, id int64, only bool) ([]master.MenuItem, error) {
	return f.menu[id], nil
}
func (f *fakeMaster) CreateMenu(_ context.Context, id int64, in master.MenuInput) error {
	f.menuCalls = append(f.menuCalls, "tambah "+in.Name+" "+in.Price)
	return nil
}
func (f *fakeMaster) UpdateMenu(_ context.Context, id, mid int64, in master.MenuInput) error {
	f.menuCalls = append(f.menuCalls, "ubah "+in.Name+" "+in.Price)
	return nil
}
func (f *fakeMaster) DeleteMenu(_ context.Context, id, mid int64) error {
	f.menuCalls = append(f.menuCalls, "hapus")
	return nil
}
func (f *fakeMaster) PriceOrder(_ context.Context, id int64, lines []master.OrderLine) ([]master.PricedLine, error) {
	return master.PriceLines(f.menu[id], lines), nil
}
func (f *fakeMaster) RecordOrder(_ context.Context, id int64, at time.Time, lines []master.PricedLine) (bool, error) {
	f.recCalls++
	f.recTenant, f.recAt, f.recorded = id, at, lines
	return f.recErr == nil, f.recErr
}

func newMasterServer(t *testing.T, env string) (*Server, *fakeMaster, *fakeScanner) {
	t.Helper()
	fm, sc := newFakeMaster(), &fakeScanner{}
	rp := &fakeReports{summary: report.Summary{Issued: 1}}
	cfg := config.Config{Env: env, QRKey: qrKey, ShortKey: shKey, Location: wib, DevTenantID: 1, DevUserID: 1}
	s, err := New(cfg, Deps{DB: okPinger{}, Scanner: sc, Reports: rp, Master: fm}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	s.now = func() time.Time { return nowFix }
	return s, fm, sc
}

func do(h http.Handler, method, path string, form url.Values, hdr map[string]string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	var body io.Reader
	if form != nil {
		body = strings.NewReader(form.Encode())
	}
	req := httptest.NewRequest(method, path, body)
	if form != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func sessCookie(s *Server, id int64, ver int) *http.Cookie {
	return &http.Cookie{Name: sessionCookie, Value: s.encodeSession(master.Session{TenantID: id, Version: ver}, nowFix.Add(time.Hour))}
}

func TestAdminTenantHalaman(t *testing.T) {
	s, _, _ := newMasterServer(t, "dev")
	h := s.Handler()
	rec := do(h, "GET", "/admin/tenant", nil, nil)
	mustContain(t, rec.Body.String(), "Tenant &amp; menu", "Kantin Dev", "Bu Sri", "Stan 1", "Kode aktif", "Belum ada kode", "/admin/tenant/baru", `href="/admin/tenant/1"`)
	if strings.Contains(rec.Body.String(), "<b>Dev</b>") {
		t.Error("nama tenant harus di-escape (XSS)")
	}
	rec = do(h, "GET", "/admin/tenant/1", nil, nil)
	mustContain(t, rec.Body.String(), `name="owner" value="Bu Sri"`, `value="BCA"`, `value="1234567890"`, "Nasi goreng", "15000", "Es teh", `action="/admin/tenant/1/menu/10"`, `formaction="/admin/tenant/1/menu/10/hapus"`,
		`action="/admin/tenant/1/kode"`, `action="/admin/tenant/1/putus"`, `name="yakin"`)
	if code := do(h, "GET", "/admin/tenant/999", nil, nil).Code; code != 404 {
		t.Errorf("tenant tidak ada = %d", code)
	}
	if code := do(h, "GET", "/admin/tenant/abc", nil, nil).Code; code != 404 {
		t.Errorf("id bukan angka = %d", code)
	}
	if code := do(h, "GET", "/admin/tenant/baru", nil, nil).Code; code != 200 {
		t.Errorf("form baru = %d", code)
	}
}

func TestAdminTenantBuat(t *testing.T) {
	s, fm, _ := newMasterServer(t, "dev")
	h := s.Handler()
	rec := do(h, "POST", "/admin/tenant", url.Values{"name": {"Kantin Baru"}, "stall": {"Stan 9"}, "owner": {"Bu Ani"}, "bank_name": {"BRI"}, "bank_account": {"111 222"}}, nil)
	if rec.Code != 303 || rec.Header().Get("Location") != "/admin/tenant/7?pesan=tenant-dibuat" {
		t.Fatalf("buat tenant = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	if fm.created.Name != "Kantin Baru" || fm.created.Stall != "Stan 9" || fm.created.Owner != "Bu Ani" ||
		fm.created.BankName != "BRI" || fm.created.BankAccount != "111 222" || !fm.created.Active {
		t.Errorf("input = %+v", fm.created)
	}
	rec = do(h, "POST", "/admin/tenant", url.Values{"name": {"  "}, "stall": {"X"}, "owner": {"Bu Ani"}}, nil)
	if rec.Code != 422 {
		t.Fatalf("nama kosong = %d", rec.Code)
	}
	mustContain(t, rec.Body.String(), "Nama tenant wajib diisi", `value="X"`, `value="Bu Ani"`)
	// pemilik wajib (tenants.owner_name NOT NULL)
	if rec := do(h, "POST", "/admin/tenant", url.Values{"name": {"A"}}, nil); rec.Code != 422 || !strings.Contains(rec.Body.String(), "Nama pemilik wajib diisi") {
		t.Errorf("pemilik kosong = %d", rec.Code)
	}
	fm.createErr = master.ErrDuplicate
	if rec := do(h, "POST", "/admin/tenant", url.Values{"name": {"A"}, "owner": {"B"}}, nil); rec.Code != 422 || !strings.Contains(rec.Body.String(), "sudah dipakai") {
		t.Errorf("nama kembar = %d", rec.Code)
	}
	fm.createErr = errors.New("db mati")
	if rec := do(h, "POST", "/admin/tenant", url.Values{"name": {"A"}, "owner": {"B"}}, nil); rec.Code != 500 {
		t.Errorf("error sistem = %d, harus 500", rec.Code)
	}
}

func TestAdminUbahHapusTenant(t *testing.T) {
	s, fm, _ := newMasterServer(t, "dev")
	h := s.Handler()
	rec := do(h, "POST", "/admin/tenant/1", url.Values{"name": {"Kantin X"}, "stall": {""}}, nil) // active tidak dicentang
	if rec.Code != 303 || !strings.HasSuffix(rec.Header().Get("Location"), "pesan=tenant-nonaktif") || fm.updated.Active {
		t.Errorf("nonaktifkan = %d %q %+v", rec.Code, rec.Header().Get("Location"), fm.updated)
	}
	do(h, "POST", "/admin/tenant/1", url.Values{"name": {"Kantin X"}, "active": {"1"}}, nil)
	if !fm.updated.Active {
		t.Error("active=1 harus aktif")
	}
	// hapus tanpa centang konfirmasi
	if rec := do(h, "POST", "/admin/tenant/2/hapus", url.Values{}, nil); rec.Code != 422 || fm.deleted != 0 {
		t.Errorf("hapus tanpa konfirmasi = %d deleted=%d", rec.Code, fm.deleted)
	}
	if rec := do(h, "POST", "/admin/tenant/2/hapus", url.Values{"yakin": {"1"}}, nil); rec.Code != 303 || fm.deleted != 2 {
		t.Errorf("hapus = %d deleted=%d", rec.Code, fm.deleted)
	}
	fm.deleteErr = master.ErrInUse
	if rec := do(h, "POST", "/admin/tenant/1/hapus", url.Values{"yakin": {"1"}}, nil); rec.Code != 422 || !strings.Contains(rec.Body.String(), "nonaktifkan saja") {
		t.Errorf("tenant punya transaksi = %d", rec.Code)
	}
}

func TestAdminBuatKodeDanPutus(t *testing.T) {
	s, fm, _ := newMasterServer(t, "dev")
	h := s.Handler()
	rec := do(h, "POST", "/admin/tenant/1/kode", url.Values{}, map[string]string{"X-Forwarded-Proto": "https"})
	if rec.Code != 200 || fm.issued != 1 {
		t.Fatalf("buat kode = %d issued=%d", rec.Code, fm.issued)
	}
	mustContain(t, rec.Body.String(), "7M4QX-P8RTK", "https://example.com/masuk#7M4QXP8RTK", `src="data:image/png;base64,`, "Tampil sekali")
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Error("halaman berisi kode harus no-store")
	}
	// kode tidak boleh muncul di halaman biasa sesudahnya
	if _, body, _ := get(h, "/admin/tenant/1"); strings.Contains(body, "P8RTK") {
		t.Error("kode asli tidak boleh tampil lagi")
	}
	if rec := do(h, "POST", "/admin/tenant/1/putus", url.Values{}, nil); rec.Code != 303 || fm.revoked != 1 {
		t.Errorf("putus = %d revoked=%d", rec.Code, fm.revoked)
	}
}

func TestAdminMenu(t *testing.T) {
	s, fm, _ := newMasterServer(t, "dev")
	h := s.Handler()
	if rec := do(h, "POST", "/admin/tenant/1/menu", url.Values{"name": {"Soto"}, "price": {"12.000"}}, nil); rec.Code != 303 {
		t.Errorf("tambah = %d", rec.Code)
	}
	if rec := do(h, "POST", "/admin/tenant/1/menu/10", url.Values{"name": {"Nasi"}, "price": {"16000"}, "available": {"1"}}, nil); rec.Code != 303 {
		t.Errorf("ubah = %d", rec.Code)
	}
	if rec := do(h, "POST", "/admin/tenant/1/menu/10/hapus", url.Values{}, nil); rec.Code != 303 {
		t.Errorf("hapus = %d", rec.Code)
	}
	want := []string{"tambah Soto 12.000", "ubah Nasi 16000", "hapus"}
	if strings.Join(fm.menuCalls, "|") != strings.Join(want, "|") {
		t.Errorf("panggilan = %v", fm.menuCalls)
	}
}

func TestMasukDanSesi(t *testing.T) {
	s, _, sc := newMasterServer(t, "dev")
	h := s.Handler()

	rec := do(h, "GET", "/masuk", nil, nil)
	mustContain(t, rec.Body.String(), "Hubungkan HP", `name="kode"`, "/static/masuk.js")
	if strings.Contains(rec.Body.String(), "<script>") || strings.Contains(rec.Body.String(), " style=") {
		t.Error("tidak boleh ada skrip/style inline (CSP)")
	}

	// kode benar -> cookie sesi HttpOnly -> /scan
	rec = do(h, "POST", "/masuk", url.Values{"kode": {"7m4qx-p8rtk"}}, nil)
	if rec.Code != 303 || rec.Header().Get("Location") != "/scan" {
		t.Fatalf("masuk = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	cs := rec.Result().Cookies()
	if len(cs) != 1 || cs[0].Name != sessionCookie || !cs[0].HttpOnly || cs[0].SameSite != http.SameSiteLaxMode || cs[0].Secure {
		t.Fatalf("cookie = %+v", cs)
	}
	if ss, ok := s.decodeSession(cs[0].Value); !ok || ss.TenantID != 2 || ss.Version != 3 {
		t.Errorf("isi sesi = %+v %v", ss, ok)
	}
	// lewat HTTPS cookie harus Secure
	rec = do(h, "POST", "/masuk", url.Values{"kode": {goodCode}}, map[string]string{"X-Forwarded-Proto": "https"})
	if c := rec.Result().Cookies(); len(c) != 1 || !c[0].Secure {
		t.Error("cookie harus Secure di HTTPS")
	}

	// dengan cookie tenant 2, scan memakai tenant 2 (bukan DEV_TENANT_ID=1)
	sc.reply = voucher.ScanResult{Result: "used"}
	tok, _ := token.New()
	body := `{"qr":"` + token.Payload(qrKey, tok) + `"}`
	req := httptest.NewRequest("POST", "/api/scan", strings.NewReader(body))
	req.AddCookie(cs[0])
	h.ServeHTTP(httptest.NewRecorder(), req)
	if sc.tenantID != 2 || sc.userID != 102 {
		t.Errorf("tenant/user dari cookie = %d/%d, harus 2/102 (akun milik tenant itu, bukan DEV_USER_ID)", sc.tenantID, sc.userID)
	}

	// kode salah
	rec = do(h, "POST", "/masuk", url.Values{"kode": {"SALAHSALAH"}}, nil)
	if rec.Code != 422 || !strings.Contains(rec.Body.String(), "Kode tidak dikenal") || len(rec.Result().Cookies()) != 0 {
		t.Errorf("kode salah = %d", rec.Code)
	}
}

func TestSesiTidakSahDitolak(t *testing.T) {
	s, fm, _ := newMasterServer(t, "dev")
	h := s.Handler()
	good := sessCookie(s, 2, 3)
	if rec := do(h, "GET", "/scan", nil, nil, good); rec.Code != 200 {
		t.Fatalf("sesi sah = %d", rec.Code)
	}
	cases := map[string]*http.Cookie{
		"tanda tangan dirusak": {Name: sessionCookie, Value: good.Value[:len(good.Value)-3] + "xxx"},
		"sampah":               {Name: sessionCookie, Value: "halo"},
		"versi lama":           sessCookie(s, 2, 2),
		"tenant nonaktif":      sessCookie(s, 5, 1),
		"kedaluwarsa":          {Name: sessionCookie, Value: s.encodeSession(master.Session{TenantID: 2, Version: 3}, nowFix.Add(-time.Second))},
	}
	for name, c := range cases {
		rec := do(h, "GET", "/scan", nil, nil, c)
		if rec.Code != 303 || rec.Header().Get("Location") != "/masuk" {
			t.Errorf("%s: /scan = %d %q, harus ke /masuk (jangan jatuh ke tenant dev)", name, rec.Code, rec.Header().Get("Location"))
		}
		var cleared bool
		for _, ck := range rec.Result().Cookies() {
			cleared = cleared || (ck.Name == sessionCookie && ck.MaxAge < 0)
		}
		if !cleared {
			t.Errorf("%s: cookie rusak harus dihapus", name)
		}
		if rec := do(h, "GET", "/api/menu", nil, nil, c); rec.Code != 401 {
			t.Errorf("%s: /api/menu = %d, harus 401", name, rec.Code)
		}
	}
	// HP diputus admin: versi naik -> cookie lama mati
	fm.versions[2] = 4
	if rec := do(h, "GET", "/today", nil, nil, good); rec.Code != 303 {
		t.Errorf("setelah diputus = %d", rec.Code)
	}
	// keluar menghapus cookie
	rec := do(h, "POST", "/keluar", url.Values{}, nil, good)
	if rec.Code != 303 || rec.Header().Get("Location") != "/masuk" {
		t.Errorf("keluar = %d", rec.Code)
	}
}

func TestBatasPercobaanKode(t *testing.T) {
	s, _, _ := newMasterServer(t, "dev")
	h := s.Handler()
	for i := 0; i < 8; i++ {
		if rec := do(h, "POST", "/masuk", url.Values{"kode": {"SALAHSALAH"}}, nil); rec.Code != 422 {
			t.Fatalf("percobaan %d = %d", i+1, rec.Code)
		}
	}
	// percobaan ke-9 diblokir walau kodenya benar
	if rec := do(h, "POST", "/masuk", url.Values{"kode": {goodCode}}, nil); rec.Code != 429 {
		t.Errorf("setelah 8 gagal = %d, harus 429", rec.Code)
	}
	// satu menit kemudian boleh lagi
	s.now = func() time.Time { return nowFix.Add(61 * time.Second) }
	if rec := do(h, "POST", "/masuk", url.Values{"kode": {goodCode}}, nil); rec.Code != 303 {
		t.Errorf("setelah jeda = %d", rec.Code)
	}
}

func TestSameOrigin(t *testing.T) {
	s, fm, _ := newMasterServer(t, "dev")
	h := s.Handler()
	path := "/admin/tenant/1/putus"

	// harus ditolak
	for name, hdr := range map[string]map[string]string{
		"origin lain, tanpa sec-fetch":    {"Origin": "https://jahat.example"},
		"origin null, tanpa sec-fetch":    {"Origin": "null"},
		"origin rusak":                    {"Origin": "%%%"},
		"cross-site":                      {"Sec-Fetch-Site": "cross-site"},
		"same-site (subdomain/port lain)": {"Sec-Fetch-Site": "same-site"},
		"cross-site walau origin cocok":   {"Sec-Fetch-Site": "cross-site", "Origin": "http://example.com"},
	} {
		if rec := do(h, "POST", path, url.Values{}, hdr); rec.Code != 403 {
			t.Errorf("%s = %d, harus 403", name, rec.Code)
		}
	}
	if fm.revoked != 0 {
		t.Error("permintaan lintas situs tidak boleh dijalankan")
	}

	// harus lolos
	for name, hdr := range map[string]map[string]string{
		// kasus browser sungguhan: Referrer-Policy no-referrer membuat Origin menjadi "null"
		"form biasa: origin null + same-origin":   {"Origin": "null", "Sec-Fetch-Site": "same-origin"},
		"same-origin biasa":                       {"Origin": "http://example.com", "Sec-Fetch-Site": "same-origin"},
		"lewat tunnel: host berbeda, same-origin": {"Origin": "https://abc.trycloudflare.com", "Sec-Fetch-Site": "same-origin"},
		"ketik langsung di browser (none)":        {"Sec-Fetch-Site": "none"},
		"browser lama: origin cocok":              {"Origin": "http://example.com"},
		"browser lama di belakang proxy":          {"Origin": "https://voucher.upitra.ac.id", "X-Forwarded-Host": "voucher.upitra.ac.id"},
		"curl tanpa header":                       {},
	} {
		fm.revoked = 0
		if rec := do(h, "POST", path, url.Values{}, hdr); rec.Code != 303 || fm.revoked != 1 {
			t.Errorf("%s = %d, harus lolos (303)", name, rec.Code)
		}
	}
}

func TestReferrerPolicyMemungkinkanOrigin(t *testing.T) {
	// no-referrer membuat browser mengirim "Origin: null" pada form POST; same-origin tidak.
	s, _, _ := newMasterServer(t, "dev")
	_, _, hd := get(s.Handler(), "/admin/tenant")
	if got := hd.Get("Referrer-Policy"); got != "same-origin" {
		t.Errorf("Referrer-Policy = %q", got)
	}
}

func TestAPIMenu(t *testing.T) {
	s, _, _ := newMasterServer(t, "dev")
	h := s.Handler()
	rec := do(h, "GET", "/api/menu", nil, nil)
	mustContain(t, rec.Body.String(), `"id":10`, `"name":"Nasi goreng"`, `"price":15000`)
	rec = do(h, "GET", "/api/menu", nil, nil, sessCookie(s, 2, 3))
	mustContain(t, rec.Body.String(), `"name":"Soto"`)
	if strings.Contains(rec.Body.String(), "Nasi goreng") {
		t.Error("menu tenant lain bocor")
	}
}

func scanOK(sc *fakeScanner) {
	at := time.Date(2026, 11, 4, 5, 14, 3, 0, time.UTC)
	sc.reply = voucher.ScanResult{Result: "ok", Staff: "Dr. Rina Kusuma", Unit: "Fakultas Teknik", Amount: 5000, At: &at}
}

func postScan(h http.Handler, body string, c ...*http.Cookie) (int, string) {
	req := httptest.NewRequest("POST", "/api/scan", strings.NewReader(body))
	for _, ck := range c {
		req.AddCookie(ck)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code, rec.Body.String()
}

func TestScanDenganMenu(t *testing.T) {
	s, fm, sc := newMasterServer(t, "dev")
	h := s.Handler()
	scanOK(sc)
	tok, _ := token.New()
	qr := token.Payload(qrKey, tok)

	// harga dari HP diabaikan; menu tenant lain (20) dan menu ngawur (99) dibuang
	code, body := postScan(h, `{"qr":"`+qr+`","items":[{"id":10,"qty":2,"price":1},{"id":11,"qty":1},{"id":20,"qty":5},{"id":99,"qty":1}]}`)
	if code != 200 {
		t.Fatalf("scan = %d %s", code, body)
	}
	mustContain(t, body, `"result":"ok"`, `"total":34000`, `"pay":29000`, `"name":"Nasi goreng"`, `"subtotal":30000`, `"qty":2`)
	if fm.recCalls != 1 || fm.recTenant != 1 || len(fm.recorded) != 2 || fm.recorded[0].Price != 15000 {
		t.Fatalf("pesanan tercatat = tenant %d, %+v", fm.recTenant, fm.recorded)
	}
	if !fm.recAt.Equal(time.Date(2026, 11, 4, 5, 14, 3, 0, time.UTC)) {
		t.Errorf("waktu pakai voucher salah: %v", fm.recAt)
	}
	if !strings.Contains(body, `"at":"2026-11-04T12:14:03+07:00"`) {
		t.Errorf("waktu harus WIB: %s", body)
	}

	// total di bawah nilai voucher -> sisa bayar tidak negatif
	fm.recCalls = 0
	_, body = postScan(h, `{"qr":"`+qr+`","items":[{"id":11,"qty":1}]}`)
	mustContain(t, body, `"total":4000`, `"pay":0`)

	// tanpa menu: perilaku lama, tidak ada "order"
	fm.recCalls = 0
	_, body = postScan(h, `{"qr":"`+qr+`"}`)
	if strings.Contains(body, `"order"`) || fm.recCalls != 0 {
		t.Errorf("tanpa menu tidak boleh ada order: %s", body)
	}

	// semua menu tidak valid -> tidak dicatat
	_, body = postScan(h, `{"qr":"`+qr+`","items":[{"id":99,"qty":1}]}`)
	if strings.Contains(body, `"order"`) || fm.recCalls != 0 {
		t.Errorf("menu tak valid tidak boleh dicatat: %s", body)
	}
}

func TestScanTanpaAkunTenant(t *testing.T) {
	tok, _ := token.New()
	body := `{"qr":"` + token.Payload(qrKey, tok) + `"}`

	// dev: tenant belum punya akun users -> jatuh ke DEV_USER_ID
	s, fm, sc := newMasterServer(t, "dev")
	fm.noUser = map[int64]bool{1: true}
	if code, _ := postScan(s.Handler(), body); code != 200 || sc.userID != 1 {
		t.Errorf("dev tanpa akun: %d user=%d, harus memakai DEV_USER_ID", code, sc.userID)
	}

	// bukan dev: tidak boleh jatuh ke DEV_USER_ID
	s, fm, _ = newMasterServer(t, "prod")
	fm.noUser = map[int64]bool{2: true}
	req := httptest.NewRequest("POST", "/api/scan", nil)
	if _, ok := s.scanUser(req, 2); ok {
		t.Error("di luar dev, tenant tanpa akun harus ditolak")
	}
	if uid, ok := s.scanUser(req, 1); !ok || uid != 101 {
		t.Errorf("tenant dengan akun = %d %v, harus 101", uid, ok)
	}
}

func TestScanDitolakTidakMencatatMenu(t *testing.T) {
	s, fm, sc := newMasterServer(t, "dev")
	h := s.Handler()
	tok, _ := token.New()
	qr := token.Payload(qrKey, tok)
	for _, res := range []string{"used", "expired", "void", "invalid"} {
		sc.reply = voucher.ScanResult{Result: res}
		_, body := postScan(h, `{"qr":"`+qr+`","items":[{"id":10,"qty":1}]}`)
		if strings.Contains(body, `"order"`) || fm.recCalls != 0 {
			t.Errorf("%s: menu tidak boleh dicatat (%s)", res, body)
		}
	}
}

func TestGagalCatatMenuTidakMembatalkanScan(t *testing.T) {
	s, fm, sc := newMasterServer(t, "dev")
	h := s.Handler()
	scanOK(sc)
	fm.recErr = errors.New("db putus")
	tok, _ := token.New()
	code, body := postScan(h, `{"qr":"`+token.Payload(qrKey, tok)+`","items":[{"id":10,"qty":1}]}`)
	if code != 200 || !strings.Contains(body, `"result":"ok"`) {
		t.Errorf("scan harus tetap berhasil: %d %s", code, body)
	}
}

func TestScanKodeCadanganDenganMenu(t *testing.T) {
	s, fm, sc := newMasterServer(t, "dev")
	h := s.Handler()
	scanOK(sc)
	rec := do(h, "POST", "/api/scan/code", nil, nil)
	_ = rec
	req := httptest.NewRequest("POST", "/api/scan/code", strings.NewReader(`{"code":"K7M4-QXP8","items":[{"id":10,"qty":1}]}`))
	r2 := httptest.NewRecorder()
	h.ServeHTTP(r2, req)
	mustContain(t, r2.Body.String(), `"result":"ok"`, `"total":15000`)
	if fm.recCalls != 1 {
		t.Error("menu harus tercatat juga lewat kode cadangan")
	}
}

func TestHalamanScanMemuatMenu(t *testing.T) {
	s, _, _ := newMasterServer(t, "dev")
	_, body, _ := get(s.Handler(), "/scan")
	mustContain(t, body, `id="menu-btn"`, `id="menu-sheet"`, `id="menu-list"`, `id="res-order"`, "Menu Kantin Dev")
	if strings.Contains(body, " style=") || strings.Contains(body, "<script>") {
		t.Error("tidak boleh ada skrip/style inline (CSP)")
	}
	_, today, _ := get(s.Handler(), "/today")
	mustContain(t, today, `action="/keluar"`, "Putuskan HP ini")
}

func TestHalamanBaruTertutupDiProd(t *testing.T) {
	s, _, _ := newMasterServer(t, "prod")
	h := s.Handler()
	for _, p := range []string{"/masuk", "/admin/tenant", "/admin/tenant/baru", "/admin/tenant/1", "/api/menu"} {
		if rec := do(h, "GET", p, nil, nil); rec.Code != 404 {
			t.Errorf("GET %s di prod = %d, harus 404", p, rec.Code)
		}
	}
	for _, p := range []string{"/masuk", "/keluar", "/admin/tenant", "/admin/tenant/1/kode", "/admin/tenant/1/putus", "/admin/tenant/1/menu"} {
		if rec := do(h, "POST", p, url.Values{}, nil); rec.Code != 404 && rec.Code != 405 {
			t.Errorf("POST %s di prod = %d", p, rec.Code)
		}
	}
}

func TestLimiter(t *testing.T) {
	l := newLimiter(2, time.Minute)
	t0 := time.Now()
	l.fail("a", t0)
	if l.blocked("a", t0) {
		t.Error("baru 1 gagal")
	}
	l.fail("a", t0.Add(time.Second))
	if !l.blocked("a", t0.Add(2*time.Second)) || l.blocked("b", t0) {
		t.Error("a harus diblokir, b tidak")
	}
	if l.blocked("a", t0.Add(2*time.Minute)) || len(l.hits) != 0 {
		t.Error("setelah jendela lewat harus bebas dan bersih")
	}
}
