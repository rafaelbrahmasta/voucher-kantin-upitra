use chrono::{DateTime, Datelike, FixedOffset, NaiveDate, Utc};
use sqlx::{PgPool, Row};
use crate::config::Config;
use crate::crypto;
use crate::mailer::{self, VoucherEmailData};

#[derive(Clone, Debug, serde::Serialize)]
pub struct IssueSummary {
    pub date: String,
    pub total_staff: usize,
    pub issued_count: usize,
    pub skipped_count: usize,
    pub failed_count: usize,
    pub skipped_holiday_or_weekend: bool,
    pub message: String,
    pub details: Vec<String>,
}

/// Menghitung jam berlaku voucher (10:00 s.d 16:00 WIB dikonversi ke UTC)
pub fn calculate_voucher_validity(date: NaiveDate) -> (DateTime<Utc>, DateTime<Utc>) {
    let wib = FixedOffset::east_opt(7 * 3600).unwrap();
    let valid_from = date
        .and_hms_opt(10, 0, 0)
        .unwrap()
        .and_local_timezone(wib)
        .unwrap()
        .with_timezone(&Utc);
    let valid_until = date
        .and_hms_opt(16, 0, 0)
        .unwrap()
        .and_local_timezone(wib)
        .unwrap()
        .with_timezone(&Utc);
    (valid_from, valid_until)
}

struct GeneratedVoucher {
    token_hash: Vec<u8>,
    qr_payload: String,
    short_code: String,
    short_code_hash: Vec<u8>,
}

fn generate_voucher_crypto(cfg: &Config, date_str: &str) -> GeneratedVoucher {
    let token = crypto::generate_token();
    let token_hash = crypto::hash_token(&token);
    let qr_payload = crypto::create_qr_payload(&cfg.qr_key, &token);

    let short_code = crypto::generate_short_code();
    let raw_code = short_code.replace(['-', ' '], "");
    let short_code_hash = crypto::short_code_hash(&cfg.short_key, date_str, &raw_code);

    GeneratedVoucher {
        token_hash,
        qr_payload,
        short_code,
        short_code_hash,
    }
}

/// Helper privat terpusat: membuat token baru, simpan/update ke database, dan kirim email.
/// Digunakan oleh run_issue_vouchers dan resend_single_voucher (A3).
async fn issue_or_regenerate_voucher(
    pool: &PgPool,
    cfg: &Config,
    existing_voucher_id: Option<i64>,
    staff_id: i64,
    staff_name: &str,
    staff_email: &str,
    date: NaiveDate,
) -> Result<(i64, bool), String> {
    let date_str = date.format("%Y-%m-%d").to_string();
    let (valid_from, valid_until) = calculate_voucher_validity(date);
    let g = generate_voucher_crypto(cfg, &date_str);

    let voucher_id = if let Some(target_id) = existing_voucher_id {
        let upd_sql = r#"
            UPDATE vouchers
            SET token_hash = $1, short_code_hash = $2, short_code = $3, qr_payload = $4,
                valid_from = $5, valid_until = $6, email_sent_at = NULL
            WHERE id = $7 AND status = 'issued'
        "#;
        let res = sqlx::query(upd_sql)
            .bind(&g.token_hash)
            .bind(&g.short_code_hash)
            .bind(&g.short_code)
            .bind(&g.qr_payload)
            .bind(valid_from)
            .bind(valid_until)
            .bind(target_id)
            .execute(pool)
            .await
            .map_err(|e| format!("Gagal update voucher retry #{}: {}", target_id, e))?;

        if res.rows_affected() == 0 {
            return Err("Voucher tidak ditemukan atau tidak berstatus 'issued'".to_string());
        }
        target_id
    } else {
        let ins_sql = r#"
            INSERT INTO vouchers (
                staff_id, voucher_date, amount, token_hash, short_code_hash,
                short_code, qr_payload, valid_from, valid_until, status, email_sent_at
            )
            VALUES ($1, $2, 5000, $3, $4, $5, $6, $7, $8, 'issued', NULL)
            RETURNING id
        "#;
        sqlx::query_scalar(ins_sql)
            .bind(staff_id)
            .bind(date)
            .bind(&g.token_hash)
            .bind(&g.short_code_hash)
            .bind(&g.short_code)
            .bind(&g.qr_payload)
            .bind(valid_from)
            .bind(valid_until)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("Gagal insert voucher: {}", e))?
    };

    // Kirim email via Mailer
    let email_data = VoucherEmailData {
        staff_name,
        staff_email,
        date_str: &date_str,
        qr_payload: &g.qr_payload,
        short_code: &g.short_code,
    };

    let email_sent = match mailer::send_voucher_email(cfg, &email_data).await {
        Ok(_) => {
            let _ = sqlx::query("UPDATE vouchers SET email_sent_at = now() WHERE id = $1")
                .bind(voucher_id)
                .execute(pool)
                .await;
            true
        }
        Err(e) => {
            tracing::warn!("Gagal kirim email voucher ke {}: {}", staff_email, e);
            false
        }
    };

    Ok((voucher_id, email_sent))
}

