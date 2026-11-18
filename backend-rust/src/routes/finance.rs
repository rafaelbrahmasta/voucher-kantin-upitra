use axum::extract::{Query, State};
use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use chrono::Datelike;
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

// ── Export Rekap Voucher ke CSV/Excel ────────────────────────────────

#[derive(serde::Deserialize)]
pub struct ExportQuery {
    pub dari: Option<String>,
    pub sampai: Option<String>,
}

pub async fn handle_finance_export(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ExportQuery>,
) -> impl IntoResponse {
    let today = chrono::Utc::now()
        .with_timezone(&chrono::FixedOffset::east_opt(7 * 3600).unwrap())
        .format("%Y-%m-%d")
        .to_string();
    let dari = query.dari.clone().unwrap_or_else(|| today.clone());
    let sampai = query.sampai.clone().unwrap_or_else(|| today.clone());

    // Ambil used_at sebagai TIMESTAMPTZ (UTC), konversi ke WIB di Rust
    let sql = r#"
        SELECT
            v.id,
            v.voucher_date,
            v.used_at,
            s.name::text           AS staff_name,
            s.unit::text           AS unit,
            s.email::text          AS staff_email,
            COALESCE(t.name, '-')::text AS kantin_name,
            COALESCE(t.stall_location, '-')::text AS kantin_lokasi,
            v.amount,
            v.status::text         AS status,
            COALESCE((
                SELECT string_agg(vi.name || ' x' || vi.qty, '; ')
                FROM voucher_items vi
                WHERE vi.voucher_id = v.id
            ), '-')::text AS menu_items
        FROM vouchers v
        JOIN staff s ON s.id = v.staff_id
        LEFT JOIN tenants t ON t.id = v.used_by_tenant_id
        WHERE v.status IN ('used', 'void')
          AND v.voucher_date BETWEEN $1::date AND $2::date
        ORDER BY v.used_at ASC, v.id ASC
    "#;

    use sqlx::Row;
    let rows = match sqlx::query(sql)
        .bind(&dari)
        .bind(&sampai)
        .fetch_all(&state.pool)
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                [(header::CONTENT_TYPE, "text/plain; charset=utf-8".to_string())],
                format!("Gagal mengambil data: {}", e),
            )
                .into_response();
        }
    };

    // Nama hari dalam bahasa Indonesia
    fn hari_id(weekday: chrono::Weekday) -> &'static str {
        match weekday {
            chrono::Weekday::Mon => "Senin",
            chrono::Weekday::Tue => "Selasa",
            chrono::Weekday::Wed => "Rabu",
            chrono::Weekday::Thu => "Kamis",
            chrono::Weekday::Fri => "Jumat",
            chrono::Weekday::Sat => "Sabtu",
            chrono::Weekday::Sun => "Minggu",
        }
    }

    // Zona waktu WIB (UTC+7)
    let wib = chrono::FixedOffset::east_opt(7 * 3600).unwrap();

    // Buat CSV dengan BOM UTF-8 agar Excel buka dengan benar
    let mut csv = String::from("\u{FEFF}");
    csv.push_str("No,Tanggal,Hari,Jam,Nama Staf,Unit/Departemen,Email Staf,Kantin,Lokasi Stan,Menu yang Dipesan,Nominal (Rp),Status\r\n");

    // Escape field CSV yang mengandung koma/kutip/newline
    let escape_csv = |s: &str| -> String {
        if s.contains(',') || s.contains('"') || s.contains('\n') {
            format!("\"{}\"", s.replace('"', "\"\""))
        } else {
            s.to_string()
        }
    };

    let mut total_terpotong: i64 = 0;
    let mut jumlah_terpotong: usize = 0;
    let mut jumlah_batal: usize = 0;

    for (i, row) in rows.iter().enumerate() {
        // Decode sebagai DateTime<Utc> (TIMESTAMPTZ), konversi ke WIB
        let used_at_utc: chrono::DateTime<chrono::Utc> = row.get("used_at");
        let used_at_wib = used_at_utc.with_timezone(&wib);

        let tanggal = used_at_wib.format("%d/%m/%Y").to_string();
        let hari = hari_id(used_at_wib.weekday());
        let jam = used_at_wib.format("%H:%M:%S").to_string();

        let staff_name: String = row.get("staff_name");
        let unit: String = row.get("unit");
        let email: String = row.get("staff_email");
        let kantin: String = row.get("kantin_name");
        let lokasi: String = row.get("kantin_lokasi");
        let menu: String = row.get("menu_items");
        let amount: i32 = row.get("amount");
        let status_raw: String = row.get("status");
        let status_label = if status_raw == "void" { "Dibatalkan" } else { "Terpotong" };

        if status_raw == "void" {
            jumlah_batal += 1;
        } else {
            jumlah_terpotong += 1;
            total_terpotong += amount as i64;
        }

        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{},{},{}\r\n",
            i + 1,
            tanggal,
            hari,
            jam,
            escape_csv(&staff_name),
            escape_csv(&unit),
            escape_csv(&email),
            escape_csv(&kantin),
            escape_csv(&lokasi),
            escape_csv(&menu),
            amount,
            status_label,
        ));
    }

    // Baris ringkasan di akhir file
    csv.push_str("\r\n");
    csv.push_str(&format!(",,,,,,,,,,TOTAL NOMINAL TERPOTONG,Rp {}\r\n", total_terpotong));
    csv.push_str(&format!(",,,,,,,,,,Jumlah Voucher Terpotong,{}\r\n", jumlah_terpotong));
    csv.push_str(&format!(",,,,,,,,,,Jumlah Voucher Dibatalkan,{}\r\n", jumlah_batal));
    csv.push_str(&format!(",,,,,,,,,,Periode Laporan,{} s/d {}\r\n", dari, sampai));
    csv.push_str(&format!(
        ",,,,,,,,,,Dicetak pada,{}\r\n",
        chrono::Utc::now().with_timezone(&wib).format("%d/%m/%Y %H:%M WIB")
    ));

    let filename = format!("rekap-voucher-kantin-{}-sd-{}.csv", dari, sampai);

    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8".to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}\"", filename),
            ),
        ],
        csv,
    )
        .into_response()
}
