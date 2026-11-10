// Package master berisi data induk yang dikelola admin: tenant, kode koneksi
// HP tenant, dan menu kantin. Juga mencatat menu yang dipilih saat scan.
package master

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Querier dipenuhi oleh *pgxpool.Pool.
type Querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

type Service struct{ db Querier }

func NewService(db Querier) *Service { return &Service{db: db} }

var (
	ErrNotFound  = errors.New("data tidak ditemukan")
	ErrInUse     = errors.New("tenant sudah punya riwayat (voucher, settlement, payout, atau log); nonaktifkan saja, jangan dihapus")
	ErrBadCode   = errors.New("kode tidak dikenal")
	ErrDuplicate = errors.New("nama sudah dipakai")
)

// ValidationError dipakai untuk pesan yang aman ditampilkan ke admin.
type ValidationError string

func (e ValidationError) Error() string { return string(e) }

// Batas panjang mengikuti DDL: tenants.name varchar(100), stall_location varchar(50),
// owner_name varchar(150), bank_name varchar(50), bank_account varchar(30).
const (
	MaxNameLen  = 80 // nama menu (menu_items.name dibatasi 80 oleh migrasi 0002)
	MaxTenant   = 100
	MaxStall    = 50
	MaxOwner    = 150
	MaxBankName = 50
	MaxBankAcct = 30
	MaxPrice    = 1_000_000
	MaxQty      = 20
	MaxOrderLen = 30
)

// ---------- validasi ----------

func cleanText(s string, label string, max int) (string, error) {
	s = optText(s)
	if s == "" {
		return "", ValidationError(label + " wajib diisi")
	}
	if utf8.RuneCountInString(s) > max {
		return "", ValidationError(label + " maksimal " + strconv.Itoa(max) + " karakter")
	}
	return s, nil
}

// optText merapikan spasi; boleh kosong.
func optText(s string) string { return strings.Join(strings.Fields(s), " ") }

func optMax(s, label string, max int) (string, error) {
	s = optText(s)
	if utf8.RuneCountInString(s) > max {
		return "", ValidationError(label + " maksimal " + strconv.Itoa(max) + " karakter")
	}
	return s, nil
}

