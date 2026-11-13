package server

import (
	"errors"
	"net/http"
	"strings"

	"voucher-kantin/internal/master"
)

// handleAdminStaff menampilkan daftar seluruh dosen dan staf penerima voucher harian.
func (s *Server) handleAdminStaff(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	list, err := s.deps.Master.ListStaff(r.Context(), q)
	if err != nil {
		s.fail(w, "daftar staf", err)
		return
	}

	totalActive := 0
	for _, st := range list {
		if st.IsActive {
			totalActive++
		}
	}

	s.renderAdmin(w, r, "admin_staff", map[string]any{
		"Title":       "Daftar Dosen & Staf",
		"Tab":         "staf",
		"StaffList":   list,
		"TotalStaff":  len(list),
		"TotalActive": totalActive,
		"Q":           q,
		"Flash":       flashText[r.URL.Query().Get("pesan")],
	})
}

// handleAdminStaffNew menampilkan formulir tambah dosen / staf baru.
func (s *Server) handleAdminStaffNew(w http.ResponseWriter, r *http.Request) {
	s.renderAdmin(w, r, "admin_staff_new", map[string]any{
		"Title": "Tambah Dosen & Staf",
		"Tab":   "staf",
		"In":    master.StaffInput{IsActive: true},
	})
}

// handleAdminStaffCreate memproses penambahan dosen / staf baru.
func (s *Server) handleAdminStaffCreate(w http.ResponseWriter, r *http.Request) {
	if !s.parseForm(w, r) {
		return
	}

	in := master.StaffInput{
		NIP:      strings.TrimSpace(r.PostFormValue("nip")),
		Name:     strings.TrimSpace(r.PostFormValue("name")),
		Email:    strings.TrimSpace(r.PostFormValue("email")),
		Unit:     strings.TrimSpace(r.PostFormValue("unit")),
		IsActive: r.PostFormValue("is_active") == "on" || r.PostFormValue("is_active") == "true" || r.PostFormValue("is_active") == "1",
	}

	_, err := s.deps.Master.CreateStaff(r.Context(), in)
	if err != nil {
		if msg, ok := userMessage(err); ok {
			w.WriteHeader(http.StatusUnprocessableEntity)
			s.renderAdmin(w, r, "admin_staff_new", map[string]any{
				"Title": "Tambah Dosen & Staf",
				"Tab":   "staf",
				"In":    in,
				"Error": msg,
			})
			return
		}
		s.fail(w, "tambah staf", err)
		return
	}

	s.back(w, r, "/admin/staf", "staf-dibuat")
}

// handleAdminStaffEdit menampilkan formulir edit data dosen / staf.
func (s *Server) handleAdminStaffEdit(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		http.NotFound(w, r)
		return
	}

	st, err := s.deps.Master.GetStaff(r.Context(), id)
	if errors.Is(err, master.ErrNotFound) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		s.fail(w, "ambil data staf", err)
		return
	}

	in := master.StaffInput{
		NIP:      st.NIP,
		Name:     st.Name,
		Email:    st.Email,
		Unit:     st.Unit,
		IsActive: st.IsActive,
	}

	s.renderAdmin(w, r, "admin_staff_new", map[string]any{
		"Title":   "Ubah Data: " + st.Name,
		"Tab":     "staf",
		"StaffID": st.ID,
		"In":      in,
	})
}

// handleAdminStaffUpdate memproses penyimpanan perubahan dosen / staf.
func (s *Server) handleAdminStaffUpdate(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		http.NotFound(w, r)
		return
	}

	if !s.parseForm(w, r) {
		return
	}

	in := master.StaffInput{
		NIP:      strings.TrimSpace(r.PostFormValue("nip")),
		Name:     strings.TrimSpace(r.PostFormValue("name")),
		Email:    strings.TrimSpace(r.PostFormValue("email")),
		Unit:     strings.TrimSpace(r.PostFormValue("unit")),
		IsActive: r.PostFormValue("is_active") == "on" || r.PostFormValue("is_active") == "true" || r.PostFormValue("is_active") == "1",
	}

	err := s.deps.Master.UpdateStaff(r.Context(), id, in)
	if err != nil {
		if msg, ok := userMessage(err); ok {
			w.WriteHeader(http.StatusUnprocessableEntity)
			s.renderAdmin(w, r, "admin_staff_new", map[string]any{
				"Title":   "Ubah Data: " + in.Name,
				"Tab":     "staf",
				"StaffID": id,
				"In":      in,
				"Error":   msg,
			})
			return
		}
		s.fail(w, "update staf", err)
		return
	}

	s.back(w, r, "/admin/staf", "staf-disimpan")
}

// handleAdminStaffToggle mengaktifkan atau menonaktifkan staf.
func (s *Server) handleAdminStaffToggle(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		http.NotFound(w, r)
		return
	}

	if err := s.deps.Master.ToggleStaff(r.Context(), id); err != nil {
		s.fail(w, "toggle staf", err)
		return
	}

	s.back(w, r, "/admin/staf", "staf-status")
}

// handleAdminStaffDelete menghapus data dosen / staf (hanya jika belum ada voucher).
func (s *Server) handleAdminStaffDelete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		http.NotFound(w, r)
		return
	}

	err := s.deps.Master.DeleteStaff(r.Context(), id)
	if errors.Is(err, master.ErrStaffInUse) {
		s.back(w, r, "/admin/staf", "staf-gagal")
		return
	}
	if err != nil {
		s.fail(w, "hapus staf", err)
		return
	}

	s.back(w, r, "/admin/staf", "staf-dihapus")
}
