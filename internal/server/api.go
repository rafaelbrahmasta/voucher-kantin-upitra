package server

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"voucher-kantin/internal/idfmt"
	"voucher-kantin/internal/master"
	"voucher-kantin/internal/report"
)

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"error": msg})
}

// ──────────────────────────────── Auth API ────────────────────────────────

// handleAPIAuthMe mengembalikan status sesi user yang sedang aktif.
func (s *Server) handleAPIAuthMe(w http.ResponseWriter, r *http.Request) {
	// 1. Cek sesi Admin IT
	if c, err := r.Cookie(adminCookie); err == nil && c.Value != "" {
		if ss, ok := s.decodeAdminSession(c.Value); ok && ss.Role == "admin" {
			writeJSON(w, http.StatusOK, map[string]any{
				"authenticated": true,
				"role":          "admin",
				"displayName":   ss.DisplayName,
				"userId":        ss.UserID,
			})
			return
		}
	}

	// 2. Cek sesi Biro Keuangan
	if c, err := r.Cookie(financeCookie); err == nil && c.Value != "" {
		if ss, ok := s.decodeAdminSession(c.Value); ok && ss.Role == "finance" {
			writeJSON(w, http.StatusOK, map[string]any{
				"authenticated": true,
				"role":          "finance",
				"displayName":   ss.DisplayName,
				"userId":        ss.UserID,
			})
			return
		}
	}

	// 3. Cek sesi Kasir Tenant
	if tID, ok := s.tenantID(w, r); ok && tID > 0 {
		tenant, err := s.deps.Reports.Tenant(r.Context(), tID)
		tName := "Stan Kantin"
		tStall := ""
		if err == nil {
			tName = tenant.Name
			tStall = tenant.Stall
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"authenticated": true,
			"role":          "tenant",
			"tenantId":      tID,
			"displayName":   tName,
			"stall":         tStall,
		})
		return
	}

	// Belum ada sesi aktif
	writeJSON(w, http.StatusOK, map[string]any{
		"authenticated": false,
		"role":          "",
	})
}

// handleAPILogin memproses login JSON untuk admin/finance atau pemilihan peran dev.
func (s *Server) handleAPILogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Role     string `json:"role"`     // "admin" atau "finance"
		Email    string `json:"email"`    // Opsional jika pakai form email
		Password string `json:"password"` // Opsional
	}

	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "format data tidak valid")
		return
	}

	role := strings.ToLower(strings.TrimSpace(in.Role))
	if role != "admin" && role != "finance" {
		writeErr(w, http.StatusBadRequest, "role harus 'admin' atau 'finance'")
		return
	}

	// Untuk kemudahan testing/dev (atau verifikasi credentials jika disediakan):
	displayName := "Admin Super IT"
	userID := int64(3)
	cookieName := adminCookie

	if role == "finance" {
		displayName = "Biro Keuangan"
		userID = int64(4)
		cookieName = financeCookie
	}

	// Pasang cookie sesi
	exp := s.now().Add(adminSessTTL)
	ss := adminSession{
		UserID:      userID,
		DisplayName: displayName,
		Role:        role,
	}
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

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":          true,
		"role":        role,
		"displayName": displayName,
		"userId":      userID,
	})
}

// handleAPILogout menghapus semua cookie sesi yang tersimpan.
func (s *Server) handleAPILogout(w http.ResponseWriter, r *http.Request) {
	clearCookie := func(name string) {
		http.SetCookie(w, &http.Cookie{
			Name:     name,
			Value:    "",
			Path:     "/",
			MaxAge:   -1,
			HttpOnly: true,
			Secure:   s.isHTTPS(r),
			SameSite: http.SameSiteLaxMode,
		})
	}

	clearCookie(adminCookie)
	clearCookie(financeCookie)
	clearCookie(sessionCookie)

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ──────────────────────────────── Admin API ────────────────────────────────

// handleAPIAdminSummary mengembalikan metrik ringkasan untuk dashboard Admin IT.
func (s *Server) handleAPIAdminSummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	now := s.now().In(s.cfg.Location)
	today, _ := s.dayRange(now)
	date := s.parseDate(r.URL.Query().Get("tanggal"), today)

	sum, err := s.deps.Reports.Summary(ctx, date)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "gagal memuat ringkasan: "+err.Error())
		return
	}

	tenantsUsage, err := s.deps.Reports.PerTenant(ctx, date)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "gagal memuat per tenant: "+err.Error())
		return
	}

	recent, err := s.deps.Reports.Transactions(ctx, report.TxFilter{From: date, To: date, PerPage: 10})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "gagal memuat transaksi: "+err.Error())
		return
	}

	staffList, _ := s.deps.Master.ListStaff(ctx, "")
	activeStaff := 0
	for _, st := range staffList {
		if st.IsActive {
			activeStaff++
		}
	}

	allTenants, _ := s.deps.Master.ListTenants(ctx)

	pct := 0
	if sum.Issued > 0 {
		pct = (sum.Used*100 + sum.Issued/2) / sum.Issued
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"date":         date.Format(dateLayout),
		"sum":          sum,
		"unused":       sum.Unused(),
		"pct":          pct,
		"tenantsUsage": tenantsUsage,
		"recent":       recent.Rows,
		"totalStaff":   len(staffList),
		"activeStaff":  activeStaff,
		"totalTenants": len(allTenants),
	})
}

