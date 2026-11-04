// Package voucher berisi logika inti: memakai voucher (scan) secara atomik.
package voucher

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// Querier dipenuhi oleh *pgxpool.Pool.
type Querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type Service struct{ db Querier }

func NewService(db Querier) *Service { return &Service{db: db} }

// ScanResult adalah respons ke tenant. Result: ok | used | expired | void | invalid.
type ScanResult struct {
	Result string     `json:"result"`
	Staff  string     `json:"staff,omitempty"`
	Unit   string     `json:"unit,omitempty"`
	Amount int        `json:"amount,omitempty"`
	At     *time.Time `json:"at,omitempty"`
	UsedAt *time.Time `json:"usedAt,omitempty"`
	Tenant string     `json:"tenant,omitempty"`
}

// Satu UPDATE bersyarat. PostgreSQL mengunci baris saat update, jadi jika dua
// tenant memindai kode yang sama di milidetik yang sama, hanya satu yang
// mendapat baris kembali.
const updateTmpl = `
WITH u AS (
  UPDATE vouchers
     SET status = 'used', used_at = now(),
         used_by_tenant_id = $2, scanned_by_user_id = $3
   WHERE %s
     AND status = 'issued'
     AND now() BETWEEN valid_from AND valid_until
  RETURNING staff_id, amount, used_at
)
SELECT s.name, s.unit, u.amount, u.used_at
  FROM u JOIN staff s ON s.id = u.staff_id`

// Dijalankan hanya jika UPDATE tidak mengembalikan baris, untuk memilih pesan.
const diagTmpl = `
SELECT v.status::text, v.used_at, t.name, s.name
  FROM vouchers v
  JOIN staff s ON s.id = v.staff_id
  LEFT JOIN tenants t ON t.id = v.used_by_tenant_id
 WHERE %s`

var (
	updateByToken = fmt.Sprintf(updateTmpl, "token_hash = $1")
	diagByToken   = fmt.Sprintf(diagTmpl, "v.token_hash = $1")

	// $4 = tanggal voucher (hari ini, WIB), dihitung oleh pemanggil.
	updateByCode = fmt.Sprintf(updateTmpl, "voucher_date = $4 AND short_code_hash = $1")
	diagByCode   = fmt.Sprintf(diagTmpl, "v.voucher_date = $2 AND v.short_code_hash = $1")
)

// ScanToken memakai voucher berdasarkan SHA-256(token) dari QR.
func (s *Service) ScanToken(ctx context.Context, tokenHash []byte, tenantID, userID int64) (ScanResult, error) {
	return s.scan(ctx, updateByToken, []any{tokenHash, tenantID, userID},
		diagByToken, []any{tokenHash})
}

// ScanShortCode memakai voucher berdasarkan kode pendek (HMAC) di tanggal tertentu.
func (s *Service) ScanShortCode(ctx context.Context, codeHash []byte, date time.Time, tenantID, userID int64) (ScanResult, error) {
	return s.scan(ctx, updateByCode, []any{codeHash, tenantID, userID, date},
		diagByCode, []any{codeHash, date})
}

func (s *Service) scan(ctx context.Context, updSQL string, updArgs []any, diagSQL string, diagArgs []any) (ScanResult, error) {
	var r ScanResult
	var at time.Time
	err := s.db.QueryRow(ctx, updSQL, updArgs...).Scan(&r.Staff, &r.Unit, &r.Amount, &at)
	if err == nil {
		r.Result, r.At = "ok", &at
		return r, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return ScanResult{}, err
	}

	var status string
	var usedAt *time.Time
	var tenant, staff *string
	err = s.db.QueryRow(ctx, diagSQL, diagArgs...).Scan(&status, &usedAt, &tenant, &staff)
	if errors.Is(err, pgx.ErrNoRows) {
		return ScanResult{Result: "invalid"}, nil
	}
	if err != nil {
		return ScanResult{}, err
	}

	switch status {
	case "used":
		r = ScanResult{Result: "used", UsedAt: usedAt}
		if tenant != nil {
			r.Tenant = *tenant
		}
		if staff != nil {
			r.Staff = *staff
		}
	case "void":
		r = ScanResult{Result: "void"}
	default: // 'issued' di luar jam berlaku, atau 'expired'
		r = ScanResult{Result: "expired"}
	}
	return r, nil
}
