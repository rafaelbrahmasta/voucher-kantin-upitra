package server

import (
	"encoding/base64"
	"errors"
	"html/template"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/skip2/go-qrcode"

	"voucher-kantin/internal/master"
)

// Pesan sukses yang boleh tampil lewat ?pesan=... (daftar tetap, tidak ada teks bebas).
var flashText = map[string]string{
	"tenant-dibuat":   "Stan kantin berhasil dibuat. Sekarang silakan tambahkan daftar menu makanan & minuman di bawah.",
	"tenant-disimpan": "Perubahan tenant disimpan.",
	"tenant-dihapus":  "Tenant dihapus.",
	"perangkat-putus": "Semua HP tenant diputus dan kode lama dimatikan.",
	"menu-ditambah":   "Menu ditambahkan.",
	"menu-disimpan":   "Menu disimpan.",
	"menu-dihapus":    "Menu dihapus.",
	"tenant-nonaktif": "Tenant dinonaktifkan dan semua HP-nya diputus.",
	"staf-dibuat":     "Data dosen / staf baru berhasil ditambahkan.",
	"staf-disimpan":   "Perubahan data dosen / staf berhasil disimpan.",
	"staf-status":     "Status keaktifan dosen / staf berhasil diperbarui.",
	"staf-dihapus":    "Data dosen / staf berhasil dihapus.",
	"staf-gagal":      "Staf tidak dapat dihapus karena sudah memiliki riwayat voucher. Silakan nonaktifkan saja.",
}

const maxFormBytes = 8 << 10

func (s *Server) parseForm(w http.ResponseWriter, r *http.Request) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxFormBytes)
	if err := r.ParseForm(); err != nil {
		http.Error(w, "form tidak valid", http.StatusBadRequest)
		return false
	}
	return true
}

func pathID(r *http.Request, name string) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, name), 10, 64)
	return id, err == nil && id > 0
}

func (s *Server) back(w http.ResponseWriter, r *http.Request, path, flash string) {
	if flash != "" {
		path += "?pesan=" + flash
	}
	http.Redirect(w, r, path, http.StatusSeeOther)
}

func tenantInput(r *http.Request, active bool) master.TenantInput {
	return master.TenantInput{
		Name: r.PostFormValue("name"), Stall: r.PostFormValue("stall"), Owner: r.PostFormValue("owner"),
		BankName: r.PostFormValue("bank_name"), BankAccount: r.PostFormValue("bank_account"), Active: active,
	}
}

func tenantPath(id int64) string { return "/admin/tenant/" + strconv.FormatInt(id, 10) }

// userMessage mengubah error menjadi pesan untuk admin. ok=false berarti error sistem.
func userMessage(err error) (string, bool) {
	var ve master.ValidationError
	switch {
	case errors.As(err, &ve):
		return ve.Error(), true
	case errors.Is(err, master.ErrDuplicate):
		return "Nama itu sudah dipakai, pilih nama lain.", true
	case errors.Is(err, master.ErrInUse):
		return master.ErrInUse.Error() + ".", true
	case errors.Is(err, master.ErrNotFound):
		return "Data tidak ditemukan.", true
	}
	return "", false
}

// ---------- daftar dan form tenant ----------

func (s *Server) handleAdminTenants(w http.ResponseWriter, r *http.Request) {
	rows, err := s.deps.Master.ListTenants(r.Context())
	if err != nil {
		s.fail(w, "daftar tenant", err)
		return
	}
	s.renderAdmin(w, r, "admin_tenants", map[string]any{
		"Title": "Tenant", "Tab": "tenant", "Rows": rows, "Flash": flashText[r.URL.Query().Get("pesan")],
	})
}

func (s *Server) handleAdminTenantNew(w http.ResponseWriter, r *http.Request) {
	s.renderAdmin(w, r, "admin_tenant_new", map[string]any{"Title": "Tenant baru", "Tab": "tenant", "In": master.TenantInput{}})
}

func (s *Server) handleAdminTenantCreate(w http.ResponseWriter, r *http.Request) {
	if !s.parseForm(w, r) {
		return
	}
	in := tenantInput(r, true)
	id, err := s.deps.Master.CreateTenant(r.Context(), in)
	if err != nil {
		if msg, ok := userMessage(err); ok {
			w.WriteHeader(http.StatusUnprocessableEntity)
			s.renderAdmin(w, r, "admin_tenant_new", map[string]any{
				"Title": "Tenant baru", "Tab": "tenant", "In": in, "Error": msg,
			})
			return
		}
		s.fail(w, "buat tenant", err)
		return
	}
	s.back(w, r, tenantPath(id), "tenant-dibuat")
}

// ---------- halaman satu tenant ----------

func (s *Server) tenantPage(w http.ResponseWriter, r *http.Request, id int64, extra map[string]any) {
	ctx := r.Context()
	t, err := s.deps.Master.GetTenant(ctx, id)
	if errors.Is(err, master.ErrNotFound) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		s.fail(w, "tenant", err)
		return
	}
	menu, err := s.deps.Master.ListMenu(ctx, id, false)
	if err != nil {
		s.fail(w, "menu", err)
		return
	}
	data := map[string]any{
		"Title": t.Name, "Tab": "tenant", "T": t, "Menu": menu,
		"Flash": flashText[r.URL.Query().Get("pesan")],
	}
	for k, v := range extra {
		data[k] = v
	}
	s.renderAdmin(w, r, "admin_tenant", data)
}

