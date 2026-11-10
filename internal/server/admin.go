package server

import (
	"net/http"
	"net/url"
	"strconv"
	"time"

	"voucher-kantin/internal/idfmt"
	"voucher-kantin/internal/report"
)

const dateLayout = "2006-01-02"

func dayLabel(t time.Time) string { return idfmt.Date(t) }

// parseDate membaca YYYY-MM-DD; jika kosong atau salah, memakai nilai bawaan.
func (s *Server) parseDate(v string, def time.Time) time.Time {
	if v == "" {
		return def
	}
	d, err := time.ParseInLocation(dateLayout, v, s.cfg.Location)
	if err != nil {
		return def
	}
	return d
}

// Ringkasan harian untuk Biro Keuangan / admin.
func (s *Server) handleAdminHome(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	now := s.now().In(s.cfg.Location)
	today, _ := s.dayRange(now)
	date := s.parseDate(r.URL.Query().Get("tanggal"), today)

	sum, err := s.deps.Reports.Summary(ctx, date)
	if err != nil {
		s.fail(w, "ringkasan", err)
		return
	}
	per, err := s.deps.Reports.PerTenant(ctx, date)
	if err != nil {
		s.fail(w, "per tenant", err)
		return
	}
	recent, err := s.deps.Reports.Transactions(ctx, report.TxFilter{From: date, To: date, PerPage: 8})
	if err != nil {
		s.fail(w, "transaksi terbaru", err)
		return
	}

	pct := 0
	if sum.Issued > 0 {
		pct = (sum.Used*100 + sum.Issued/2) / sum.Issued
	}
	maxCount := 1
	for _, u := range per {
		if u.Count > maxCount {
			maxCount = u.Count
		}
	}
	all := url.Values{"dari": {date.Format(dateLayout)}, "sampai": {date.Format(dateLayout)}}

	s.render(w, "admin_home", map[string]any{
		"Title": "Ringkasan", "Tab": "ringkasan",
		"Date": date.Format(dateLayout), "DateLabel": idfmt.Date(date),
		"IsToday": date.Equal(today), "Updated": idfmt.Clock(now),
		"Sum": sum, "Unused": sum.Unused(), "Pct": pct,
		"Tenants": per, "MaxCount": maxCount,
		"Recent": recent.Rows, "RecentTotal": recent.Total,
		"AllURL": "/admin/transaksi?" + all.Encode(),
	})
}

const txPerPage = 50

// Daftar semua transaksi dengan filter dan pagination.
func (s *Server) handleAdminTx(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()
	today, _ := s.dayRange(s.now())

	from := s.parseDate(q.Get("dari"), today)
	to := s.parseDate(q.Get("sampai"), from)
	tenantID, _ := strconv.ParseInt(q.Get("tenant"), 10, 64)
	page, _ := strconv.Atoi(q.Get("page"))
	f := report.TxFilter{From: from, To: to, TenantID: tenantID, Unit: q.Get("unit"), Q: q.Get("q"), Page: page, PerPage: txPerPage}

	res, err := s.deps.Reports.Transactions(ctx, f)
	if err != nil {
		s.fail(w, "transaksi", err)
		return
	}
	tenants, err := s.deps.Reports.Tenants(ctx)
	if err != nil {
		s.fail(w, "daftar tenant", err)
		return
	}
	units, err := s.deps.Reports.Units(ctx)
	if err != nil {
		s.fail(w, "daftar unit", err)
		return
	}

	// Tautan halaman sebelumnya/berikutnya membawa semua filter.
	base := url.Values{"dari": {from.Format(dateLayout)}, "sampai": {to.Format(dateLayout)}}
	if tenantID > 0 {
		base.Set("tenant", strconv.FormatInt(tenantID, 10))
	}
	if f.Unit != "" {
		base.Set("unit", f.Unit)
	}
	if f.Q != "" {
		base.Set("q", f.Q)
	}
	pageURL := func(p int) string {
		v := url.Values{}
		for k, vals := range base {
			v[k] = vals
		}
		v.Set("page", strconv.Itoa(p))
		return "/admin/transaksi?" + v.Encode()
	}
	var prev, next string
	if res.Page > 1 {
		prev = pageURL(res.Page - 1)
	}
	if res.Page < res.Pages {
		next = pageURL(res.Page + 1)
	}
	first := (res.Page-1)*txPerPage + 1
	last := first + len(res.Rows) - 1

	s.render(w, "admin_tx", map[string]any{
		"Title": "Transaksi", "Tab": "transaksi",
		"Dari": from.Format(dateLayout), "Sampai": to.Format(dateLayout),
		"TenantID": tenantID, "Unit": f.Unit, "Q": f.Q,
		"Tenants": tenants, "Units": units,
		"Rows": res.Rows, "Total": res.Total, "Page": res.Page, "Pages": res.Pages,
		"First": first, "Last": last, "Prev": prev, "Next": next,
	})
}
