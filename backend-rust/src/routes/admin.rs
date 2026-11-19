use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use axum_extra::extract::CookieJar;
use serde::Deserialize;
use std::sync::Arc;

use crate::models::{MenuItemInput, StaffInput, TenantInput};
use crate::AppState;

fn get_admin_user_id(jar: &CookieJar, key: &[u8]) -> Option<i64> {
    let now_unix = chrono::Utc::now().timestamp();
    jar.get("admin_sess")
        .and_then(|c| crate::crypto::decode_admin_session(key, c.value(), now_unix))
        .map(|s| s.user_id)
}

fn get_ip(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "127.0.0.1".to_string())
}

// ── Admin Staff CRUD ──────────────────────────────────────────────

#[derive(Deserialize)]
pub struct StaffQuery {
    pub q: Option<String>,
}

pub async fn handle_admin_staff_list(
    State(state): State<Arc<AppState>>,
    Query(query): Query<StaffQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let staff = crate::db::list_staff(&state.pool, query.q.as_deref())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))))?;

    let total = staff.len();
    let total_active = staff.iter().filter(|s| s.is_active).count();

    Ok(Json(serde_json::json!({
        "staff": staff,
        "total": total,
        "totalActive": total_active,
        "q": query.q.unwrap_or_default(),
    })))
}

pub async fn handle_admin_staff_get(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let staff = crate::db::get_staff(&state.pool, id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Staf tidak ditemukan" }))))?;

    Ok(Json(serde_json::json!({ "staff": staff })))
}

pub async fn handle_admin_staff_create(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<StaffInput>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let id = crate::db::create_staff(&state.pool, &payload)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))))?;

    Ok(Json(serde_json::json!({ "ok": true, "id": id })))
}

pub async fn handle_admin_staff_update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<StaffInput>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    crate::db::update_staff(&state.pool, id, &payload)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn handle_admin_staff_toggle(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    crate::db::toggle_staff(&state.pool, id)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn handle_admin_staff_delete(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    crate::db::delete_staff(&state.pool, id)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Admin Tenants CRUD ────────────────────────────────────────────

pub async fn handle_admin_tenants_list(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let tenants = crate::db::list_tenants(&state.pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))))?;

    Ok(Json(serde_json::json!({ "tenants": tenants })))
}

pub async fn handle_admin_tenant_create(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<TenantInput>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let id = crate::db::create_tenant(&state.pool, &payload)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))))?;

    Ok(Json(serde_json::json!({ "ok": true, "id": id })))
}

pub async fn handle_admin_tenant_update(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<TenantInput>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    crate::db::update_tenant(&state.pool, id, &payload)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))))?;

    // T-3: Jejak audit saat admin mengubah data rekening / info stan
    let user_id = get_admin_user_id(&jar, &state.config.qr_key);
    let ip = get_ip(&headers);
    let _ = crate::db::write_audit_log(
        &state.pool,
        user_id,
        "TENANT_BANK_UPDATE",
        None,
        serde_json::json!({
            "tenant_id": id,
            "name": payload.name,
            "bank_name": payload.bank_name,
            "bank_account": payload.bank_account,
        }),
        Some("Pembaruan data stan atau rekening pencairan dana kasir"),
        Some(&ip),
    )
    .await;

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn handle_admin_tenant_delete(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    crate::db::delete_tenant(&state.pool, id)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn handle_admin_tenant_issue_code(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let code = crate::db::issue_pairing_code(&state.pool, id)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))))?;

    // T-3: Jejak audit saat kode pairing diterbitkan
    let user_id = get_admin_user_id(&jar, &state.config.qr_key);
    let ip = get_ip(&headers);
    let _ = crate::db::write_audit_log(
        &state.pool,
        user_id,
        "TENANT_PAIRING_CODE_ISSUED",
        None,
        serde_json::json!({ "tenant_id": id }),
        Some("Penerbitan kode aktivasi pairing kasir"),
        Some(&ip),
    )
    .await;

    let formatted = crate::crypto::format_pairing_code(&code);
    Ok(Json(serde_json::json!({ "ok": true, "code": formatted })))
}

pub async fn handle_admin_tenant_revoke(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    crate::db::revoke_devices(&state.pool, id)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))))?;

    // T-3: Jejak audit saat seluruh perangkat kasir dicabut
    let user_id = get_admin_user_id(&jar, &state.config.qr_key);
    let ip = get_ip(&headers);
    let _ = crate::db::write_audit_log(
        &state.pool,
        user_id,
        "TENANT_DEVICES_REVOKED",
        None,
        serde_json::json!({ "tenant_id": id }),
        Some("Pencabutan seluruh perangkat aktif kasir stan"),
        Some(&ip),
    )
    .await;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Admin Summary & Transactions ──────────────────────────────────

#[derive(Deserialize)]
pub struct DateQuery {
    pub tanggal: Option<String>,
}

