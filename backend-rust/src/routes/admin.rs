use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use std::sync::Arc;

use crate::models::{StaffInput, TenantInput};
use crate::AppState;

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
    Path(id): Path<i64>,
    Json(payload): Json<TenantInput>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    crate::db::update_tenant(&state.pool, id, &payload)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))))?;

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
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let code = crate::db::issue_pairing_code(&state.pool, id)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))))?;

    let formatted = crate::crypto::format_pairing_code(&code);
    Ok(Json(serde_json::json!({ "ok": true, "code": formatted })))
}

pub async fn handle_admin_tenant_revoke(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    crate::db::revoke_devices(&state.pool, id)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))))?;

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
    let sql = r#"
        SELECT v.used_at, s.name AS staff, s.unit, COALESCE(t.name, 'Stan Kantin') AS tenant,
               v.amount, (v.status = 'void') AS voided
        FROM vouchers v
        JOIN staff s ON s.id = v.staff_id
        LEFT JOIN tenants t ON t.id = v.used_by_tenant_id
        WHERE v.status IN ('used', 'void')
        ORDER BY v.used_at DESC, v.id DESC
        LIMIT 100
    "#;

    use sqlx::Row;
    let rows = sqlx::query(sql)
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

    let txs: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            let at: chrono::DateTime<chrono::Utc> = r.get("used_at");
            serde_json::json!({
                "At": at.to_rfc3339(),
                "Staff": r.get::<String, _>("staff"),
                "Unit": r.get::<String, _>("unit"),
                "Tenant": r.get::<String, _>("tenant"),
                "Amount": r.get::<i32, _>("amount"),
                "Voided": r.get::<bool, _>("voided"),
                "Items": "",
            })
        })
        .collect();

    let tenants = crate::db::list_tenants(&state.pool).await.unwrap_or_default();
    let tenant_options: Vec<serde_json::Value> = tenants
        .into_iter()
        .map(|t| serde_json::json!({ "ID": t.id, "Name": t.name }))
        .collect();

    Ok(Json(serde_json::json!({
        "transactions": txs,
        "total": rows.len(),
        "page": query.halaman.unwrap_or(1),
        "pages": 1,
        "perPage": 50,
        "dari": query.dari.unwrap_or_default(),
        "sampai": query.sampai.unwrap_or_default(),
        "units": [],
        "tenants": tenant_options,
    })))
}
