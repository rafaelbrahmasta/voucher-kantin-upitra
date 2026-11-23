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
    let wib = chrono::FixedOffset::east_opt(7 * 3600).unwrap();
    let today_wib = chrono::Utc::now().with_timezone(&wib).format("%Y-%m-%d").to_string();
    let date_str = query.tanggal.clone().filter(|s| !s.is_empty()).unwrap_or_else(|| today_wib.clone());

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

#[derive(Debug, Clone, serde::Serialize)]
pub struct ClaimResult {
    pub receipt_no: String,
    pub payout_id: i64,
    pub settlement_id: i64,
    pub count: i64,
    pub amount: i64,
}

#[derive(Debug)]
pub enum ClaimError {
    InvalidDate(String),
    FutureDate,
    BeforeCutoff,
    TenantNotFound,
    AlreadyPaid,
    NoVouchers,
    Conflict(String),
    DbError(String),
}

impl std::fmt::Display for ClaimError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ClaimError::InvalidDate(msg) => write!(f, "{}", msg),
            ClaimError::FutureDate => write!(f, "Tidak dapat mencairkan dana untuk tanggal di masa depan."),
            ClaimError::BeforeCutoff => write!(f, "Pencairan dana hari ini baru dapat dilakukan setelah jam operasional voucher ditutup (pukul 16:00 WIB). Hal ini untuk memastikan seluruh staf telah selesai bertransaksi dan tidak ada voucher yang tertinggal."),
            ClaimError::TenantNotFound => write!(f, "Stan kantin tidak ditemukan."),
            ClaimError::AlreadyPaid => write!(f, "Pencairan kas untuk stan dan tanggal ini sudah selesai dilakukan (mencegah pencairan ganda)."),
            ClaimError::NoVouchers => write!(f, "Tidak ada transaksi voucher baru yang belum dicairkan pada tanggal ini"),
            ClaimError::Conflict(msg) => write!(f, "{}", msg),
            ClaimError::DbError(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for ClaimError {}

impl ClaimError {
    pub fn to_status_and_json(&self) -> (StatusCode, Json<serde_json::Value>) {
        match self {
            ClaimError::InvalidDate(_) | ClaimError::FutureDate | ClaimError::BeforeCutoff | ClaimError::AlreadyPaid | ClaimError::NoVouchers => {
                (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": self.to_string() })))
            }
            ClaimError::TenantNotFound => {
                (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": self.to_string() })))
            }
            ClaimError::Conflict(_) => {
                (StatusCode::CONFLICT, Json(serde_json::json!({ "error": self.to_string() })))
            }
            ClaimError::DbError(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": self.to_string() })))
            }
        }
    }
}

/// B1 & C4.7: Validasi format tanggal persis YYYY-MM-DD
pub fn parse_strict_date(date_str: &str) -> Result<chrono::NaiveDate, ClaimError> {
    let parts: Vec<&str> = date_str.split('-').collect();
    if parts.len() != 3 || parts[0].len() != 4 || parts[1].len() != 2 || parts[2].len() != 2 {
        return Err(ClaimError::InvalidDate(
            "Format tanggal tidak valid. Gunakan format persis YYYY-MM-DD (contoh: 2026-01-05).".to_string(),
        ));
    }
    let d = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d").map_err(|_| {
        ClaimError::InvalidDate("Format tanggal tidak valid. Gunakan format persis YYYY-MM-DD.".to_string())
    })?;
    if d.format("%Y-%m-%d").to_string() != date_str {
        return Err(ClaimError::InvalidDate(
            "Format tanggal tidak valid. Gunakan format persis YYYY-MM-DD.".to_string(),
        ));
    }
    Ok(d)
}

/// C1: Logika klaim pencairan diekstrak menjadi fungsi mandiri yang bisa dipanggil tes
pub async fn claim_payout(
    pool: &sqlx::PgPool,
    tenant_id: i64,
    claim_date: chrono::NaiveDate,
    user_id: i64,
    now_wib: chrono::DateTime<chrono::FixedOffset>,
) -> Result<ClaimResult, ClaimError> {
    use sqlx::Row;

    let today_wib = now_wib.date_naive();
    if claim_date > today_wib {
        return Err(ClaimError::FutureDate);
    }

    let closing_time = chrono::NaiveTime::from_hms_opt(16, 0, 0).unwrap();
    if claim_date == today_wib && now_wib.time() < closing_time {
        return Err(ClaimError::BeforeCutoff);
    }

    // Seluruh proses pencairan kas dibungkus dalam SATU transaksi database dengan ROW LOCKING
    let mut tx = pool.begin().await.map_err(|e| {
        ClaimError::DbError(format!("Gagal memulai transaksi database: {}", e))
    })?;

    // 1. Kunci baris stan di tabel tenants agar serial (anti race condition / klik ganda)
    let lock_tenant_sql = "SELECT id FROM tenants WHERE id = $1 FOR UPDATE";
    let tenant_exists: Option<(i64,)> = sqlx::query_as(lock_tenant_sql)
        .bind(tenant_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| ClaimError::DbError(e.to_string()))?;

    if tenant_exists.is_none() {
        return Err(ClaimError::TenantNotFound);
    }

    // 2. Kunci baris settlement jika ada dan cek apakah sudah lunas (status = paid)
    // B3: Penanganan eksplisit, error DB dibubbling up dan transaksi dirollback!
    let check_sql = "SELECT status::text AS status FROM settlements WHERE tenant_id = $1 AND business_date = $2 FOR UPDATE";
    let settlement_opt: Option<(String,)> = sqlx::query_as(check_sql)
        .bind(tenant_id)
        .bind(claim_date)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| ClaimError::DbError(format!("Gagal memeriksa status settlement: {}", e)))?;

    if let Some((status,)) = settlement_opt {
        if status == "paid" {
            return Err(ClaimError::AlreadyPaid);
        }
    }

    // 3. Kunci seluruh baris voucher yang statusnya used dan belum memiliki settlement_id
    // B1: Pakai claim_date (NaiveDate) untuk bind SQL
    let lock_vouchers_sql = r#"
        SELECT id, amount
        FROM vouchers
        WHERE used_by_tenant_id = $1
          AND voucher_date = $2
          AND status = 'used'
          AND settlement_id IS NULL
        FOR UPDATE
    "#;
    let voucher_rows: Vec<(i64, i32)> = sqlx::query_as(lock_vouchers_sql)
        .bind(tenant_id)
        .bind(claim_date)
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| ClaimError::DbError(e.to_string()))?;

    if voucher_rows.is_empty() {
        return Err(ClaimError::NoVouchers);
    }

    let count = voucher_rows.len() as i64;
    let amount: i64 = voucher_rows.iter().map(|(_, a)| *a as i64).sum();
    let voucher_ids: Vec<i64> = voucher_rows.into_iter().map(|(id, _)| id).collect();

    // 4. Buat catatan di tabel payouts
    // B1: receipt_no dari parsed claim_date
    let receipt_no = format!("PAY-{}-{}", claim_date.format("%Y%m%d"), tenant_id);

    // B2: Hapus ON CONFLICT DO UPDATE. Gunakan INSERT biasa; unique violation (23505) -> 409 Conflict.
    let ins_payout_sql = r#"
        INSERT INTO payouts (receipt_no, tenant_id, amount, status, created_by)
        VALUES ($1, $2, $3, 'transferred'::payout_status, $4)
        RETURNING id
    "#;

    let payout_row = match sqlx::query(ins_payout_sql)
        .bind(&receipt_no)
        .bind(tenant_id)
        .bind(amount as i32)
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await
    {
        Ok(r) => r,
        Err(sqlx::Error::Database(db_err)) if db_err.code().as_deref() == Some("23505") => {
            return Err(ClaimError::Conflict("Pencairan untuk stan dan tanggal ini sudah tercatat.".to_string()));
        }
        Err(e) => {
            return Err(ClaimError::DbError(format!("Gagal mencatat payout: {}", e)));
        }
    };

    let payout_id: i64 = payout_row.get("id");

    // 5. Upsert ke tabel settlements
    let upsert_settlement_sql = r#"
        INSERT INTO settlements (tenant_id, business_date, voucher_count, total_amount, status, payout_id, closed_at)
        VALUES ($1, $2, $3, $4, 'paid'::settlement_status, $5, now())
        ON CONFLICT (tenant_id, business_date)
        DO UPDATE SET status = 'paid'::settlement_status, voucher_count = EXCLUDED.voucher_count, total_amount = EXCLUDED.total_amount, payout_id = EXCLUDED.payout_id, closed_at = now()
        RETURNING id
    "#;

    let settlement_row = sqlx::query(upsert_settlement_sql)
        .bind(tenant_id)
        .bind(claim_date)
        .bind(count as i32)
        .bind(amount as i32)
        .bind(payout_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| ClaimError::DbError(format!("Gagal mencatat settlement: {}", e)))?;

    let settlement_id: i64 = settlement_row.get("id");

    // 6. Hubungkan seluruh voucher yang dikunci tadi ke settlement_id ini
    let upd_vouchers_sql = r#"
        UPDATE vouchers
        SET settlement_id = $1
        WHERE id = ANY($2)
    "#;
    sqlx::query(upd_vouchers_sql)
        .bind(settlement_id)
        .bind(&voucher_ids)
        .execute(&mut *tx)
        .await
        .map_err(|e| ClaimError::DbError(format!("Gagal menghubungkan voucher ke settlement: {}", e)))?;

    // Commit transaksi
    tx.commit().await.map_err(|e| {
        ClaimError::DbError(format!("Gagal menyelesaikan transaksi: {}", e))
    })?;

    Ok(ClaimResult {
        receipt_no,
        payout_id,
        settlement_id,
        count,
        amount,
    })
}