pub async fn handle_admin_summary(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DateQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let date_str = query.tanggal.unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());

    let sum_sql = r#"
        SELECT count(*) AS issued,
               count(*) FILTER (WHERE status = 'used') AS used,
               COALESCE(sum(amount) FILTER (WHERE status = 'used'), 0) AS nominal
        FROM vouchers
        WHERE voucher_date = $1::date
    "#;

    let row = sqlx::query(sum_sql)
        .bind(&date_str)
        .fetch_one(&state.pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))))?;

    use sqlx::Row;
    let issued: i64 = row.get("issued");
    let used: i64 = row.get("used");
    let nominal: i64 = row.get("nominal");

    let total_staff_sql = "SELECT count(*) FROM staff";
    let active_staff_sql = "SELECT count(*) FROM staff WHERE is_active";
    let total_tenants_sql = "SELECT count(*) FROM tenants WHERE is_active";

    let total_staff: i64 = sqlx::query_scalar(total_staff_sql).fetch_one(&state.pool).await.unwrap_or(0);
    let active_staff: i64 = sqlx::query_scalar(active_staff_sql).fetch_one(&state.pool).await.unwrap_or(0);
    let total_tenants: i64 = sqlx::query_scalar(total_tenants_sql).fetch_one(&state.pool).await.unwrap_or(0);

    let per_tenant_sql = r#"
        SELECT t.name, count(v.id) AS count, COALESCE(sum(v.amount), 0) AS amount
        FROM tenants t
        LEFT JOIN vouchers v ON v.used_by_tenant_id = t.id AND v.voucher_date = $1::date AND v.status = 'used'
        WHERE t.is_active
        GROUP BY t.id, t.name
        ORDER BY count(v.id) DESC, t.name ASC
    "#;

    let tenant_rows = sqlx::query(per_tenant_sql)
        .bind(&date_str)
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

    let tenants_usage: Vec<serde_json::Value> = tenant_rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "Name": r.get::<String, _>("name"),
                "Count": r.get::<i64, _>("count"),
                "Amount": r.get::<i64, _>("amount"),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "date": date_str,
        "sum": {
            "Issued": issued,
            "Used": used,
            "Nominal": nominal,
        },
        "unused": issued - used,
        "pct": if issued > 0 { (used as f64 / issued as f64 * 100.0) as i64 } else { 0 },
        "tenantsUsage": tenants_usage,
        "recent": [],
        "totalStaff": total_staff,
        "activeStaff": active_staff,
        "totalTenants": total_tenants,
    })))
}

#[derive(Deserialize)]
pub struct TxQuery {
    pub dari: Option<String>,
    pub sampai: Option<String>,
    pub tenant: Option<i64>,
    pub unit: Option<String>,
    pub halaman: Option<i64>,
}

