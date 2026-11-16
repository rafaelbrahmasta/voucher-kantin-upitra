use crate::crypto::{self, generate_pairing_code, hash_pairing_code};
use crate::models::*;
use chrono::{DateTime, NaiveDate, Utc};
use sqlx::{PgPool, Row};

pub async fn create_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    sqlx::postgres::PgPoolOptions::new()
        .max_connections(20)
        .connect(database_url)
        .await
}

// ── Staff Queries ─────────────────────────────────────────────────

pub async fn list_staff(pool: &PgPool, q: Option<&str>) -> Result<Vec<Staff>, sqlx::Error> {
    let q_trimmed = q.unwrap_or("").trim();
    if !q_trimmed.is_empty() {
        let pattern = format!("%{}%", q_trimmed.to_lowercase());
        let sql = r#"
            SELECT id, nip, name, email, unit, is_active, created_at
            FROM staff
            WHERE LOWER(name) LIKE $1
               OR LOWER(COALESCE(nip, '')) LIKE $1
               OR LOWER(email) LIKE $1
               OR LOWER(unit) LIKE $1
            ORDER BY is_active DESC, name ASC
        "#;
        sqlx::query_as::<_, Staff>(sql)
            .bind(pattern)
            .fetch_all(pool)
            .await
    } else {
        let sql = r#"
            SELECT id, nip, name, email, unit, is_active, created_at
            FROM staff
            ORDER BY is_active DESC, name ASC
        "#;
        sqlx::query_as::<_, Staff>(sql).fetch_all(pool).await
    }
}

pub async fn get_staff(pool: &PgPool, id: i64) -> Result<Option<Staff>, sqlx::Error> {
    let sql = r#"
        SELECT id, nip, name, email, unit, is_active, created_at
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
    let stall_val = if in_data.stall.trim().is_empty() { None } else { Some(in_data.stall.trim()) };
    let bank_name_val = if in_data.bank_name.trim().is_empty() { None } else { Some(in_data.bank_name.trim()) };
    let bank_account_val = if in_data.bank_account.trim().is_empty() { None } else { Some(in_data.bank_account.trim()) };

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
    let stall_val = if in_data.stall.trim().is_empty() { None } else { Some(in_data.stall.trim()) };
    let bank_name_val = if in_data.bank_name.trim().is_empty() { None } else { Some(in_data.bank_name.trim()) };
    let bank_account_val = if in_data.bank_account.trim().is_empty() { None } else { Some(in_data.bank_account.trim()) };

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
    let sql = r#"
        SELECT id, session_version
        FROM tenants
        WHERE access_hash = $1 AND is_active
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

// ── Scanner Voucher ───────────────────────────────────────────────

pub async fn scan_by_token_hash(
    pool: &PgPool,
    token_hash: &[u8],
    tenant_id: i64,
    user_id: i64,
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
        let used_at: DateTime<Utc> = row.get("used_at");
        return Ok(ScanResult {
            result: "ok".to_string(),
            staff: Some(row.get("staff")),
            unit: Some(row.get("unit")),
            amount: Some(row.get("amount")),
            at: Some(used_at.to_rfc3339()),
            used_at: Some(used_at.to_rfc3339()),
            tenant: None,
            message: None,
            order: None,
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
        let used_at: DateTime<Utc> = row.get("used_at");
        return Ok(ScanResult {
            result: "ok".to_string(),
            staff: Some(row.get("staff")),
            unit: Some(row.get("unit")),
            amount: Some(row.get("amount")),
            at: Some(used_at.to_rfc3339()),
            used_at: Some(used_at.to_rfc3339()),
            tenant: None,
            message: None,
            order: None,
        });
    }

    diagnose_voucher(pool, "v.voucher_date = $2 AND v.short_code_hash = $1", code_hash).await
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
    Ok(TodayData {
        count: row.get("count"),
        total: row.get("total"),
    })
}