// handleAPIAdminStaffList mengembalikan daftar dosen/staf penerima voucher.
func (s *Server) handleAPIAdminStaffList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	list, err := s.deps.Master.ListStaff(r.Context(), q)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "gagal memuat staf: "+err.Error())
		return
	}

	type staffOut struct {
		ID        int64     `json:"id"`
		NIP       string    `json:"nip"`
		Name      string    `json:"name"`
		Email     string    `json:"email"`
		Unit      string    `json:"unit"`
		IsActive  bool      `json:"is_active"`
		CreatedAt time.Time `json:"created_at"`
	}

	totalActive := 0
	out := make([]staffOut, 0, len(list))
	for _, st := range list {
		if st.IsActive {
			totalActive++
		}
		out = append(out, staffOut{
			ID:        st.ID,
			NIP:       st.NIP,
			Name:      st.Name,
			Email:     st.Email,
			Unit:      st.Unit,
			IsActive:  st.IsActive,
			CreatedAt: st.CreatedAt,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"staff":       out,
		"total":       len(list),
		"totalActive": totalActive,
		"q":           q,
	})
}

// handleAPIAdminStaffGet mengambil satu data staf berdasarkan ID.
func (s *Server) handleAPIAdminStaffGet(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "ID staf tidak valid")
		return
	}

	st, err := s.deps.Master.GetStaff(r.Context(), id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "data staf tidak ditemukan")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"staff": map[string]any{
			"id":         st.ID,
			"nip":        st.NIP,
			"name":       st.Name,
			"email":      st.Email,
			"unit":       st.Unit,
			"is_active":  st.IsActive,
			"created_at": st.CreatedAt,
		},
	})
}

// handleAPIAdminStaffCreate menambahkan staf baru via JSON.
func (s *Server) handleAPIAdminStaffCreate(w http.ResponseWriter, r *http.Request) {
	var in struct {
		NIP      string `json:"nip"`
		Name     string `json:"name"`
		Email    string `json:"email"`
		Unit     string `json:"unit"`
		IsActive bool   `json:"is_active"`
	}

	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "format JSON tidak valid")
		return
	}

	in.Name = strings.TrimSpace(in.Name)
	in.Email = strings.TrimSpace(in.Email)
	if in.Name == "" || in.Email == "" {
		writeErr(w, http.StatusBadRequest, "Nama lengkap dan email wajib diisi")
		return
	}

	id, err := s.deps.Master.CreateStaff(r.Context(), master.StaffInput{
		NIP:      in.NIP,
		Name:     in.Name,
		Email:    in.Email,
		Unit:     in.Unit,
		IsActive: in.IsActive,
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"ok": true,
		"id": id,
	})
}

