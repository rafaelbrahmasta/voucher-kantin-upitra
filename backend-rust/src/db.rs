use crate::crypto::{self, generate_pairing_code, hash_pairing_code};
use crate::models::*;
use chrono::{DateTime, NaiveDate, Utc};
use sqlx::{PgPool, Row};

pub async fn create_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(20)
        .connect(database_url)
        .await?;

    // Pastikan skema migrasi tabel & kolom pendukung sudah terpasang
    run_auto_migrations(&pool).await?;

    Ok(pool)
}

pub async fn run_auto_migrations(pool: &PgPool) -> Result<(), sqlx::Error> {
    // 0002_admin_master DDL
    sqlx::query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS access_hash bytea;").execute(pool).await?;
    sqlx::query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;").execute(pool).await?;
    sqlx::query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();").execute(pool).await?;
    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS tenants_access_hash_uq ON tenants (access_hash) WHERE access_hash IS NOT NULL;").execute(pool).await?;

    sqlx::query(r#"
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
    "#).execute(pool).await?;

    let _ = sqlx::query("CREATE INDEX IF NOT EXISTS menu_items_tenant_idx ON menu_items (tenant_id, sort_order, name);").execute(pool).await;

    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS voucher_items (
            id           bigserial PRIMARY KEY,
            voucher_id   bigint  NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
            menu_item_id bigint  REFERENCES menu_items(id) ON DELETE SET NULL,
            name         text    NOT NULL,
            price        integer NOT NULL CHECK (price >= 0),
            qty          integer NOT NULL CHECK (qty BETWEEN 1 AND 20)
        );
    "#).execute(pool).await?;

    let _ = sqlx::query("CREATE INDEX IF NOT EXISTS voucher_items_voucher_idx ON voucher_items (voucher_id);").execute(pool).await;

    // Kolom short_code dan qr_payload untuk pengecekan serial number & QR di portal admin
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS short_code varchar(30);").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS qr_payload text;").execute(pool).await;

    // T-1: Tambah 'transferred' ke tipe enum payout_status
    let _ = sqlx::query("ALTER TYPE payout_status ADD VALUE IF NOT EXISTS 'transferred';").execute(pool).await;

    // K-1: Hapus akun legacy dengan format password plain:
    let _ = sqlx::query("DELETE FROM users WHERE password_hash LIKE 'plain:%';").execute(pool).await;

    // 0003_admin_login DDL (Constraint users fleksibel)
    let _ = sqlx::query("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_check;").execute(pool).await;
    let _ = sqlx::query(r#"
        ALTER TABLE users ADD CONSTRAINT users_check CHECK (
          (role = 'tenant'
             AND tenant_id     IS NOT NULL
             AND username      IS NOT NULL
             AND password_hash IS NOT NULL
             AND microsoft_oid IS NULL)
          OR
          (role <> 'tenant'
             AND tenant_id IS NULL
             AND (password_hash IS NOT NULL OR microsoft_oid IS NOT NULL))
        );
    "#).execute(pool).await;

    // K-1: Buat admin awal HANYA jika dispesifikasikan via ENV (INIT_ADMIN_PASSWORD) dan belum ada admin
    if let Ok(init_pass) = std::env::var("INIT_ADMIN_PASSWORD") {
        let admin_count: (i64,) = sqlx::query_as("SELECT count(*) FROM users WHERE role = 'admin'")
            .fetch_one(pool)
            .await
            .unwrap_or((0,));
        if admin_count.0 == 0 && init_pass.len() >= 8 {
            if let Ok(hash) = crate::crypto::hash_password(&init_pass) {
                let _ = sqlx::query(r#"
                    INSERT INTO users (role, username, password_hash, display_name, is_active)
                    VALUES ('admin'::user_role, 'admin.it', $1, 'Admin Super IT', true)
                    ON CONFLICT (username) DO NOTHING;
                "#)
                .bind(hash)
                .execute(pool)
                .await;
                tracing::info!("Akun Admin Super IT awal berhasil diinisialisasi secara aman via INIT_ADMIN_PASSWORD.");
            }
        }
    }

    Ok(())
}

// ── Staff Queries ─────────────────────────────────────────────────

pub async fn list_staff(pool: &PgPool, q: Option<&str>) -> Result<Vec<Staff>, sqlx::Error> {
    let q_trimmed = q.unwrap_or("").trim();
    let wib = chrono::FixedOffset::east_opt(7 * 3600).unwrap();
    let today = chrono::Utc::now().with_timezone(&wib).date_naive();

    if !q_trimmed.is_empty() {
        let pattern = format!("%{}%", q_trimmed.to_lowercase());
        let sql = r#"
            SELECT s.id, s.nip, s.name, s.email, s.unit, s.is_active, s.created_at,
                   v.id AS today_voucher_id,
                   v.short_code AS today_voucher_code,
                   v.qr_payload AS today_qr_payload,
                   v.status::text AS today_voucher_status,
                   (v.email_sent_at IS NOT NULL) AS today_voucher_email_sent,
                   v.used_at AS today_voucher_used_at,
                   t.name AS today_tenant_name
            FROM staff s
            LEFT JOIN vouchers v ON v.staff_id = s.id AND v.voucher_date = $2
            LEFT JOIN tenants t ON t.id = v.used_by_tenant_id
            WHERE LOWER(s.name) LIKE $1
               OR LOWER(COALESCE(s.nip, '')) LIKE $1
               OR LOWER(s.email) LIKE $1
               OR LOWER(s.unit) LIKE $1
            ORDER BY s.is_active DESC, s.name ASC
        "#;
        sqlx::query_as::<_, Staff>(sql)
            .bind(pattern)
            .bind(today)
            .fetch_all(pool)
            .await
    } else {
        let sql = r#"
            SELECT s.id, s.nip, s.name, s.email, s.unit, s.is_active, s.created_at,
                   v.id AS today_voucher_id,
                   v.short_code AS today_voucher_code,
                   v.qr_payload AS today_qr_payload,
                   v.status::text AS today_voucher_status,
                   (v.email_sent_at IS NOT NULL) AS today_voucher_email_sent,
                   v.used_at AS today_voucher_used_at,
                   t.name AS today_tenant_name
            FROM staff s
            LEFT JOIN vouchers v ON v.staff_id = s.id AND v.voucher_date = $1
            LEFT JOIN tenants t ON t.id = v.used_by_tenant_id
            ORDER BY s.is_active DESC, s.name ASC
        "#;
        sqlx::query_as::<_, Staff>(sql)
            .bind(today)
            .fetch_all(pool)
            .await
    }
}

pub async fn get_staff(pool: &PgPool, id: i64) -> Result<Option<Staff>, sqlx::Error> {
    let sql = r#"
        SELECT id, nip, name, email, unit, is_active, created_at,
               NULL::bigint AS today_voucher_id,
               NULL::varchar AS today_voucher_code,
               NULL::text AS today_qr_payload,
               NULL::text AS today_voucher_status,
               NULL::boolean AS today_voucher_email_sent,
               NULL::timestamptz AS today_voucher_used_at,
               NULL::text AS today_tenant_name
        FROM staff
        WHERE id = $1
    "#;
    sqlx::query_as::<_, Staff>(sql)
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn create_staff(pool: &PgPool, in_data: &StaffInput) -> Result<i64, sqlx::Error> {
    let nip_val = in_data.nip.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let sql = r#"
        INSERT INTO staff (nip, name, email, unit, is_active)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
    "#;
    let row = sqlx::query(sql)
        .bind(nip_val)
        .bind(in_data.name.trim())
        .bind(in_data.email.trim().to_lowercase())
        .bind(in_data.unit.trim())
        .bind(in_data.is_active)
        .fetch_one(pool)
        .await?;

    Ok(row.get("id"))
}

pub async fn update_staff(pool: &PgPool, id: i64, in_data: &StaffInput) -> Result<(), sqlx::Error> {
    let nip_val = in_data.nip.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let sql = r#"
        UPDATE staff
        SET nip = $2, name = $3, email = $4, unit = $5, is_active = $6, updated_at = now()
        WHERE id = $1
    "#;
    sqlx::query(sql)
        .bind(id)
        .bind(nip_val)
        .bind(in_data.name.trim())
        .bind(in_data.email.trim().to_lowercase())
        .bind(in_data.unit.trim())
        .bind(in_data.is_active)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn toggle_staff(pool: &PgPool, id: i64) -> Result<bool, sqlx::Error> {
    let sql = r#"
        UPDATE staff
        SET is_active = NOT is_active, updated_at = now()
        WHERE id = $1
        RETURNING is_active
    "#;
    let row = sqlx::query(sql).bind(id).fetch_one(pool).await?;
    Ok(row.get("is_active"))
}

pub async fn delete_staff(pool: &PgPool, id: i64) -> Result<(), String> {
    // Cek apakah staf memiliki riwayat voucher di database
    let count: (i64,) = sqlx::query_as("SELECT count(*) FROM vouchers WHERE staff_id = $1")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

    if count.0 > 0 {
        return Err(format!(
            "Dosen / Staf ini sudah memiliki {} riwayat voucher di sistem. Data tidak dapat dihapus permanen demi menjaga integritas laporan keuangan & audit transaksi kampus. Silakan gunakan tombol 'Nonaktifkan' (staf berstatus Nonaktif tidak akan menerima jatah voucher lagi).",
            count.0
        ));
    }

    sqlx::query("DELETE FROM staff WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ── Tenants Queries ───────────────────────────────────────────────

pub async fn list_tenants(pool: &PgPool) -> Result<Vec<Tenant>, sqlx::Error> {
    let sql = r#"
        SELECT t.id, t.name, COALESCE(t.stall_location, '') AS stall_location,
               t.owner_name, t.bank_name, t.bank_account,
               t.is_active,
               (t.access_hash IS NOT NULL) AS has_device,
               COALESCE((SELECT count(*) FROM menu_items m WHERE m.tenant_id = t.id), 0) AS menu_count
        FROM tenants t
        ORDER BY t.is_active DESC, t.name ASC
    "#;
    sqlx::query_as::<_, Tenant>(sql).fetch_all(pool).await
}

pub async fn get_tenant(pool: &PgPool, id: i64) -> Result<Option<Tenant>, sqlx::Error> {
    let sql = r#"
        SELECT t.id, t.name, COALESCE(t.stall_location, '') AS stall_location,
               t.owner_name, t.bank_name, t.bank_account,
               t.is_active,
               (t.access_hash IS NOT NULL) AS has_device,
               COALESCE((SELECT count(*) FROM menu_items m WHERE m.tenant_id = t.id), 0) AS menu_count
        FROM tenants t
        WHERE t.id = $1
    "#;
    sqlx::query_as::<_, Tenant>(sql)
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn create_tenant(pool: &PgPool, in_data: &TenantInput) -> Result<i64, sqlx::Error> {
    let stall_val = in_data.stall.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let bank_name_val = in_data.bank_name.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let bank_account_val = in_data.bank_account.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());

    let sql = r#"
        WITH t AS (
            INSERT INTO tenants (name, stall_location, owner_name, bank_name, bank_account, is_active)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, name
        )
        INSERT INTO users (role, tenant_id, username, password_hash, display_name)
        SELECT 'tenant', t.id, 'hp-tenant-' || t.id, '!', t.name FROM t
        RETURNING tenant_id
    "#;

    let row = sqlx::query(sql)
        .bind(in_data.name.trim())
        .bind(stall_val)
        .bind(in_data.owner.trim())
        .bind(bank_name_val)
        .bind(bank_account_val)
        .bind(in_data.active)
        .fetch_one(pool)
        .await?;

    Ok(row.get("tenant_id"))
}

pub async fn update_tenant(pool: &PgPool, id: i64, in_data: &TenantInput) -> Result<(), sqlx::Error> {
    let stall_val = in_data.stall.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let bank_name_val = in_data.bank_name.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let bank_account_val = in_data.bank_account.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());

    let sql = r#"
        UPDATE tenants
        SET name = $2, stall_location = $3, owner_name = $4,
            bank_name = $5, bank_account = $6, is_active = $7,
            updated_at = now(),
            session_version = session_version + CASE WHEN is_active AND NOT $7 THEN 1 ELSE 0 END
        WHERE id = $1
    "#;
    sqlx::query(sql)
        .bind(id)
        .bind(in_data.name.trim())
        .bind(stall_val)
        .bind(in_data.owner.trim())
        .bind(bank_name_val)
        .bind(bank_account_val)
        .bind(in_data.active)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn delete_tenant(pool: &PgPool, id: i64) -> Result<(), String> {
    // Cek apakah tenant memiliki transaksi voucher
    let count: (i64,) = sqlx::query_as("SELECT count(*) FROM vouchers WHERE used_by_tenant_id = $1")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

    if count.0 > 0 {
        return Err(format!(
            "Stan / Tenant ini sudah memiliki {} riwayat transaksi. Data tidak dapat dihapus permanen demi integritas laporan keuangan. Silakan nonaktifkan status stan.",
            count.0
        ));
    }

    // Hapus menu stan jika belum ada transaksi
    let _ = sqlx::query("DELETE FROM menu_items WHERE tenant_id = $1")
        .bind(id)
        .execute(pool)
        .await;

    sqlx::query("DELETE FROM tenants WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn issue_pairing_code(pool: &PgPool, tenant_id: i64) -> Result<String, sqlx::Error> {
    let code = generate_pairing_code();
    let hash = hash_pairing_code(&code);

    let sql = r#"
        UPDATE tenants
        SET access_hash = $2, updated_at = now()
        WHERE id = $1 AND is_active
    "#;
    sqlx::query(sql)
        .bind(tenant_id)
        .bind(hash)
        .execute(pool)
        .await?;

    Ok(code)
}

pub async fn revoke_devices(pool: &PgPool, tenant_id: i64) -> Result<(), sqlx::Error> {
    let sql = r#"
        UPDATE tenants
        SET access_hash = NULL, session_version = session_version + 1, updated_at = now()
        WHERE id = $1
    "#;
    sqlx::query(sql).bind(tenant_id).execute(pool).await?;
    Ok(())
}

pub async fn redeem_pairing_code(pool: &PgPool, raw_code: &str) -> Result<Option<(i64, i32)>, sqlx::Error> {
    let normalized = match crypto::normalize_pairing_code(raw_code) {
        Some(c) => c,
        None => return Ok(None),
    };
    let hash = hash_pairing_code(&normalized);
    // Sekali pakai (one-time use): hapus access_hash setelah dipakai dan naikkan session_version
    // sehingga HP lama otomatis terputus dan kode tidak bisa dipakai ulang.
    let sql = r#"
        UPDATE tenants
        SET access_hash = NULL,
            session_version = session_version + 1,
            updated_at = now()
        WHERE access_hash = $1 AND is_active
        RETURNING id, session_version
    "#;
    let row = sqlx::query(sql)
        .bind(hash)
        .fetch_optional(pool)
        .await?;

    if let Some(r) = row {
        Ok(Some((r.get("id"), r.get("session_version"))))
    } else {
        Ok(None)
    }
}

pub async fn get_tenant_version(pool: &PgPool, tenant_id: i64) -> Result<Option<i32>, sqlx::Error> {
    let sql = "SELECT session_version FROM tenants WHERE id = $1 AND is_active";
    let row = sqlx::query(sql)
        .bind(tenant_id)
        .fetch_optional(pool)
        .await?;

    Ok(row.map(|r| r.get("session_version")))
}

pub async fn is_session_valid(pool: &PgPool, tenant_id: i64, version: i32) -> Result<bool, sqlx::Error> {
    let sql = "SELECT EXISTS (SELECT 1 FROM tenants WHERE id = $1 AND is_active AND session_version = $2)";
    let row = sqlx::query(sql)
        .bind(tenant_id)
        .bind(version)
        .fetch_one(pool)
        .await?;

    Ok(row.get(0))
}

pub async fn get_tenant_user_id(pool: &PgPool, tenant_id: i64, dev_user_id: i64) -> i64 {
    let sql = "SELECT id FROM users WHERE tenant_id = $1 AND role = 'tenant' LIMIT 1";
    if let Ok(Some(row)) = sqlx::query(sql).bind(tenant_id).fetch_optional(pool).await {
        row.get("id")
    } else {
        dev_user_id
    }
}

// ── Menu Queries ──────────────────────────────────────────────────

pub async fn list_menu_items(pool: &PgPool, tenant_id: i64, only_available: bool) -> Result<Vec<MenuItem>, sqlx::Error> {
    let sql = if only_available {
        "SELECT id, tenant_id, name, price, is_available FROM menu_items WHERE tenant_id = $1 AND is_available ORDER BY sort_order, name"
    } else {
        "SELECT id, tenant_id, name, price, is_available FROM menu_items WHERE tenant_id = $1 ORDER BY sort_order, name"
    };
    sqlx::query_as::<_, MenuItem>(sql)
        .bind(tenant_id)
        .fetch_all(pool)
        .await
}

pub async fn create_menu_item(pool: &PgPool, tenant_id: i64, in_data: &MenuItemInput) -> Result<i64, sqlx::Error> {
    let sql = r#"
        INSERT INTO menu_items (tenant_id, name, price, is_available)
        VALUES ($1, $2, $3, $4)
        RETURNING id
    "#;
    let row = sqlx::query(sql)
        .bind(tenant_id)
        .bind(in_data.name.trim())
        .bind(in_data.price)
        .bind(in_data.available)
        .fetch_one(pool)
        .await?;

    Ok(row.get("id"))
}

pub async fn update_menu_item(pool: &PgPool, id: i64, tenant_id: i64, in_data: &MenuItemInput) -> Result<(), sqlx::Error> {
    let sql = r#"
        UPDATE menu_items
        SET name = $3, price = $4, is_available = $5, updated_at = now()
        WHERE id = $1 AND tenant_id = $2
    "#;
    sqlx::query(sql)
        .bind(id)
        .bind(tenant_id)
        .bind(in_data.name.trim())
        .bind(in_data.price)
        .bind(in_data.available)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn delete_menu_item(pool: &PgPool, id: i64, tenant_id: i64) -> Result<(), sqlx::Error> {
    let sql = "DELETE FROM menu_items WHERE id = $1 AND tenant_id = $2";
    sqlx::query(sql)
        .bind(id)
        .bind(tenant_id)
        .execute(pool)
        .await?;

    Ok(())
}

// ── Scanner Voucher ───────────────────────────────────────────────

pub async fn scan_by_token_hash(
    pool: &PgPool,
    token_hash: &[u8],
    tenant_id: i64,
    user_id: i64,
    items: Option<&[OrderLineIn]>,
) -> Result<ScanResult, sqlx::Error> {
    // 1. UPDATE atomik jika status masih 'issued' dan dalam rentang jam berlaku
    let upd_sql = r#"
        WITH u AS (
            UPDATE vouchers
            SET status = 'used', used_at = now(),
                used_by_tenant_id = $2, scanned_by_user_id = $3
            WHERE token_hash = $1
              AND status = 'issued'
              AND now() BETWEEN valid_from AND valid_until
            RETURNING id, staff_id, amount, used_at
        )
        SELECT u.id, s.name AS staff, s.unit, u.amount, u.used_at
        FROM u
        JOIN staff s ON s.id = u.staff_id
    "#;

    if let Some(row) = sqlx::query(upd_sql)
        .bind(token_hash)
        .bind(tenant_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?
    {
        let voucher_id: i64 = row.get("id");
        let used_at: DateTime<Utc> = row.get("used_at");
        let order = if let Some(it) = items {
            record_order_items(pool, voucher_id, tenant_id, it).await
        } else {
            None
        };

        return Ok(ScanResult {
            result: "ok".to_string(),
            staff: Some(row.get("staff")),
            unit: Some(row.get("unit")),
            amount: Some(row.get("amount")),
            at: Some(used_at.to_rfc3339()),
            used_at: Some(used_at.to_rfc3339()),
            tenant: None,
            message: None,
            order,
        });
    }

    // 2. Diagnosis mengapa tidak ter-update
    diagnose_voucher(pool, "v.token_hash = $1", token_hash).await
}

pub async fn scan_by_short_code(
    pool: &PgPool,
    code_hash: &[u8],
    voucher_date: NaiveDate,
    tenant_id: i64,
    user_id: i64,
    items: Option<&[OrderLineIn]>,
) -> Result<ScanResult, sqlx::Error> {
    let upd_sql = r#"
        WITH u AS (
            UPDATE vouchers
            SET status = 'used', used_at = now(),
                used_by_tenant_id = $2, scanned_by_user_id = $3
            WHERE voucher_date = $4
              AND short_code_hash = $1
              AND status = 'issued'
              AND now() BETWEEN valid_from AND valid_until
            RETURNING id, staff_id, amount, used_at
        )
        SELECT u.id, s.name AS staff, s.unit, u.amount, u.used_at
        FROM u
        JOIN staff s ON s.id = u.staff_id
    "#;

    if let Some(row) = sqlx::query(upd_sql)
        .bind(code_hash)
        .bind(tenant_id)
        .bind(user_id)
        .bind(voucher_date)
        .fetch_optional(pool)
        .await?
    {
        let voucher_id: i64 = row.get("id");
        let used_at: DateTime<Utc> = row.get("used_at");
        let order = if let Some(it) = items {
            record_order_items(pool, voucher_id, tenant_id, it).await
        } else {
            None
        };

        return Ok(ScanResult {
            result: "ok".to_string(),
            staff: Some(row.get("staff")),
            unit: Some(row.get("unit")),
            amount: Some(row.get("amount")),
            at: Some(used_at.to_rfc3339()),
            used_at: Some(used_at.to_rfc3339()),
            tenant: None,
            message: None,
            order,
        });
    }

    diagnose_voucher(pool, "v.short_code_hash = $1", code_hash).await
}

async fn diagnose_voucher(pool: &PgPool, where_clause: &str, hash: &[u8]) -> Result<ScanResult, sqlx::Error> {
    let diag_sql = format!(
        r#"
        SELECT v.status::text AS status, v.used_at, t.name AS tenant, s.name AS staff
        FROM vouchers v
        JOIN staff s ON s.id = v.staff_id
        LEFT JOIN tenants t ON t.id = v.used_by_tenant_id
        WHERE {}
        "#,
        where_clause
    );

    let row = sqlx::query(&diag_sql).bind(hash).fetch_optional(pool).await?;
    match row {
        Some(r) => {
            let status: String = r.get("status");
            let used_at: Option<DateTime<Utc>> = r.get("used_at");
            let tenant: Option<String> = r.get("tenant");
            let staff: Option<String> = r.get("staff");

            match status.as_str() {
                "used" => Ok(ScanResult {
                    result: "used".to_string(),
                    staff,
                    unit: None,
                    amount: None,
                    at: None,
                    used_at: used_at.map(|t| t.to_rfc3339()),
                    tenant,
                    message: Some("Voucher ini sudah digunakan sebelumnya".to_string()),
                    order: None,
                }),
                "void" => Ok(ScanResult {
                    result: "void".to_string(),
                    staff: None,
                    unit: None,
                    amount: None,
                    at: None,
                    used_at: None,
                    tenant: None,
                    message: Some("Voucher telah dibatalkan".to_string()),
                    order: None,
                }),
                _ => Ok(ScanResult {
                    result: "expired".to_string(),
                    staff: None,
                    unit: None,
                    amount: None,
                    at: None,
                    used_at: None,
                    tenant: None,
                    message: Some("Voucher sudah di luar jam berlaku".to_string()),
                    order: None,
                }),
            }
        }
        None => Ok(ScanResult {
            result: "invalid".to_string(),
            staff: None,
            unit: None,
            amount: None,
            at: None,
            used_at: None,
            tenant: None,
            message: Some("Kode voucher tidak valid atau tidak terdaftar".to_string()),
            order: None,
        }),
    }
}

// ── Item Pesanan Menu Kantin (Voucher Items) ───────────────────────

pub async fn record_order_items(
    pool: &PgPool,
    voucher_id: i64,
    tenant_id: i64,
    items: &[OrderLineIn],
) -> Option<OrderOut> {
    if items.is_empty() {
        return None;
    }

    let mut out_items = Vec::new();
    let mut total = 0;

    for item in items {
        if item.qty <= 0 {
            continue;
        }
        // Batasi qty antara 1 s/d 20 sesuai constraint database
        let valid_qty = item.qty.clamp(1, 20);

        // Hanya masukkan menu yang aktif (is_available = true) dan milik stan ini
        let sql = "SELECT name, price FROM menu_items WHERE id = $1 AND tenant_id = $2 AND is_available = true";
        if let Ok(Some(row)) = sqlx::query(sql).bind(item.id).bind(tenant_id).fetch_optional(pool).await {
            let name: String = row.get("name");
            let price: i32 = row.get("price");
            let subtotal = price * valid_qty;

            let ins_sql = r#"
                INSERT INTO voucher_items (voucher_id, menu_item_id, name, price, qty)
                VALUES ($1, $2, $3, $4, $5)
            "#;
            let ins_res = sqlx::query(ins_sql)
                .bind(voucher_id)
                .bind(item.id)
                .bind(&name)
                .bind(price)
                .bind(valid_qty)
                .execute(pool)
                .await;

            // Hanya sertakan di rincian pesanan jika penyimpanan ke database berhasil
            if ins_res.is_ok() {
                total += subtotal;
                out_items.push(OrderLineOut {
                    name,
                    qty: valid_qty,
                    price,
                    subtotal,
                });
            }
        }
    }

    if out_items.is_empty() {
        return None;
    }

    let pay = if total > 5000 { total - 5000 } else { 0 };
    Some(OrderOut {
        items: out_items,
        total,
        pay,
    })
}

// ── Verifikasi Login Pengguna (Auth) ──────────────────────────────

pub async fn verify_user_login(
    pool: &PgPool,
    role: &str,
    identifier: &str,
    password: &str,
) -> Result<User, String> {
    let id_clean = identifier.trim();

    // Tolak username kosong — mencegah login tanpa identifier
    if id_clean.is_empty() {
        return Err("Username wajib diisi".to_string());
    }
    if password.trim().is_empty() {
        return Err("Password wajib diisi".to_string());
    }

    // Query TANPA fallback "OR $2 = ''" — identifier harus cocok persis
    let sql = r#"
        SELECT id, role::text AS role, username, password_hash, display_name, is_active
        FROM users
        WHERE role::text = $1
          AND (LOWER(username) = LOWER($2) OR LOWER(display_name) = LOWER($2))
          AND is_active = true
        LIMIT 1
    "#;

    let user: Option<User> = sqlx::query_as::<_, User>(sql)
        .bind(role)
        .bind(id_clean)
        .fetch_optional(pool)
        .await
        .map_err(|_| "Terjadi kesalahan pada server. Silakan coba lagi.".to_string())?;

    let u = match user {
        Some(u) => u,
        None => return Err("Username atau password salah".to_string()),
    };

    let hash = u.password_hash.as_deref().unwrap_or("");

    // Verifikasi password murni dengan Argon2id — tolak plaintext legacy (K-1)
    if !crate::crypto::verify_password(password, hash) {
        return Err("Username atau password salah".to_string());
    }

    Ok(u)
}

// ── Auto Expire Job (Tandai Voucher Kedaluwarsa) ──────────────────

pub async fn auto_expire_vouchers(pool: &PgPool) -> Result<u64, sqlx::Error> {
    let sql = r#"
        UPDATE vouchers
        SET status = 'expired'
        WHERE status = 'issued'
          AND (now() > valid_until OR voucher_date < CURRENT_DATE)
    "#;
    let res = sqlx::query(sql).execute(pool).await?;
    Ok(res.rows_affected())
}

// ── Laporan Hari Ini (Kasir) ──────────────────────────────────────

pub async fn get_tenant_today_stats(pool: &PgPool, tenant_id: i64) -> Result<TodayData, sqlx::Error> {
    let sql = r#"
        SELECT COALESCE(count(*), 0) AS count,
               COALESCE(sum(amount), 0) AS total
        FROM vouchers
        WHERE used_by_tenant_id = $1
          AND used_at >= CURRENT_DATE
          AND status = 'used'
    "#;
    let row = sqlx::query(sql).bind(tenant_id).fetch_one(pool).await?;

    let recent_sql = r#"
        SELECT s.name AS staff_name, s.unit, v.short_code, v.amount, v.used_at
        FROM vouchers v
        JOIN staff s ON s.id = v.staff_id
        WHERE v.used_by_tenant_id = $1
          AND v.used_at >= CURRENT_DATE
          AND v.status = 'used'
        ORDER BY v.used_at DESC
        LIMIT 10
    "#;
    let recent_rows = sqlx::query(recent_sql).bind(tenant_id).fetch_all(pool).await.unwrap_or_default();
    let recent = recent_rows.into_iter().map(|r| {
        let used_at: DateTime<Utc> = r.get("used_at");
        crate::models::RecentScanItem {
            staff_name: r.get("staff_name"),
            unit: r.get("unit"),
            short_code: r.get("short_code"),
            amount: r.get("amount"),
            used_at: used_at.to_rfc3339(),
        }
    }).collect();

    Ok(TodayData {
        count: row.get("count"),
        total: row.get("total"),
        recent,
    })
}

// ── Audit Log (T-3: Jejak Audit Kriptografis / Tamper-Evident) ────

pub async fn write_audit_log(
    pool: &PgPool,
    user_id: Option<i64>,
    action: &str,
    voucher_id: Option<i64>,
    detail: serde_json::Value,
    reason: Option<&str>,
    ip_str: Option<&str>,
) -> Result<i64, sqlx::Error> {
    use sha2::{Digest, Sha256};

    // Ambil row_hash terakhir untuk hash chaining
    let last_hash_opt: Option<(Vec<u8>,)> = sqlx::query_as(
        "SELECT row_hash FROM audit_log ORDER BY id DESC LIMIT 1"
    )
    .fetch_optional(pool)
    .await?;

    let prev_hash = match last_hash_opt {
        Some((h,)) => h,
        None => vec![0u8; 32],
    };

    let now = chrono::Utc::now();
    let mut hasher = Sha256::new();
    hasher.update(&prev_hash);
    hasher.update(action.as_bytes());
    hasher.update(&user_id.unwrap_or(0).to_le_bytes());
    hasher.update(&now.timestamp().to_le_bytes());
    hasher.update(detail.to_string().as_bytes());
    let row_hash = hasher.finalize().to_vec();

    // Parse IP agar aman disimpan ke tipe inet PostgreSQL (T-3)
    let valid_ip = ip_str.and_then(|s| {
        let clean = s.split(':').next().unwrap_or(s).trim();
        if clean.is_empty() || clean == "localhost" {
            Some("127.0.0.1")
        } else if clean.contains('.') || clean.contains(':') {
            Some(clean)
        } else {
            None
        }
    });

    let sql = r#"
        INSERT INTO audit_log (
            created_at, user_id, action, voucher_id, detail, reason, ip, prev_hash, row_hash
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8, $9)
        RETURNING id
    "#;

    let row: (i64,) = sqlx::query_as(sql)
        .bind(now)
        .bind(user_id)
        .bind(action)
        .bind(voucher_id)
        .bind(detail)
        .bind(reason)
        .bind(valid_ip)
        .bind(prev_hash)
        .bind(row_hash)
        .fetch_one(pool)
        .await?;

    Ok(row.0)
}