func (s *Server) handleAdminTenantShow(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		http.NotFound(w, r)
		return
	}
	s.tenantPage(w, r, id, nil)
}

func (s *Server) handleAdminTenantUpdate(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok || !s.parseForm(w, r) {
		return
	}
	active := r.PostFormValue("active") == "1"
	err := s.deps.Master.UpdateTenant(r.Context(), id, tenantInput(r, active))
	if err != nil {
		s.tenantError(w, r, id, "tenant", err)
		return
	}
	flash := "tenant-disimpan"
	if !active {
		flash = "tenant-nonaktif"
	}
	s.back(w, r, tenantPath(id), flash)
}

func (s *Server) handleAdminTenantDelete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok || !s.parseForm(w, r) {
		return
	}
	if r.PostFormValue("yakin") != "1" {
		s.tenantError(w, r, id, "tenant", master.ValidationError("Centang kotak konfirmasi dulu untuk menghapus tenant"))
		return
	}
	if err := s.deps.Master.DeleteTenant(r.Context(), id); err != nil {
		s.tenantError(w, r, id, "hapus tenant", err)
		return
	}
	s.back(w, r, "/admin/tenant", "tenant-dihapus")
}

// tenantError menampilkan ulang halaman tenant dengan pesan kesalahan.
func (s *Server) tenantError(w http.ResponseWriter, r *http.Request, id int64, what string, err error) {
	msg, ok := userMessage(err)
	if !ok {
		s.fail(w, what, err)
		return
	}
	w.WriteHeader(http.StatusUnprocessableEntity)
	s.tenantPage(w, r, id, map[string]any{"Error": msg})
}

// ---------- koneksi HP tenant ----------

func baseURL(s *Server, r *http.Request) string {
	scheme := "http"
	if s.isHTTPS(r) {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

// handleAdminCode membuat kode baru dan menampilkannya SEKALI (tidak disimpan, tidak lewat redirect).
func (s *Server) handleAdminCode(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		http.NotFound(w, r)
		return
	}
	code, err := s.deps.Master.IssueCode(r.Context(), id)
	if err != nil {
		s.tenantError(w, r, id, "buat kode", err)
		return
	}
	link := baseURL(s, r) + "/masuk#" + code
	extra := map[string]any{"NewCode": master.FormatCode(code), "Link": link}
	if png, err := qrcode.Encode(link, qrcode.Medium, 240); err == nil {
		extra["QR"] = template.URL("data:image/png;base64," + base64.StdEncoding.EncodeToString(png))
	} else {
		s.log.Error("qr kode koneksi", "err", err)
	}
	s.tenantPage(w, r, id, extra)
}

func (s *Server) handleAdminRevoke(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		http.NotFound(w, r)
		return
	}
	if err := s.deps.Master.RevokeDevices(r.Context(), id); err != nil {
		s.tenantError(w, r, id, "putus HP", err)
		return
	}
	s.back(w, r, tenantPath(id), "perangkat-putus")
}

// ---------- menu ----------

func menuInput(r *http.Request) master.MenuInput {
	sort, _ := strconv.Atoi(r.PostFormValue("sort"))
	return master.MenuInput{
		Name: r.PostFormValue("name"), Price: r.PostFormValue("price"),
		Available: r.PostFormValue("available") == "1", Sort: sort,
	}
}

func (s *Server) handleAdminMenuCreate(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok || !s.parseForm(w, r) {
		return
	}
	in := menuInput(r)
	in.Available = true // menu baru langsung tersedia
	if err := s.deps.Master.CreateMenu(r.Context(), id, in); err != nil {
		s.tenantError(w, r, id, "tambah menu", err)
		return
	}
	s.back(w, r, tenantPath(id), "menu-ditambah")
}

func (s *Server) handleAdminMenuUpdate(w http.ResponseWriter, r *http.Request) {
	id, ok1 := pathID(r, "id")
	mid, ok2 := pathID(r, "mid")
	if !ok1 || !ok2 || !s.parseForm(w, r) {
		return
	}
	if err := s.deps.Master.UpdateMenu(r.Context(), id, mid, menuInput(r)); err != nil {
		s.tenantError(w, r, id, "ubah menu", err)
		return
	}
	s.back(w, r, tenantPath(id), "menu-disimpan")
}

func (s *Server) handleAdminMenuDelete(w http.ResponseWriter, r *http.Request) {
	id, ok1 := pathID(r, "id")
	mid, ok2 := pathID(r, "mid")
	if !ok1 || !ok2 {
		http.NotFound(w, r)
		return
	}
	if err := s.deps.Master.DeleteMenu(r.Context(), id, mid); err != nil {
		s.tenantError(w, r, id, "hapus menu", err)
		return
	}
	s.back(w, r, tenantPath(id), "menu-dihapus")
}