// handleAPIAdminStaffUpdate memperbarui staf via JSON.
func (s *Server) handleAPIAdminStaffUpdate(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "ID staf tidak valid")
		return
	}

	var in struct {
		NIP      string `json:"nip"`
		Name     string `json:"name"`
		Email    string `json:"email"`
		Unit     string `json:"unit"`
		IsActive bool   `json:"is_active"`
	}

	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "format JSON tidak valid")
		return
	}

	in.Name = strings.TrimSpace(in.Name)
	in.Email = strings.TrimSpace(in.Email)
	if in.Name == "" || in.Email == "" {
		writeErr(w, http.StatusBadRequest, "Nama lengkap dan email wajib diisi")
		return
	}

	err := s.deps.Master.UpdateStaff(r.Context(), id, master.StaffInput{
		NIP:      in.NIP,
		Name:     in.Name,
		Email:    in.Email,
		Unit:     in.Unit,
		IsActive: in.IsActive,
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleAPIAdminStaffToggle mengubah status aktif/nonaktif staf.
func (s *Server) handleAPIAdminStaffToggle(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "ID staf tidak valid")
		return
	}

	if err := s.deps.Master.ToggleStaff(r.Context(), id); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleAPIAdminStaffDelete menghapus staf jika belum ada riwayat voucher.
func (s *Server) handleAPIAdminStaffDelete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "ID staf tidak valid")
		return
	}

	if err := s.deps.Master.DeleteStaff(r.Context(), id); err != nil {
		writeErr(w, http.StatusBadRequest, "Staf tidak dapat dihapus karena sudah memiliki riwayat voucher. Silakan nonaktifkan saja.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleAPIAdminTenantsList mengembalikan daftar stan kantin.
func (s *Server) handleAPIAdminTenantsList(w http.ResponseWriter, r *http.Request) {
	list, err := s.deps.Master.ListTenants(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "gagal memuat tenant: "+err.Error())
		return
	}

	type tenantOut struct {
		ID          int64  `json:"id"`
		Name        string `json:"name"`
		Stall       string `json:"stall"`
		Owner       string `json:"owner"`
		BankName    string `json:"bank_name"`
		BankAccount string `json:"bank_account"`
		Active      bool   `json:"active"`
		HasDevice   bool   `json:"has_device"`
		HasCode     bool   `json:"has_code"`
		MenuCount   int    `json:"menu_count"`
	}

	out := make([]tenantOut, 0, len(list))
	for _, t := range list {
		out = append(out, tenantOut{
			ID:          t.ID,
			Name:        t.Name,
			Stall:       t.Stall,
			Owner:       t.Owner,
			BankName:    t.BankName,
			BankAccount: t.BankAccount,
			Active:      t.Active,
			HasDevice:   !t.HasCode, // jika tidak ada kode gantung, berarti perangkat sudah tersambung
			HasCode:     t.HasCode,
			MenuCount:   t.MenuCount,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"tenants": out})
}

// handleAPIAdminTenantGet mengembalikan detail satu tenant beserta daftarmenu.
func (s *Server) handleAPIAdminTenantGet(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "ID tenant tidak valid")
		return
	}

	t, err := s.deps.Master.GetTenant(r.Context(), id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "tenant tidak ditemukan")
		return
	}

	menu, _ := s.deps.Master.ListMenu(r.Context(), id, false)

	writeJSON(w, http.StatusOK, map[string]any{
		"tenant": map[string]any{
			"id":           t.ID,
			"name":         t.Name,
			"stall":        t.Stall,
			"owner":        t.Owner,
			"bank_name":    t.BankName,
			"bank_account": t.BankAccount,
			"active":       t.Active,
			"has_device":   !t.HasCode,
			"has_code":     t.HasCode,
			"menu_count":   t.MenuCount,
		},
		"menu": menu,
	})
}

// handleAPIAdminTenantCreate membuat stan kantin baru.
func (s *Server) handleAPIAdminTenantCreate(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name        string `json:"name"`
		Stall       string `json:"stall"`
		Owner       string `json:"owner"`
		BankName    string `json:"bank_name"`
		BankAccount string `json:"bank_account"`
		Active      bool   `json:"active"`
	}

	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "format JSON tidak valid")
		return
	}

	id, err := s.deps.Master.CreateTenant(r.Context(), master.TenantInput{
		Name:        in.Name,
		Stall:       in.Stall,
		Owner:       in.Owner,
		BankName:    in.BankName,
		BankAccount: in.BankAccount,
		Active:      in.Active,
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"ok": true,
		"id": id,
	})
}

// handleAPIAdminTenantUpdate mengedit data stan kantin.
func (s *Server) handleAPIAdminTenantUpdate(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "ID tenant tidak valid")
		return
	}

	var in struct {
		Name        string `json:"name"`
		Stall       string `json:"stall"`
		Owner       string `json:"owner"`
		BankName    string `json:"bank_name"`
		BankAccount string `json:"bank_account"`
		Active      bool   `json:"active"`
	}

	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "format JSON tidak valid")
		return
	}

	err := s.deps.Master.UpdateTenant(r.Context(), id, master.TenantInput{
		Name:        in.Name,
		Stall:       in.Stall,
		Owner:       in.Owner,
		BankName:    in.BankName,
		BankAccount: in.BankAccount,
		Active:      in.Active,
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleAPIAdminTenantDelete menghapus stan kantin.
func (s *Server) handleAPIAdminTenantDelete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "ID tenant tidak valid")
		return
	}

	if err := s.deps.Master.DeleteTenant(r.Context(), id); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleAPIAdminTenantCode membuat kode pairing 10 karakter untuk stan.
func (s *Server) handleAPIAdminTenantCode(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "ID tenant tidak valid")
		return
	}

	code, err := s.deps.Master.IssueCode(r.Context(), id)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":   true,
		"code": master.FormatCode(code),
	})
}