// ParsePrice menerima "15000", "15.000", "Rp 15.000". Desimal tidak dipakai.
func ParsePrice(s string) (int, error) {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.TrimPrefix(s, "rp")
	s = strings.NewReplacer(".", "", " ", "", ",", "").Replace(s)
	if s == "" {
		return 0, ValidationError("harga wajib diisi")
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 0 {
		return 0, ValidationError("harga harus berupa angka rupiah, contoh 15000")
	}
	if n > MaxPrice {
		return 0, ValidationError("harga terlalu besar")
	}
	return n, nil
}

// ---------- tenant ----------

type TenantRow struct {
	ID          int64
	Name        string
	Stall       string
	Owner       string
	BankName    string
	BankAccount string
	Active      bool
	HasCode     bool // ada kode aktivasi yang masih berlaku
	MenuCount   int
}

type TenantInput struct {
	Name        string
	Stall       string
	Owner       string // wajib: tenants.owner_name NOT NULL
	BankName    string // opsional
	BankAccount string // opsional
	Active      bool
}

func (in TenantInput) clean() (TenantInput, error) {
	var err error
	if in.Name, err = cleanText(in.Name, "Nama tenant", MaxTenant); err != nil {
		return in, err
	}
	if in.Owner, err = cleanText(in.Owner, "Nama pemilik", MaxOwner); err != nil {
		return in, err
	}
	if in.Stall, err = optMax(in.Stall, "Lokasi stan", MaxStall); err != nil {
		return in, err
	}
	if in.BankName, err = optMax(in.BankName, "Nama bank", MaxBankName); err != nil {
		return in, err
	}
	in.BankAccount = strings.NewReplacer(" ", "", "-", "").Replace(in.BankAccount)
	if len(in.BankAccount) > MaxBankAcct {
		return in, ValidationError("Nomor rekening maksimal " + strconv.Itoa(MaxBankAcct) + " karakter")
	}
	for _, r := range in.BankAccount {
		if r < '0' || r > '9' {
			return in, ValidationError("Nomor rekening hanya boleh berisi angka")
		}
	}
	if in.BankAccount != "" && in.BankName == "" {
		return in, ValidationError("Isi nama bank bila nomor rekening diisi")
	}
	return in, nil
}

const qTenantList = `
SELECT t.id, t.name, COALESCE(t.stall_location, ''), t.owner_name, t.is_active, t.access_hash IS NOT NULL,
       (SELECT count(*) FROM menu_items m WHERE m.tenant_id = t.id)
  FROM tenants t
 ORDER BY t.is_active DESC, t.name`

func (s *Service) ListTenants(ctx context.Context) ([]TenantRow, error) {
	rows, err := s.db.Query(ctx, qTenantList)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TenantRow
	for rows.Next() {
		var t TenantRow
		if err := rows.Scan(&t.ID, &t.Name, &t.Stall, &t.Owner, &t.Active, &t.HasCode, &t.MenuCount); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Service) GetTenant(ctx context.Context, id int64) (TenantRow, error) {
	t := TenantRow{ID: id}
	err := s.db.QueryRow(ctx, `
SELECT name, COALESCE(stall_location, ''), owner_name, COALESCE(bank_name, ''), COALESCE(bank_account, ''),
       is_active, access_hash IS NOT NULL,
       (SELECT count(*) FROM menu_items m WHERE m.tenant_id = tenants.id)
  FROM tenants WHERE id = $1`, id).Scan(&t.Name, &t.Stall, &t.Owner, &t.BankName, &t.BankAccount, &t.Active, &t.HasCode, &t.MenuCount)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrNotFound
	}
	return t, err
}

func (s *Service) CreateTenant(ctx context.Context, in TenantInput) (int64, error) {
	in, err := in.clean()
	if err != nil {
		return 0, err
	}
	// Satu perintah SQL (atomik): tenant + satu akun "pengguna HP" untuk tenant itu.
	// vouchers.scanned_by_user_id wajib terisi dan merujuk ke users, jadi setiap tenant
	// butuh satu baris users. password_hash berisi penanda '!' (bukan hash argon2),
	// sehingga akun ini tidak bisa dipakai login dengan password.
	var id int64
	err = s.db.QueryRow(ctx, qCreateTenant,
		in.Name, in.Stall, in.Owner, in.BankName, in.BankAccount, in.Active).Scan(&id)
	return id, mapPgErr(err)
}

const qCreateTenant = `
WITH t AS (
  INSERT INTO tenants (name, stall_location, owner_name, bank_name, bank_account, is_active)
  VALUES ($1, NULLIF($2, ''), $3, NULLIF($4, ''), NULLIF($5, ''), $6)
  RETURNING id, name
)
INSERT INTO users (role, tenant_id, username, password_hash, display_name)
SELECT 'tenant', t.id, 'hp-tenant-' || t.id, '!', t.name FROM t
RETURNING tenant_id`

func (s *Service) UpdateTenant(ctx context.Context, id int64, in TenantInput) error {
	in, err := in.clean()
	if err != nil {
		return err
	}
	// Menonaktifkan tenant juga memutus semua HP-nya.
	tag, err := s.db.Exec(ctx, `
UPDATE tenants
   SET name = $2, stall_location = NULLIF($3, ''), owner_name = $4,
       bank_name = NULLIF($5, ''), bank_account = NULLIF($6, ''), is_active = $7, updated_at = now(),
       session_version = session_version + CASE WHEN is_active AND NOT $7 THEN 1 ELSE 0 END
 WHERE id = $1`, id, in.Name, in.Stall, in.Owner, in.BankName, in.BankAccount, in.Active)
	if err != nil {
		return mapPgErr(err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteTenant hanya boleh untuk tenant yang belum punya riwayat apa pun:
// voucher terpakai, settlement, atau payout. Akun pengguna HP otomatisnya ikut dihapus.
// Jika masih ada data lain yang merujuk (misalnya audit_log), database menolak (FK)
// dan hasilnya sama: ErrInUse, jadi admin diminta menonaktifkan saja.
func (s *Service) DeleteTenant(ctx context.Context, id int64) error {
	var used bool
	if err := s.db.QueryRow(ctx, `
SELECT EXISTS (SELECT 1 FROM vouchers    WHERE used_by_tenant_id = $1)
    OR EXISTS (SELECT 1 FROM settlements WHERE tenant_id = $1)
    OR EXISTS (SELECT 1 FROM payouts     WHERE tenant_id = $1)`, id).Scan(&used); err != nil {
		return err
	}
	if used {
		return ErrInUse
	}
	tag, err := s.db.Exec(ctx, `
WITH u   AS (SELECT id FROM users WHERE tenant_id = $1),
     ses AS (DELETE FROM sessions        WHERE user_id IN (SELECT id FROM u)),
     dev AS (DELETE FROM tenant_devices  WHERE user_id IN (SELECT id FROM u)),
     usr AS (DELETE FROM users           WHERE tenant_id = $1)
DELETE FROM tenants WHERE id = $1`, id)
	var pe *pgconn.PgError
	if errors.As(err, &pe) && pe.Code == "23503" { // foreign_key_violation
		return ErrInUse
	}
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// TenantUser mengembalikan akun pengguna milik tenant (untuk scanned_by_user_id).
func (s *Service) TenantUser(ctx context.Context, tenantID int64) (int64, error) {
	var id int64
	err := s.db.QueryRow(ctx, `
SELECT id FROM users WHERE tenant_id = $1 AND role = 'tenant' AND is_active ORDER BY id LIMIT 1`, tenantID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	return id, err
}

func mapPgErr(err error) error {
	var pe *pgconn.PgError
	if errors.As(err, &pe) && pe.Code == "23505" {
		return ErrDuplicate
	}
	return err
}

// ---------- kode koneksi HP ----------

// Tanpa 0/O/1/I/L/U agar mudah diketik dari layar.
const codeAlphabet = "23456789ABCDEFGHJKMNPQRSTVWXYZ"

const codeLen = 10

// NewCode membuat kode acak 10 karakter (±49 bit), contoh "7M4QXP8RTK".
func NewCode() (string, error) {
	b := make([]byte, codeLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	out := make([]byte, codeLen)
	for i, v := range b {
		// 256 tidak habis dibagi 30; selisihnya kecil (bias <1%) dan tidak berarti
		// untuk kode sekali pakai yang juga dibatasi laju percobaannya.
		out[i] = codeAlphabet[int(v)%len(codeAlphabet)]
	}
	return string(out), nil
}

// NormalizeCode membuang spasi/strip, huruf besar, dan memeriksa panjang/karakter.
func NormalizeCode(s string) (string, bool) {
	s = strings.ToUpper(strings.NewReplacer("-", "", " ", "").Replace(strings.TrimSpace(s)))
	if len(s) != codeLen {
		return "", false
	}
	for i := 0; i < len(s); i++ {
		if strings.IndexByte(codeAlphabet, s[i]) < 0 {
			return "", false
		}
	}
	return s, true
}

// FormatCode: "7M4QX-P8RTK" untuk ditampilkan.
func FormatCode(c string) string {
	if len(c) != codeLen {
		return c
	}
	return c[:5] + "-" + c[5:]
}

func hashCode(c string) []byte {
	h := sha256.Sum256([]byte("upitra-tenant-code-v1:" + c))
	return h[:]
}

// IssueCode membuat kode baru; kode lama langsung mati. HP yang sudah masuk
// tetap masuk (pakai RevokeDevices untuk memutusnya). Kode asli hanya dikembalikan
// di sini dan tidak pernah disimpan.
func (s *Service) IssueCode(ctx context.Context, tenantID int64) (string, error) {
	for attempt := 0; attempt < 3; attempt++ {
		code, err := NewCode()
		if err != nil {
			return "", err
		}
		tag, err := s.db.Exec(ctx,
			`UPDATE tenants SET access_hash = $2, updated_at = now() WHERE id = $1 AND is_active`,
			tenantID, hashCode(code))
		if errors.Is(mapPgErr(err), ErrDuplicate) {
			continue // tabrakan hash, sangat jarang
		}
		if err != nil {
			return "", err
		}
		if tag.RowsAffected() == 0 {
			return "", ValidationError("tenant tidak aktif atau tidak ditemukan")
		}
		return code, nil
	}
	return "", errors.New("gagal membuat kode unik")
}

// RevokeDevices menghapus kode aktivasi dan memutus semua HP yang sudah masuk.
func (s *Service) RevokeDevices(ctx context.Context, tenantID int64) error {
	tag, err := s.db.Exec(ctx, `
UPDATE tenants SET access_hash = NULL, session_version = session_version + 1, updated_at = now()
 WHERE id = $1`, tenantID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Session = tenant yang berhasil masuk lewat kode, beserta versi sesinya.
type Session struct {
	TenantID int64
	Version  int
}

// Redeem menukar kode dengan identitas tenant (hanya tenant aktif).
func (s *Service) Redeem(ctx context.Context, rawCode string) (Session, error) {
	code, ok := NormalizeCode(rawCode)
	if !ok {
		return Session{}, ErrBadCode
	}
	var ss Session
	err := s.db.QueryRow(ctx,
		`SELECT id, session_version FROM tenants WHERE access_hash = $1 AND is_active`,
		hashCode(code)).Scan(&ss.TenantID, &ss.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrBadCode
	}
	return ss, err
}

// SessionValid memeriksa tenant masih aktif dan versi sesi cocok.
func (s *Service) SessionValid(ctx context.Context, ss Session) (bool, error) {
	var ok bool
	err := s.db.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM tenants WHERE id = $1 AND is_active AND session_version = $2)`,
		ss.TenantID, ss.Version).Scan(&ok)
	return ok, err
}

// TenantVersion dipakai mode dev (tenant bawaan tanpa cookie) dan tes.
func (s *Service) TenantVersion(ctx context.Context, id int64) (int, error) {
	var v int
	err := s.db.QueryRow(ctx, `SELECT session_version FROM tenants WHERE id = $1`, id).Scan(&v)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	return v, err
}

// ---------- menu ----------

type MenuItem struct {
	ID        int64
	TenantID  int64
	Name      string
	Price     int
	Available bool
	Sort      int
}

type MenuInput struct {
	Name      string
	Price     string // teks mentah dari form
	Available bool
	Sort      int
}

func (in MenuInput) clean() (string, int, error) {
	name, err := cleanText(in.Name, "Nama menu", MaxNameLen)
	if err != nil {
		return "", 0, err
	}
	price, err := ParsePrice(in.Price)
	if err != nil {
		return "", 0, err
	}
	return name, price, nil
}

// ListMenu: onlyAvailable=true untuk HP tenant, false untuk admin.
func (s *Service) ListMenu(ctx context.Context, tenantID int64, onlyAvailable bool) ([]MenuItem, error) {
	rows, err := s.db.Query(ctx, `
SELECT id, tenant_id, name, price, is_available, sort_order
  FROM menu_items
 WHERE tenant_id = $1 AND (is_available OR NOT $2)
 ORDER BY sort_order, name, id`, tenantID, onlyAvailable)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MenuItem
	for rows.Next() {
		var m MenuItem
		if err := rows.Scan(&m.ID, &m.TenantID, &m.Name, &m.Price, &m.Available, &m.Sort); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Service) CreateMenu(ctx context.Context, tenantID int64, in MenuInput) error {
	name, price, err := in.clean()
	if err != nil {
		return err
	}
	tag, err := s.db.Exec(ctx, `
INSERT INTO menu_items (tenant_id, name, price, is_available, sort_order)
SELECT id, $2, $3, $4, $5 FROM tenants WHERE id = $1`, tenantID, name, price, in.Available, in.Sort)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateMenu selalu dibatasi tenant_id agar admin tidak salah mengubah menu tenant lain.
func (s *Service) UpdateMenu(ctx context.Context, tenantID, menuID int64, in MenuInput) error {
	name, price, err := in.clean()
	if err != nil {
		return err
	}
	tag, err := s.db.Exec(ctx, `
UPDATE menu_items SET name = $3, price = $4, is_available = $5, sort_order = $6, updated_at = now()
 WHERE id = $2 AND tenant_id = $1`, tenantID, menuID, name, price, in.Available, in.Sort)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Service) DeleteMenu(ctx context.Context, tenantID, menuID int64) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM menu_items WHERE id = $2 AND tenant_id = $1`, tenantID, menuID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------- pesanan saat scan ----------

// OrderLine = satu baris menu yang dipilih tenant (dari HP: hanya id dan qty).
type OrderLine struct {
	MenuID int64
	Qty    int
}

// PricedLine = baris yang sudah dicocokkan dengan menu di database.
type PricedLine struct {
	MenuID int64
	Name   string
	Price  int
	Qty    int
}

func (l PricedLine) Subtotal() int { return l.Price * l.Qty }

// PriceOrder mencocokkan pilihan dari HP dengan menu tenant. Nama dan harga
// SELALU diambil dari database, tidak dari HP. Menu yang tidak ada, bukan milik
// tenant, atau sedang tidak tersedia diabaikan.
func (s *Service) PriceOrder(ctx context.Context, tenantID int64, lines []OrderLine) ([]PricedLine, error) {
	menu, err := s.ListMenu(ctx, tenantID, true)
	if err != nil {
		return nil, err
	}
	return PriceLines(menu, lines), nil
}

// PriceLines murni (tanpa database) agar mudah diuji.
func PriceLines(menu []MenuItem, lines []OrderLine) []PricedLine {
	byID := make(map[int64]MenuItem, len(menu))
	for _, m := range menu {
		byID[m.ID] = m
	}
	qty := map[int64]int{}
	var order []int64
	for _, l := range lines {
		if l.Qty < 1 {
			continue
		}
		if _, ok := byID[l.MenuID]; !ok {
			continue
		}
		if _, seen := qty[l.MenuID]; !seen {
			if len(order) >= MaxOrderLen {
				break
			}
			order = append(order, l.MenuID)
		}
		qty[l.MenuID] += l.Qty
		if qty[l.MenuID] > MaxQty {
			qty[l.MenuID] = MaxQty
		}
	}
	out := make([]PricedLine, 0, len(order))
	for _, id := range order {
		m := byID[id]
		out = append(out, PricedLine{MenuID: id, Name: m.Name, Price: m.Price, Qty: qty[id]})
	}
	return out
}

func OrderTotal(lines []PricedLine) int {
	t := 0
	for _, l := range lines {
		t += l.Subtotal()
	}
	return t
}

// RecordOrder menyimpan menu untuk voucher yang baru saja dipakai tenant itu
// pada waktu usedAt. Satu perintah SQL, jadi semua baris masuk atau tidak sama sekali.
// Mengembalikan false bila vouchernya tidak ditemukan.
func (s *Service) RecordOrder(ctx context.Context, tenantID int64, usedAt time.Time, lines []PricedLine) (bool, error) {
	if len(lines) == 0 {
		return true, nil
	}
	ids := make([]int64, len(lines))
	names := make([]string, len(lines))
	prices := make([]int32, len(lines))
	qtys := make([]int32, len(lines))
	for i, l := range lines {
		ids[i], names[i], prices[i], qtys[i] = l.MenuID, l.Name, int32(l.Price), int32(l.Qty)
	}
	tag, err := s.db.Exec(ctx, `
WITH v AS (
  SELECT id FROM vouchers
   WHERE used_by_tenant_id = $1 AND status = 'used' AND used_at = $2
   ORDER BY id DESC LIMIT 1
)
INSERT INTO voucher_items (voucher_id, menu_item_id, name, price, qty)
SELECT v.id, x.mid, x.name, x.price, x.qty
  FROM v, unnest($3::bigint[], $4::text[], $5::int[], $6::int[]) AS x(mid, name, price, qty)`,
		tenantID, usedAt, ids, names, prices, qtys)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