pub async fn run_issue_vouchers(
    pool: &PgPool,
    cfg: &Config,
    target_date: Option<NaiveDate>,
    force: bool,
    resend: bool,
) -> Result<IssueSummary, String> {
    let wib = FixedOffset::east_opt(7 * 3600).unwrap();
    let date = target_date.unwrap_or_else(|| Utc::now().with_timezone(&wib).date_naive());
    let date_str = date.format("%Y-%m-%d").to_string();

    // 1. Cek apakah akhir pekan (Sabtu / Minggu)
    let is_weekend = date.weekday() == chrono::Weekday::Sat || date.weekday() == chrono::Weekday::Sun;

    // 2. Cek apakah terdaftar di tabel hari libur (holidays)
    let holiday_check: Option<String> = sqlx::query_scalar("SELECT description FROM holidays WHERE date = $1")
        .bind(date)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Gagal memeriksa tabel holidays: {}", e))?;

    // A1: Flag --force HANYA melewati pengecekan akhir pekan dan hari libur
    if (is_weekend || holiday_check.is_some()) && !force {
        let reason = if is_weekend {
            "Akhir Pekan (Sabtu/Minggu)"
        } else {
            holiday_check.as_deref().unwrap_or("Hari Libur Nasional")
        };
        return Ok(IssueSummary {
            date: date_str.clone(),
            total_staff: 0,
            issued_count: 0,
            skipped_count: 0,
            failed_count: 0,
            skipped_holiday_or_weekend: true,
            message: format!("Penerbitan voucher dilewati: tanggal {} adalah {}", date_str, reason),
            details: vec![format!("Tanggal {} adalah {}", date_str, reason)],
        });
    }

    // 3. Ambil semua dosen/staf aktif
    let staff_rows = sqlx::query(
        "SELECT id, COALESCE(nip, '') AS nip, name, email, unit FROM staff WHERE is_active = true ORDER BY id"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Gagal membaca data staff: {}", e))?;

    let total_staff = staff_rows.len();
    let mut issued_count = 0;
    let mut skipped_count = 0;
    let mut failed_count = 0;
    let mut details = Vec::new();

    // A2: Loop setiap staf. TIDAK MENGGUNAKAN `?` di dalam loop agar error 1 staf tidak menghentikan staf lain.
    for s in &staff_rows {
        let staff_id: i64 = s.get("id");
        let staff_name: String = s.get("name");
        let staff_email: String = s.get("email");

        // Cek apakah staf ini sudah memiliki voucher hari ini
        let existing_res: Result<Option<(i64, Option<DateTime<Utc>>, String)>, _> = sqlx::query_as(
            "SELECT id, email_sent_at, status::text FROM vouchers WHERE staff_id = $1 AND voucher_date = $2"
        )
        .bind(staff_id)
        .bind(date)
        .fetch_optional(pool)
        .await;

        let existing = match existing_res {
            Ok(opt) => opt,
            Err(e) => {
                failed_count += 1;
                details.push(format!("Gagal: {} - Gagal cek voucher: {}", staff_name, e));
                continue;
            }
        };

        let (target_voucher_id, is_retry) = if let Some((vid, email_sent_at, status_str)) = existing {
            if status_str != "issued" {
                skipped_count += 1;
                details.push(format!("Lewati: {} ({}) voucher hari ini berstatus '{}'", staff_name, staff_email, status_str));
                continue;
            }
            if email_sent_at.is_some() {
                // A1: Voucher yang emailnya sudah terkirim TIDAK BOLEH dibuat ulang tokennya jika resend false
                if !resend {
                    skipped_count += 1;
                    details.push(format!("Lewati: {} ({}) sudah menerima voucher aktif hari ini", staff_name, staff_email));
                    continue;
                }
                // resend == true: sengaja membuat ulang token untuk voucher 'issued' yang emailnya sudah terkirim
                (Some(vid), true)
            } else {
                // email_sent_at is NULL: retry otomatis
                (Some(vid), true)
            }
        } else {
            // Belum punya voucher hari ini
            (None, false)
        };

        match issue_or_regenerate_voucher(pool, cfg, target_voucher_id, staff_id, &staff_name, &staff_email, date).await {
            Ok((voucher_id, email_sent)) => {
                issued_count += 1;
                let action_tag = if is_retry { "Kirim Ulang" } else { "Terbit" };
                let mail_note = if email_sent { "Email Terkirim" } else { "Email Tertunda / Gagal" };
                details.push(format!(
                    "Voucher #{} [Rp5.000] ({}, {}) -> {} ({})",
                    voucher_id, action_tag, mail_note, staff_name, staff_email
                ));
            }
            Err(e) => {
                failed_count += 1;
                details.push(format!("Gagal: {} - {}", staff_name, e));
            }
        }
    }

    let message = format!(
        "Penerbitan voucher selesai untuk tanggal {}: {} diterbitkan, {} dilewati, {} gagal (total {} staf aktif).",
        date_str, issued_count, skipped_count, failed_count, total_staff
    );

    Ok(IssueSummary {
        date: date_str,
        total_staff,
        issued_count,
        skipped_count,
        failed_count,
        skipped_holiday_or_weekend: false,
        message,
        details,
    })
}

// ── Kirim Ulang / Buat Ulang Voucher Tunggal (A4: Perketat Validasi) ────

pub async fn resend_single_voucher(
    pool: &PgPool,
    cfg: &Config,
    staff_id: i64,
) -> Result<String, String> {
    let wib = FixedOffset::east_opt(7 * 3600).unwrap();
    let now_wib = Utc::now().with_timezone(&wib);
    resend_single_voucher_at(pool, cfg, staff_id, now_wib).await
}

pub async fn resend_single_voucher_at(
    pool: &PgPool,
    cfg: &Config,
    staff_id: i64,
    now_wib: DateTime<FixedOffset>,
) -> Result<String, String> {
    let date = now_wib.date_naive();

    // A4: Tolak jika sekarang sudah melewati valid_until (16:00 WIB)
    let (_, valid_until) = calculate_voucher_validity(date);
    let now_utc = now_wib.with_timezone(&Utc);
    if now_utc >= valid_until {
        return Err("Voucher hari ini sudah kedaluwarsa (melewati batas pukul 16:00 WIB), tidak dapat dikirim ulang.".to_string());
    }

    // 1. Ambil data staf dan voucher hari ini
    let q = r#"
        SELECT s.id AS staff_id, s.name AS staff_name, s.email AS staff_email, s.is_active,
               v.id AS voucher_id, v.status::text AS voucher_status
        FROM staff s
        LEFT JOIN vouchers v ON v.staff_id = s.id AND v.voucher_date = $2
        WHERE s.id = $1
    "#;

    let row = sqlx::query(q)
        .bind(staff_id)
        .bind(date)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Gagal memeriksa staf & voucher: {}", e))?
        .ok_or_else(|| "Staf tidak ditemukan.".to_string())?;

    let is_active: bool = row.get("is_active");
    let staff_name: String = row.get("staff_name");
    let staff_email: String = row.get("staff_email");

    // A4: Tolak jika staf tidak aktif
    if !is_active {
        return Err(format!("Staf {} berstatus nonaktif, tidak dapat mengirim ulang voucher.", staff_name));
    }

    let voucher_id: Option<i64> = row.get("voucher_id");
    let voucher_id = voucher_id.ok_or_else(|| {
        "Staf ini belum memiliki voucher yang diterbitkan untuk hari ini.".to_string()
    })?;

    // A4: Tetap tolak jika status bukan 'issued'
    let voucher_status: Option<String> = row.get("voucher_status");
    let status = voucher_status.unwrap_or_default();
    if status != "issued" {
        return Err(format!(
            "Voucher staf {} sudah berstatus '{}' (misal sudah digunakan di kantin), tidak dapat dibuat ulang.",
            staff_name, status
        ));
    }

    // A3: Panggil fungsi helper privat terpusat
    let (_, email_sent) = issue_or_regenerate_voucher(
        pool,
        cfg,
        Some(voucher_id),
        staff_id,
        &staff_name,
        &staff_email,
        date,
    )
    .await?;

    if email_sent {
        Ok(format!("Voucher baru berhasil dibuat dan dikirimkan ke email {}", staff_email))
    } else {
        Err(format!("Token voucher baru telah dibuat di database, namun pengiriman email ke {} gagal", staff_email))
    }
}