pub async fn handle_transactions(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TxQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    use sqlx::Row;

    // Default tanggal: hari ini (WIB)
    let today = chrono::Utc::now()
        .with_timezone(&chrono::FixedOffset::east_opt(7 * 3600).unwrap())
        .format("%Y-%m-%d")
        .to_string();
    let dari = query.dari.clone().filter(|s| !s.is_empty()).unwrap_or_else(|| today.clone());
    let sampai = query.sampai.clone().filter(|s| !s.is_empty()).unwrap_or_else(|| today.clone());

    // Pagination
    let per_page: i64 = 50;
    let page = query.halaman.unwrap_or(1).max(1);
    let offset = (page - 1) * per_page;

    // Hitung total rows untuk pagination
    let count_sql = r#"
        SELECT count(*) AS cnt
        FROM vouchers v
        JOIN staff s ON s.id = v.staff_id
        LEFT JOIN tenants t ON t.id = v.used_by_tenant_id
        WHERE v.status IN ('used', 'void')
          AND v.voucher_date BETWEEN $1::date AND $2::date
          AND ($3::bigint IS NULL OR v.used_by_tenant_id = $3)
          AND ($4::text IS NULL OR $4 = '' OR LOWER(s.unit) LIKE LOWER($4))
    "#;

    let total_rows: i64 = sqlx::query_scalar(count_sql)
        .bind(&dari)
        .bind(&sampai)
        .bind(query.tenant)
        .bind(query.unit.as_deref().map(|u| format!("%{}%", u)))
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    let total_pages = ((total_rows as f64) / (per_page as f64)).ceil() as i64;
    let total_pages = total_pages.max(1);

    // Query utama dengan filter lengkap
    let sql = r#"
        SELECT v.id, v.used_at, s.name AS staff, s.unit, COALESCE(t.name, 'Stan Kantin') AS tenant,
               v.amount, (v.status = 'void') AS voided,
               COALESCE((
                   SELECT string_agg(vi.name || ' x' || vi.qty, ', ')
                   FROM voucher_items vi
                   WHERE vi.voucher_id = v.id
               ), '') AS items
        FROM vouchers v
        JOIN staff s ON s.id = v.staff_id
        LEFT JOIN tenants t ON t.id = v.used_by_tenant_id
        WHERE v.status IN ('used', 'void')
          AND v.voucher_date BETWEEN $1::date AND $2::date
          AND ($3::bigint IS NULL OR v.used_by_tenant_id = $3)
          AND ($4::text IS NULL OR $4 = '' OR LOWER(s.unit) LIKE LOWER($4))
        ORDER BY v.used_at DESC, v.id DESC
        LIMIT $5 OFFSET $6
    "#;

    let rows = sqlx::query(sql)
        .bind(&dari)
        .bind(&sampai)
        .bind(query.tenant)
        .bind(query.unit.as_deref().map(|u| format!("%{}%", u)))
        .bind(per_page)
        .bind(offset)
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

    // Konversi ke WIB untuk tampilan
    let wib = chrono::FixedOffset::east_opt(7 * 3600).unwrap();
    let txs: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            let at_utc: chrono::DateTime<chrono::Utc> = r.get("used_at");
            let at_wib = at_utc.with_timezone(&wib);
            serde_json::json!({
                "At": at_wib.to_rfc3339(),
                "Staff": r.get::<String, _>("staff"),
                "Unit": r.get::<String, _>("unit"),
                "Tenant": r.get::<String, _>("tenant"),
                "Amount": r.get::<i32, _>("amount"),
                "Voided": r.get::<bool, _>("voided"),
                "Items": r.get::<String, _>("items"),
            })
        })
        .collect();

    // Ambil daftar unit untuk filter dropdown
    let unit_rows = sqlx::query_scalar::<_, String>(
        "SELECT DISTINCT unit FROM staff WHERE unit IS NOT NULL AND unit != '' ORDER BY unit ASC"
    )
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let tenants = crate::db::list_tenants(&state.pool).await.unwrap_or_default();
    let tenant_options: Vec<serde_json::Value> = tenants
        .into_iter()
        .map(|t| serde_json::json!({ "ID": t.id, "Name": t.name }))
        .collect();

    Ok(Json(serde_json::json!({
        "transactions": txs,
        "total": total_rows,
        "page": page,
        "pages": total_pages,
        "perPage": per_page,
        "dari": dari,
        "sampai": sampai,
        "units": unit_rows,
        "tenants": tenant_options,
    })))
}

// ── Trigger Job Penerbitan Voucher (Admin IT) ─────────────────────

#[derive(Deserialize)]
pub struct IssueVoucherQuery {
    pub date: Option<String>,
    pub force: Option<bool>,
}

pub async fn handle_admin_issue_vouchers(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(payload): Json<Option<IssueVoucherQuery>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let target_date = payload
        .as_ref()
        .and_then(|p| p.date.as_deref())
        .and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());
    let force = payload.as_ref().and_then(|p| p.force).unwrap_or(false);

    let summary = crate::issuer::run_issue_vouchers(
        &state.pool,
        &state.config,
        target_date,
        force,
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e }))))?;

    // T-3: Jejak audit penerbitan voucher harian oleh Admin IT
    let user_id = get_admin_user_id(&jar, &state.config.qr_key);
    let ip = get_ip(&headers);
    let _ = crate::db::write_audit_log(
        &state.pool,
        user_id,
        "VOUCHERS_ISSUED",
        None,
        serde_json::json!({
            "target_date": target_date.map(|d| d.to_string()),
            "force": force,
            "issued": summary.issued_count,
            "skipped": summary.skipped_count,
            "total": summary.total_staff,
        }),
        Some("Penerbitan voucher harian dosen & staf"),
        Some(&ip),
    )
    .await;

    Ok(Json(serde_json::to_value(summary).unwrap()))
}

// ── Admin Tenant Menu Items CRUD ──────────────────────────────────

pub async fn handle_admin_tenant_menu_list(
    State(state): State<Arc<AppState>>,
    Path(tenant_id): Path<i64>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let items = crate::db::list_menu_items(&state.pool, tenant_id, false)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))))?;

    Ok(Json(serde_json::json!({ "items": items })))
}

pub async fn handle_admin_tenant_menu_create(
    State(state): State<Arc<AppState>>,
    Path(tenant_id): Path<i64>,
    Json(payload): Json<MenuItemInput>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let id = crate::db::create_menu_item(&state.pool, tenant_id, &payload)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))))?;

    Ok(Json(serde_json::json!({ "ok": true, "id": id })))
}

pub async fn handle_admin_tenant_menu_update(
    State(state): State<Arc<AppState>>,
    Path((tenant_id, id)): Path<(i64, i64)>,
    Json(payload): Json<MenuItemInput>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    crate::db::update_menu_item(&state.pool, id, tenant_id, &payload)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn handle_admin_tenant_menu_delete(
    State(state): State<Arc<AppState>>,
    Path((tenant_id, id)): Path<(i64, i64)>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    crate::db::delete_menu_item(&state.pool, id, tenant_id)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}
