-- 0002: admin master (kelola tenant, koneksi HP tenant, menu kantin)
-- Aman dijalankan ulang.

-- Koneksi HP tenant: admin membuat kode aktivasi; HP memasukkan kode itu di /masuk.
-- Yang disimpan hanya hash-nya. session_version dinaikkan untuk memutus semua HP.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS access_hash     bytea;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS tenants_access_hash_uq
    ON tenants (access_hash) WHERE access_hash IS NOT NULL;

-- Setiap tenant butuh satu baris users: vouchers.scanned_by_user_id wajib terisi saat scan.
-- Untuk tenant yang belum punya, buat akun "pengguna HP". password_hash '!' bukan hash
-- argon2 yang sah, jadi akun ini tidak bisa dipakai login dengan password.
INSERT INTO users (role, tenant_id, username, password_hash, display_name)
SELECT 'tenant', t.id, 'hp-tenant-' || t.id, '!', t.name
  FROM tenants t
 WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = t.id AND u.role = 'tenant')
ON CONFLICT (username) DO NOTHING;

-- Menu kantin, dikelola admin per tenant.
CREATE TABLE IF NOT EXISTS menu_items (
    id           bigserial PRIMARY KEY,
    tenant_id    bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name         text        NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    price        integer     NOT NULL CHECK (price >= 0),
    is_available boolean     NOT NULL DEFAULT true,
    sort_order   integer     NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS menu_items_tenant_idx ON menu_items (tenant_id, sort_order, name);

-- Menu yang dipilih tenant saat scan. Nama dan harga disalin (snapshot) supaya
-- laporan lama tidak berubah ketika menu diedit atau dihapus.
CREATE TABLE IF NOT EXISTS voucher_items (
    id           bigserial PRIMARY KEY,
    voucher_id   bigint  NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    menu_item_id bigint  REFERENCES menu_items(id) ON DELETE SET NULL,
    name         text    NOT NULL,
    price        integer NOT NULL CHECK (price >= 0),
    qty          integer NOT NULL CHECK (qty BETWEEN 1 AND 20)
);
CREATE INDEX IF NOT EXISTS voucher_items_voucher_idx ON voucher_items (voucher_id);
