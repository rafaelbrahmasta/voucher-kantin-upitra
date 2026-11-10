package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"voucher-kantin/internal/master"
	"voucher-kantin/internal/token"
	"voucher-kantin/internal/voucher"
)

// needTenant mengembalikan tenant pemilik HP. Halaman diarahkan ke /masuk,
// API dijawab 401 (scan.js lalu membuka /masuk).
func (s *Server) needTenant(w http.ResponseWriter, r *http.Request, api bool) (int64, bool) {
	id, ok := s.tenantID(w, r)
	if ok {
		return id, true
	}
	if api {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "belum masuk"})
	} else {
		http.Redirect(w, r, "/masuk", http.StatusSeeOther)
	}
	return 0, false
}

// scanUser = akun users milik tenant, dicatat di vouchers.scanned_by_user_id.
// Mode dev boleh jatuh ke DEV_USER_ID bila tenant belum punya akun; mode lain gagal.
func (s *Server) scanUser(r *http.Request, tenantID int64) (int64, bool) {
	uid, err := s.deps.Master.TenantUser(r.Context(), tenantID)
	if err == nil {
		return uid, true
	}
	if errors.Is(err, master.ErrNotFound) && s.cfg.Env == "dev" && s.cfg.DevUserID > 0 {
		return s.cfg.DevUserID, true
	}
	s.log.Error("akun pengguna tenant tidak ada", "tenant", tenantID, "err", err)
	return 0, false
}

// Halaman scan: kamera aktif, total hari ini di atas.
func (s *Server) handleScanPage(w http.ResponseWriter, r *http.Request) {
	tid, ok := s.needTenant(w, r, false)
	if !ok {
		return
	}
	t, err := s.deps.Reports.Tenant(r.Context(), tid)
	if err != nil {
		s.fail(w, "tenant tidak ditemukan (cek koneksi HP atau DEV_TENANT_ID dan data seed)", err)
		return
	}
	from, to := s.dayRange(s.now())
	d, err := s.deps.Reports.TenantDay(r.Context(), t.ID, from, to)
	if err != nil {
		s.fail(w, "ringkasan hari ini", err)
		return
	}
	s.render(w, "scan", map[string]any{"Title": "Scan", "Tab": "scan", "Tenant": t, "Count": d.Count, "Total": d.Total})
}

// Tab Hari ini: daftar scan untuk mencocokkan kas saat tutup.
func (s *Server) handleToday(w http.ResponseWriter, r *http.Request) {
	tid, ok := s.needTenant(w, r, false)
	if !ok {
		return
	}
	t, err := s.deps.Reports.Tenant(r.Context(), tid)
	if err != nil {
		s.fail(w, "tenant tidak ditemukan (cek koneksi HP atau DEV_TENANT_ID dan data seed)", err)
		return
	}
	now := s.now()
	from, to := s.dayRange(now)
	d, err := s.deps.Reports.TenantDay(r.Context(), t.ID, from, to)
	if err != nil {
		s.fail(w, "riwayat hari ini", err)
		return
	}
	s.render(w, "today", map[string]any{
		"Title": "Hari ini", "Tab": "today", "Tenant": t,
		"DayLabel": dayLabel(now.In(s.cfg.Location)), "Count": d.Count, "Total": d.Total, "Scans": d.Scans,
	})
}

