use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use std::sync::Arc;

use crate::routes::admin::DateQuery;
use crate::AppState;

pub async fn handle_finance_summary(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DateQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let date_str = query.tanggal.unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());

    let sum_sql = r#"
        SELECT count(*) AS issued,
               count(*) FILTER (WHERE status = 'used') AS used,
               count(*) FILTER (WHERE status = 'void') AS void,
               COALESCE(sum(amount) FILTER (WHERE status = 'used'), 0) AS nominal
        FROM vouchers
        WHERE voucher_date = $1::date
    "#;

    use sqlx::Row;
    let row = sqlx::query(sum_sql)
        .bind(&date_str)
        .fetch_one(&state.pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))))?;

    let issued: i64 = row.get("issued");
    let used: i64 = row.get("used");
    let void: i64 = row.get("void");
    let nominal: i64 = row.get("nominal");

    let unused = issued - used - void;
    let pct_used = if issued > 0 { (used as f64 / issued as f64 * 100.0) as i64 } else { 0 };

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

    let tenants: Vec<serde_json::Value> = tenant_rows
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
        "dateLabel": date_str,
        "isToday": true,
        "sum": {
            "Issued": issued,
            "Used": used,
            "Nominal": nominal,
            "Void": void,
        },
        "unused": unused,
        "pctUsed": pct_used,
        "pctExpired": 0,
        "pctVoid": 0,
        "budgetIssued": issued * 20000,
        "budgetUsed": nominal,
        "budgetExpired": 0,
        "budgetVoid": 0,
        "tenants": tenants,
        "recent": [],
    })))
}

pub async fn handle_finance_payouts(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DateQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let date_str = query.tanggal.unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());

    let sql = r#"
        SELECT t.id, t.name, COALESCE(t.stall_location, '') AS stall,
               t.owner_name AS owner,
               COALESCE(t.bank_name, '-') AS bank_name,
               COALESCE(t.bank_account, '-') AS bank_account,
               t.is_active AS active,
               count(v.id) AS count,
               COALESCE(sum(v.amount), 0) AS amount
        FROM tenants t
        LEFT JOIN vouchers v ON v.used_by_tenant_id = t.id AND v.voucher_date = $1::date AND v.status = 'used'
        WHERE t.is_active
        GROUP BY t.id, t.name, t.stall_location, t.owner_name, t.bank_name, t.bank_account, t.is_active
        ORDER BY t.name ASC
    "#;

    use sqlx::Row;
    let rows = sqlx::query(sql)
        .bind(&date_str)
        .fetch_all(&state.pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))))?;

    let mut total_count: i64 = 0;
    let mut total_amount: i64 = 0;

    let payouts: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            let count: i64 = r.get("count");
            let amount: i64 = r.get("amount");
            total_count += count;
            total_amount += amount;

            serde_json::json!({
                "id": r.get::<i64, _>("id"),
                "name": r.get::<String, _>("name"),
                "stall": r.get::<String, _>("stall"),
                "owner": r.get::<String, _>("owner"),
                "bankName": r.get::<String, _>("bank_name"),
                "bankAccount": r.get::<String, _>("bank_account"),
                "count": count,
                "amount": amount,
                "active": r.get::<bool, _>("active"),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "date": date_str,
        "dateLabel": date_str,
        "payouts": payouts,
        "totalCount": total_count,
        "totalAmount": total_amount,
    })))
}