pub async fn handle_finance_payout_claim(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: axum::http::HeaderMap,
    Json(payload): Json<PayoutClaimRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    // Dapatkan user_id dari sesi finance aktif secara ketat (T-3)
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

    // B1: Parse tanggal ketat
    let claim_date = parse_strict_date(&payload.date).map_err(|e| e.to_status_and_json())?;

    let wib = chrono::FixedOffset::east_opt(7 * 3600).unwrap();
    let now_wib = chrono::Utc::now().with_timezone(&wib);

    // C1: Panggil fungsi inti klaim pencairan
    let res = claim_payout(&state.pool, payload.tenant_id, claim_date, current_user_id, now_wib)
        .await
        .map_err(|e| e.to_status_and_json())?;

    // Catat jejak audit finansial (T-3)
    let _ = crate::db::write_audit_log(
        &state.pool,
        Some(current_user_id),
        "PAYOUT_CLAIM",
        None,
        serde_json::json!({
            "tenant_id": payload.tenant_id,
            "business_date": claim_date.to_string(),
            "receipt_no": res.receipt_no,
            "payout_id": res.payout_id,
            "settlement_id": res.settlement_id,
            "voucher_count": res.count,
            "total_amount": res.amount,
        }),
        Some("Pencairan dana klaim kasir stan kantin"),
        Some(&client_ip),
    )
    .await;

    Ok(Json(serde_json::json!({
        "ok": true,
        "receiptNo": res.receipt_no,
        "payoutId": res.payout_id,
        "settlementId": res.settlement_id,
        "amount": res.amount,
        "count": res.count,
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