func (s *Server) handleAPIToday(w http.ResponseWriter, r *http.Request) {
	tid, ok := s.needTenant(w, r, true)
	if !ok {
		return
	}
	from, to := s.dayRange(s.now())
	d, err := s.deps.Reports.TenantDay(r.Context(), tid, from, to)
	if err != nil {
		s.log.Error("api today", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal memuat"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"count": d.Count, "total": d.Total})
}

type menuOut struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Price int    `json:"price"`
}

// Menu tenant yang sedang tersedia, dikelola dari dashboard admin.
func (s *Server) handleAPIMenu(w http.ResponseWriter, r *http.Request) {
	tid, ok := s.needTenant(w, r, true)
	if !ok {
		return
	}
	items, err := s.deps.Master.ListMenu(r.Context(), tid, true)
	if err != nil {
		s.log.Error("api menu", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal memuat menu"})
		return
	}
	out := make([]menuOut, 0, len(items))
	for _, m := range items {
		out = append(out, menuOut{ID: m.ID, Name: m.Name, Price: m.Price})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
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

type orderLineIn struct {
	ID  int64 `json:"id"`
	Qty int   `json:"qty"`
}

type orderLineOut struct {
	Name     string `json:"name"`
	Qty      int    `json:"qty"`
	Price    int    `json:"price"`
	Subtotal int    `json:"subtotal"`
}

type orderOut struct {
	Items []orderLineOut `json:"items"`
	Total int            `json:"total"`
	Pay   int            `json:"pay"` // sisa yang dibayar staf setelah potongan voucher
}

// scanResponse = hasil scan voucher + (opsional) menu yang dicatat.
type scanResponse struct {
	voucher.ScanResult
	Order *orderOut `json:"order,omitempty"`
}

// finish dipanggil setelah scan selesai. Menu hanya dicatat bila voucher berhasil dipakai.
// Kegagalan mencatat menu TIDAK membatalkan scan: voucher sudah terpakai dan itulah
// yang harus dipercaya.
func (s *Server) finish(r *http.Request, tenantID int64, res voucher.ScanResult, items []orderLineIn) scanResponse {
	out := scanResponse{ScanResult: s.toLocal(res)}
	if res.Result != "ok" || len(items) == 0 {
		return out
	}
	req := make([]master.OrderLine, 0, len(items))
	for _, it := range items {
		req = append(req, master.OrderLine{MenuID: it.ID, Qty: it.Qty})
	}
	lines, err := s.deps.Master.PriceOrder(r.Context(), tenantID, req)
	if err != nil {
		s.log.Error("harga menu", "err", err)
		return out
	}
	if len(lines) == 0 {
		return out
	}
	if res.At != nil {
		saved, err := s.deps.Master.RecordOrder(r.Context(), tenantID, *res.At, lines)
		if err != nil || !saved {
			s.log.Error("catat menu gagal; scan tetap sah", "err", err, "saved", saved, "tenant", tenantID)
		}
	} else {
		s.log.Warn("catat menu dilewati: hasil scan tanpa waktu", "tenant", tenantID)
	}
	total := master.OrderTotal(lines)
	o := &orderOut{Total: total, Pay: total - res.Amount}
	if o.Pay < 0 {
		o.Pay = 0
	}
	for _, l := range lines {
		o.Items = append(o.Items, orderLineOut{Name: l.Name, Qty: l.Qty, Price: l.Price, Subtotal: l.Subtotal()})
	}
	out.Order = o
	return out
}

func (s *Server) handleScan(w http.ResponseWriter, r *http.Request) {
	tid, ok := s.needTenant(w, r, true)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var in struct {
		QR    string        `json:"qr"`
		Items []orderLineIn `json:"items"`
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
	uid, ok := s.scanUser(r, tid)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "akun tenant belum lengkap"})
		return
	}
	res, err := s.deps.Scanner.ScanToken(r.Context(), token.Hash(tok), tid, uid)
	if err != nil {
		s.log.Error("scan", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal memeriksa voucher"})
		return
	}
	writeJSON(w, http.StatusOK, s.finish(r, tid, res, in.Items))
}

func (s *Server) handleScanCode(w http.ResponseWriter, r *http.Request) {
	tid, ok := s.needTenant(w, r, true)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var in struct {
		Code  string        `json:"code"`
		Items []orderLineIn `json:"items"`
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
	now := s.now().In(s.cfg.Location)
	date := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	hash := token.ShortCodeHash(s.cfg.ShortKey, date.Format("2006-01-02"), code)

	// TODO (M5): rate limit lebih ketat, maks 10 percobaan gagal per menit per tenant.
	uid, ok := s.scanUser(r, tid)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "akun tenant belum lengkap"})
		return
	}
	res, err := s.deps.Scanner.ScanShortCode(r.Context(), hash, date, tid, uid)
	if err != nil {
		s.log.Error("scan code", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal memeriksa voucher"})
		return
	}
	writeJSON(w, http.StatusOK, s.finish(r, tid, res, in.Items))
}
