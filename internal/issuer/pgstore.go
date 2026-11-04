package issuer

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// DBTX dipenuhi oleh *pgxpool.Pool.
type DBTX interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// PGStore adalah implementasi Store di atas PostgreSQL.
type PGStore struct{ DB DBTX }

func (p PGStore) IsHoliday(ctx context.Context, date time.Time) (bool, error) {
	var ok bool
	err := p.DB.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM holidays WHERE date = $1)`, date).Scan(&ok)
	return ok, err
}

func (p PGStore) ActiveStaff(ctx context.Context) ([]Staff, error) {
	rows, err := p.DB.Query(ctx, `SELECT id, name, email FROM staff WHERE is_active ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Staff
	for rows.Next() {
		var s Staff
		if err := rows.Scan(&s.ID, &s.Name, &s.Email); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (p PGStore) CreateVoucher(ctx context.Context, v NewVoucher) (int64, bool, error) {
	var id int64
	err := p.DB.QueryRow(ctx, `
		INSERT INTO vouchers (staff_id, voucher_date, token_hash, short_code_hash, valid_from, valid_until)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (staff_id, voucher_date) DO NOTHING
		RETURNING id`,
		v.StaffID, v.Date, v.TokenHash, v.CodeHash, v.ValidFrom, v.ValidUntil).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return id, true, nil
}

func (p PGStore) RotateUnsent(ctx context.Context, v NewVoucher) (int64, bool, error) {
	var id int64
	err := p.DB.QueryRow(ctx, `
		UPDATE vouchers
		   SET token_hash = $3, short_code_hash = $4, valid_from = $5, valid_until = $6
		 WHERE staff_id = $1 AND voucher_date = $2
		   AND status = 'issued' AND email_sent_at IS NULL
		RETURNING id`,
		v.StaffID, v.Date, v.TokenHash, v.CodeHash, v.ValidFrom, v.ValidUntil).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return id, true, nil
}

func (p PGStore) MarkSent(ctx context.Context, id int64) error {
	var got int64
	return p.DB.QueryRow(ctx, `UPDATE vouchers SET email_sent_at = now() WHERE id = $1 RETURNING id`, id).Scan(&got)
}
