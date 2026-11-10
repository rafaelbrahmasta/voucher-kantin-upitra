// Package report berisi query baca (read-only) untuk halaman tenant dan dashboard.
package report

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Querier dipenuhi oleh *pgxpool.Pool.
type Querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

type Service struct{ db Querier }

func NewService(db Querier) *Service { return &Service{db: db} }

// ---------- Tenant ----------

type Tenant struct {
	ID    int64
	Name  string
	Stall string
}

func (s *Service) Tenant(ctx context.Context, id int64) (Tenant, error) {
	t := Tenant{ID: id}
	err := s.db.QueryRow(ctx, qTenant, id).Scan(&t.Name, &t.Stall)
	return t, err
}

func (s *Service) Tenants(ctx context.Context) ([]Tenant, error) {
	rows, err := s.db.Query(ctx, qTenants)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Tenant
	for rows.Next() {
		var t Tenant
		if err := rows.Scan(&t.ID, &t.Name); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

type Scan struct {
	At     time.Time
	Staff  string
	Unit   string
	Amount int
	Voided bool
}

type TenantDay struct {
	Count int // tidak termasuk yang dibatalkan
	Total int // rupiah, tidak termasuk yang dibatalkan
	Scans []Scan
}

// TenantDay mengembalikan scan milik satu tenant pada rentang [from, to).
func (s *Service) TenantDay(ctx context.Context, tenantID int64, from, to time.Time) (TenantDay, error) {
	rows, err := s.db.Query(ctx, qTenantDay, tenantID, from, to)
	if err != nil {
		return TenantDay{}, err
	}
	defer rows.Close()
	var d TenantDay
	for rows.Next() {
		var sc Scan
		if err := rows.Scan(&sc.At, &sc.Staff, &sc.Unit, &sc.Amount, &sc.Voided); err != nil {
			return TenantDay{}, err
		}
		if !sc.Voided {
			d.Count++
			d.Total += sc.Amount
		}
		d.Scans = append(d.Scans, sc)
	}
	return d, rows.Err()
}

// ---------- Dashboard ----------

type Summary struct {
	Issued   int // voucher yang dibuat untuk tanggal itu
	Used     int
	Void     int
	Amount   int // rupiah yang harus diganti (voucher terpakai)
	Inactive int // staf nonaktif (tidak dapat voucher)
}

// Unused = voucher yang belum/tidak dipakai (bukan void).
func (s Summary) Unused() int { return s.Issued - s.Used - s.Void }

func (s *Service) Summary(ctx context.Context, date time.Time) (Summary, error) {
	var out Summary
	if err := s.db.QueryRow(ctx, qSummary, date).Scan(&out.Issued, &out.Used, &out.Void, &out.Amount); err != nil {
		return out, err
	}
	err := s.db.QueryRow(ctx, qInactive).Scan(&out.Inactive)
	return out, err
}

type TenantUsage struct {
	Name   string
	Count  int
	Amount int
}

func (s *Service) PerTenant(ctx context.Context, date time.Time) ([]TenantUsage, error) {
	rows, err := s.db.Query(ctx, qPerTenant, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TenantUsage
	for rows.Next() {
		var u TenantUsage
		if err := rows.Scan(&u.Name, &u.Count, &u.Amount); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *Service) Units(ctx context.Context) ([]string, error) {
	rows, err := s.db.Query(ctx, qUnits)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// ---------- Transaksi ----------

type TxFilter struct {
	From, To time.Time // tanggal (jam 00.00 di zona waktu kampus), keduanya inklusif
	TenantID int64     // 0 = semua
	Unit     string    // "" = semua
	Q        string    // cari nama/NIP staf
	Page     int
	PerPage  int
}

type Tx struct {
	At     time.Time
	Staff  string
	Unit   string
	Tenant string
	Amount int
	Voided bool
	Items  string // menu yang dipilih tenant, "2× Nasi goreng, 1× Es teh"; kosong jika tidak dipilih
}

type TxPage struct {
	Rows  []Tx
	Total int
	Page  int
	Pages int
}

const (
	defaultPerPage = 50
	maxPerPage     = 200
)

func (f TxFilter) normalized() TxFilter {
	if f.To.Before(f.From) {
		f.From, f.To = f.To, f.From
	}
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PerPage < 1 {
		f.PerPage = defaultPerPage
	}
	if f.PerPage > maxPerPage {
		f.PerPage = maxPerPage
	}
	f.Q = strings.TrimSpace(f.Q)
	return f
}

// EscapeLike meloloskan karakter khusus LIKE (% _ \) agar pencarian harfiah.
func EscapeLike(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}

const txFrom = ` FROM vouchers v
  JOIN staff s ON s.id = v.staff_id
  JOIN tenants t ON t.id = v.used_by_tenant_id
 WHERE `

// buildWhere menyusun kondisi dengan placeholder berurutan ($1, $2, ...).
func buildWhere(f TxFilter) (string, []any) {
	args := []any{f.From, f.To.AddDate(0, 0, 1)}
	w := `v.used_at IS NOT NULL AND v.status IN ('used', 'void') AND v.used_at >= $1 AND v.used_at < $2`
	add := func(cond string, v any) {
		args = append(args, v)
		w += " AND " + strings.ReplaceAll(cond, "?", fmt.Sprintf("$%d", len(args)))
	}
	if f.TenantID > 0 {
		add("v.used_by_tenant_id = ?", f.TenantID)
	}
	if f.Unit != "" {
		add("s.unit = ?", f.Unit)
	}
	if f.Q != "" {
		add("(s.name ILIKE ? OR s.nip ILIKE ?)", "%"+EscapeLike(f.Q)+"%")
	}
	return w, args
}

func (s *Service) Transactions(ctx context.Context, f TxFilter) (TxPage, error) {
	f = f.normalized()
	where, args := buildWhere(f)

	var total int
	if err := s.db.QueryRow(ctx, "SELECT count(*)"+txFrom+where, args...).Scan(&total); err != nil {
		return TxPage{}, err
	}
	pages := (total + f.PerPage - 1) / f.PerPage
	if pages < 1 {
		pages = 1
	}
	page := f.Page
	if page > pages {
		page = pages
	}

	q := "SELECT v.used_at, s.name, s.unit, t.name, v.amount, v.status = 'void', " + qItems + txFrom + where +
		fmt.Sprintf(" ORDER BY v.used_at DESC, v.id DESC LIMIT $%d OFFSET $%d", len(args)+1, len(args)+2)
	args = append(args, f.PerPage, (page-1)*f.PerPage)

	rows, err := s.db.Query(ctx, q, args...)
	if err != nil {
		return TxPage{}, err
	}
	defer rows.Close()
	out := TxPage{Total: total, Page: page, Pages: pages}
	for rows.Next() {
		var t Tx
		if err := rows.Scan(&t.At, &t.Staff, &t.Unit, &t.Tenant, &t.Amount, &t.Voided, &t.Items); err != nil {
			return TxPage{}, err
		}
		out.Rows = append(out.Rows, t)
	}
	return out, rows.Err()
}
