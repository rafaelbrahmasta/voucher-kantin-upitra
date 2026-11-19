use axum::extract::{Query, State};
use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use axum_extra::extract::cookie::CookieJar;
use chrono::Datelike;
use std::sync::Arc;
use crate::routes::admin::DateQuery;
use crate::AppState;

pub async fn handle_finance_summary(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DateQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    // Default ke hari ini dalam WIB (UTC+7)
    let wib = chrono::FixedOffset::east_opt(7 * 3600).unwrap();
    let today_wib = chrono::Utc::now().with_timezone(&wib).format("%Y-%m-%d").to_string();
    let date_str = query.tanggal.clone().filter(|s| !s.is_empty()).unwrap_or_else(|| today_wib.clone());
    let is_today = date_str == today_wib;

    let sum_sql = r#"
        SELECT count(*) AS issued,
               count(*) FILTER (WHERE status = 'used') AS used,
               count(*) FILTER (WHERE status = 'void') AS void,
               count(*) FILTER (WHERE status = 'expired') AS expired,
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
    let expired: i64 = row.get("expired");
    let nominal: i64 = row.get("nominal");

    let unused = issued - used - void - expired;
    let pct_used = if issued > 0 { (used as f64 / issued as f64 * 100.0) as i64 } else { 0 };
    let pct_expired = if issued > 0 { (expired as f64 / issued as f64 * 100.0) as i64 } else { 0 };
    let pct_void = if issued > 0 { (void as f64 / issued as f64 * 100.0) as i64 } else { 0 };

    // Budget: Rp5.000 per voucher issued (nominal subsidi per voucher)
    let budget_issued = issued * 5000_i64;
    let budget_used = nominal;
    let budget_expired = expired * 5000_i64;
    let budget_void = void * 5000_i64;

    let per_tenant_sql = r#"
        SELECT t.name, count(v.id) AS count, COALESCE(sum(v.amount), 0)::bigint AS amount
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

    // Transaksi terbaru hari ini (5 terakhir)
    let recent_sql = r#"
        SELECT s.name AS staff, s.unit, COALESCE(t.name, '-') AS kantin,
               v.amount::bigint AS amount, v.used_at
        FROM vouchers v
        JOIN staff s ON s.id = v.staff_id
        LEFT JOIN tenants t ON t.id = v.used_by_tenant_id
        WHERE v.voucher_date = $1::date AND v.status = 'used'
        ORDER BY v.used_at DESC
        LIMIT 5
    "#;

    let recent_rows = sqlx::query(recent_sql)
        .bind(&date_str)
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

    let recent: Vec<serde_json::Value> = recent_rows.iter().map(|r| {
        let at_utc: chrono::DateTime<chrono::Utc> = r.get("used_at");
        let at_wib = at_utc.with_timezone(&wib);
        serde_json::json!({
            "Staff": r.get::<String, _>("staff"),
            "Unit": r.get::<String, _>("unit"),
            "Kantin": r.get::<String, _>("kantin"),
            "Amount": r.get::<i64, _>("amount"),
            "At": at_wib.format("%H:%M").to_string(),
        })
    }).collect();

    Ok(Json(serde_json::json!({
        "date": date_str,
        "dateLabel": date_str,
        "isToday": is_today,
        "sum": {
            "Issued": issued,
            "Used": used,
            "Nominal": nominal,
            "Void": void,
            "Expired": expired,
        },
        "unused": unused.max(0),
        "pctUsed": pct_used,
        "pctExpired": pct_expired,
        "pctVoid": pct_void,
        "budgetIssued": budget_issued,
        "budgetUsed": budget_used,
        "budgetExpired": budget_expired,
        "budgetVoid": budget_void,
        "tenants": tenants,
        "recent": recent,
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
               COALESCE(sum(v.amount), 0)::bigint AS amount,
               COALESCE(s.status = 'paid', false) AS transferred
        FROM tenants t
        LEFT JOIN vouchers v ON v.used_by_tenant_id = t.id AND v.voucher_date = $1::date AND v.status = 'used'
        LEFT JOIN settlements s ON s.tenant_id = t.id AND s.business_date = $1::date
        WHERE t.is_active
        GROUP BY t.id, t.name, t.stall_location, t.owner_name, t.bank_name, t.bank_account, t.is_active, s.status
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
            let transferred: bool = r.get("transferred");
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
                "transferred": transferred,
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

#[derive(serde::Deserialize)]
pub struct PayoutClaimRequest {
    #[serde(rename = "tenantId")]
    pub tenant_id: i64,
    pub date: String,
}

pub async fn handle_finance_payout_claim(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: axum::http::HeaderMap,
    Json(payload): Json<PayoutClaimRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    use sqlx::Row;

    // Dapatkan user_id dari sesi finance aktif secara ketat (T-3: Pisahkan IT & hapus fallback user 1)
    let now_unix = chrono::Utc::now().timestamp();
    let current_user_id = jar
        .get("finance_sess")
        .and_then(|c| crate::crypto::decode_admin_session(&state.config.qr_key, c.value(), now_unix))
        .filter(|s| s.role == "finance")
        .map(|s| s.user_id)
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "error": "Sesi Biro Keuangan tidak sah atau kedaluwarsa. Silakan login kembali." })),
            )
        })?;

    let client_ip = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "127.0.0.1".to_string());

    // Seluruh proses pencairan kas dibungkus dalam SATU transaksi database (BEGIN / COMMIT)
    let mut tx = state.pool.begin().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Gagal memulai transaksi database: {}", e) })),
        )
    })?;

    // 1. Hitung total voucher dan nominal yang statusnya used untuk stan dan tanggal ini
    let stat_sql = r#"
        SELECT count(*) AS count, COALESCE(sum(amount), 0)::bigint AS amount
        FROM vouchers
        WHERE used_by_tenant_id = $1
          AND voucher_date = $2::date
          AND status = 'used'
    "#;
    let stat_row = sqlx::query(stat_sql)
        .bind(payload.tenant_id)
        .bind(&payload.date)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))))?;

    let count: i64 = stat_row.get("count");
    let amount: i64 = stat_row.get("amount");

    if count == 0 || amount == 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Tidak ada transaksi voucher untuk dicairkan pada tanggal ini" })),
        ));
    }

    // 2. Cek apakah sudah pernah dicairkan (status = paid) untuk mencegah pencairan ganda
    let check_sql = "SELECT status::text AS status FROM settlements WHERE tenant_id = $1 AND business_date = $2::date";
    if let Ok(Some(row)) = sqlx::query(check_sql).bind(payload.tenant_id).bind(&payload.date).fetch_optional(&mut *tx).await {
        let status: String = row.get("status");
        if status == "paid" {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "Pencairan kas untuk stan dan tanggal ini sudah selesai dilakukan (mencegah pencairan ganda)." })),
            ));
        }
    }

    // 3. Buat catatan di tabel payouts
    let receipt_no = format!("PAY-{}-{}", payload.date.replace("-", ""), payload.tenant_id);
    let ins_payout_sql = r#"
        INSERT INTO payouts (receipt_no, tenant_id, amount, status, created_by)
        VALUES ($1, $2, $3, 'transferred', $4)
        ON CONFLICT (receipt_no) DO UPDATE SET amount = EXCLUDED.amount, status = 'transferred'
        RETURNING id
    "#;

    let payout_row = sqlx::query(ins_payout_sql)
        .bind(&receipt_no)
        .bind(payload.tenant_id)
        .bind(amount as i32)
        .bind(current_user_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("Gagal mencatat payout: {}", e) }))))?;

    let payout_id: i64 = payout_row.get("id");

    // 4. Upsert ke tabel settlements
    let upsert_settlement_sql = r#"
        INSERT INTO settlements (tenant_id, business_date, voucher_count, total_amount, status, payout_id, closed_at)
        VALUES ($1, $2::date, $3, $4, 'paid'::settlement_status, $5, now())
        ON CONFLICT (tenant_id, business_date)
        DO UPDATE SET status = 'paid'::settlement_status, voucher_count = EXCLUDED.voucher_count, total_amount = EXCLUDED.total_amount, payout_id = EXCLUDED.payout_id, closed_at = now()
        RETURNING id
    "#;

    let settlement_row = sqlx::query(upsert_settlement_sql)
        .bind(payload.tenant_id)
        .bind(&payload.date)
        .bind(count as i32)
        .bind(amount as i32)
        .bind(payout_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("Gagal mencatat settlement: {}", e) }))))?;

    let settlement_id: i64 = settlement_row.get("id");

    // 5. Hubungkan semua voucher terkait ke settlement_id ini
    let upd_vouchers_sql = r#"
        UPDATE vouchers
        SET settlement_id = $1
        WHERE used_by_tenant_id = $2
          AND voucher_date = $3::date
          AND status = 'used'
    "#;
    sqlx::query(upd_vouchers_sql)
        .bind(settlement_id)
        .bind(payload.tenant_id)
        .bind(&payload.date)
        .execute(&mut *tx)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("Gagal menghubungkan voucher ke settlement: {}", e) }))))?;

    // 6. Selesaikan transaksi (COMMIT)
    tx.commit().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Gagal menyelesaikan transaksi: {}", e) })),
        )
    })?;

    // 7. Catat jejak audit finansial (T-3)
    let _ = crate::db::write_audit_log(
        &state.pool,
        Some(current_user_id),
        "PAYOUT_CLAIM",
        None,
        serde_json::json!({
            "tenant_id": payload.tenant_id,
            "business_date": payload.date,
            "receipt_no": receipt_no,
            "payout_id": payout_id,
            "settlement_id": settlement_id,
            "voucher_count": count,
            "total_amount": amount,
        }),
        Some("Pencairan dana klaim kasir stan kantin"),
        Some(&client_ip),
    )
    .await;

    Ok(Json(serde_json::json!({
        "ok": true,
        "receiptNo": receipt_no,
        "payoutId": payout_id,
        "settlementId": settlement_id,
        "amount": amount,
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
    // Juga sanitasi formula injection (Excel/LibreOffice)
    let escape_csv = |s: &str| -> String {
        let sanitized = if s.starts_with('=') || s.starts_with('+') || s.starts_with('-') || s.starts_with('@') {
            format!("'{}", s)  // prefix dengan ' untuk mencegah formula injection
        } else {
            s.to_string()
        };
        if sanitized.contains(',') || sanitized.contains('"') || sanitized.contains('\n') {
            format!("\"{}\"", sanitized.replace('"', "\"\""))
        } else {
            sanitized
        }
    };

    let mut total_terpotong: i64 = 0;
    let mut jumlah_terpotong: usize = 0;
    let mut jumlah_batal: usize = 0;

    for (i, row) in rows.iter().enumerate() {
        // Decode sebagai Option<DateTime<Utc>> — voucher void bisa punya used_at NULL
        let used_at_opt: Option<chrono::DateTime<chrono::Utc>> = row.get("used_at");

        let (tanggal, hari, jam) = if let Some(used_at_utc) = used_at_opt {
            let used_at_wib = used_at_utc.with_timezone(&wib);
            (
                used_at_wib.format("%d/%m/%Y").to_string(),
                hari_id(used_at_wib.weekday()),
                used_at_wib.format("%H:%M:%S").to_string(),
            )
        } else {
            // Fallback: gunakan voucher_date dari kolom voucher_date
            let vdate: chrono::NaiveDate = row.get("voucher_date");
            (
                vdate.format("%d/%m/%Y").to_string(),
                hari_id(vdate.weekday()),
                "-".to_string(),
            )
        };

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