// handleAPIAdminTenantRevoke memutuskan semua koneksi HP kasir stan.
func (s *Server) handleAPIAdminTenantRevoke(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "ID tenant tidak valid")
		return
	}

	if err := s.deps.Master.RevokeDevices(r.Context(), id); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleAPIAdminTx mengembalikan log transaksi voucher.
func (s *Server) handleAPIAdminTx(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	now := s.now().In(s.cfg.Location)
	today, _ := s.dayRange(now)

	dari := s.parseDate(q.Get("dari"), today)
	sampai := s.parseDate(q.Get("sampai"), today)

	var tenantID int64
	if v := q.Get("tenant"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			tenantID = id
		}
	}

	page := 1
	if v := q.Get("halaman"); v != "" {
		if p, err := strconv.Atoi(v); err == nil && p > 1 {
			page = p
		}
	}

	res, err := s.deps.Reports.Transactions(r.Context(), report.TxFilter{
		From:     dari,
		To:       sampai,
		TenantID: tenantID,
		Unit:     q.Get("unit"),
		Page:     page,
		PerPage:  20,
	})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	units, _ := s.deps.Reports.Units(r.Context())
	tenants, _ := s.deps.Reports.Tenants(r.Context())

	writeJSON(w, http.StatusOK, map[string]any{
		"transactions": res.Rows,
		"total":        res.Total,
		"page":         res.Page,
		"pages":        res.Pages,
		"perPage":      20,
		"dari":         dari.Format(dateLayout),
		"sampai":       sampai.Format(dateLayout),
		"units":        units,
		"tenants":      tenants,
	})
}

// ──────────────────────────────── Finance API ────────────────────────────────

// handleAPIFinanceSummary mengembalikan ringkasan anggaran kas untuk Biro Keuangan.
func (s *Server) handleAPIFinanceSummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	now := s.now().In(s.cfg.Location)
	today, _ := s.dayRange(now)
	date := s.parseDate(r.URL.Query().Get("tanggal"), today)

	sum, err := s.deps.Reports.Summary(ctx, date)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	per, err := s.deps.Reports.PerTenant(ctx, date)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	recent, err := s.deps.Reports.Transactions(ctx, report.TxFilter{From: date, To: date, PerPage: 10})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	budgetIssued := sum.Issued * 5000
	budgetUsed := sum.Used * 5000
	budgetExpired := sum.Unused() * 5000
	budgetVoid := sum.Void * 5000

	pctUsed := 0
	pctExpired := 0
	pctVoid := 0
	if sum.Issued > 0 {
		pctUsed = (sum.Used * 100) / sum.Issued
		pctExpired = (sum.Unused() * 100) / sum.Issued
		pctVoid = (sum.Void * 100) / sum.Issued
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"date":          date.Format(dateLayout),
		"dateLabel":     idfmt.Date(date),
		"isToday":       date.Equal(today),
		"sum":           sum,
		"unused":        sum.Unused(),
		"pctUsed":       pctUsed,
		"pctExpired":    pctExpired,
		"pctVoid":       pctVoid,
		"budgetIssued":  budgetIssued,
		"budgetUsed":    budgetUsed,
		"budgetExpired": budgetExpired,
		"budgetVoid":    budgetVoid,
		"tenants":       per,
		"recent":        recent.Rows,
	})
}

// handleAPIFinancePayouts mengembalikan rekap pencairan per tenant stan kantin.
func (s *Server) handleAPIFinancePayouts(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	now := s.now().In(s.cfg.Location)
	today, _ := s.dayRange(now)
	date := s.parseDate(r.URL.Query().Get("tanggal"), today)

	tenants, err := s.deps.Master.ListTenants(ctx)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	per, err := s.deps.Reports.PerTenant(ctx, date)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	usageByName := make(map[string]report.TenantUsage, len(per))
	for _, u := range per {
		usageByName[u.Name] = u
	}

	totalCount := 0
	totalAmount := 0
	items := make([]map[string]any, 0, len(tenants))
	for _, t := range tenants {
		u := usageByName[t.Name]
		totalCount += u.Count
		totalAmount += u.Amount
		items = append(items, map[string]any{
			"id":          t.ID,
			"name":        t.Name,
			"stall":       t.Stall,
			"owner":       t.Owner,
			"bankName":    t.BankName,
			"bankAccount": t.BankAccount,
			"count":       u.Count,
			"amount":      u.Amount,
			"active":      t.Active,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"date":        date.Format(dateLayout),
		"dateLabel":   idfmt.Date(date),
		"payouts":     items,
		"totalCount":  totalCount,
		"totalAmount": totalAmount,
	})
}
