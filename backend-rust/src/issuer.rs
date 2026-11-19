use chrono::{Datelike, FixedOffset, NaiveDate, Utc};
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
    pub skipped_holiday_or_weekend: bool,
    pub message: String,
    pub details: Vec<String>,
}

pub async fn run_issue_vouchers(
    pool: &PgPool,
    cfg: &Config,
    target_date: Option<NaiveDate>,
    force: bool,
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
    let mut details = Vec::new();

    // Jam operasional voucher: 10:00 s.d 16:00 WIB (UTC+7)
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

    for s in &staff_rows {
        let staff_id: i64 = s.get("id");
        let staff_name: String = s.get("name");
        let staff_email: String = s.get("email");

        // Cek apakah staf ini sudah memiliki voucher hari ini
        let existing: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM vouchers WHERE staff_id = $1 AND voucher_date = $2"
        )
        .bind(staff_id)
        .bind(date)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Gagal cek existing voucher: {}", e))?;

        if existing.is_some() {
            skipped_count += 1;
            details.push(format!("Lewati: {} ({}) sudah memiliki voucher hari ini", staff_name, staff_email));
            continue;
        }

        // Generate token kriptografi & kode pendek
        let token = crypto::generate_token();
        let token_hash = crypto::hash_token(&token);
        let qr_payload = crypto::create_qr_payload(&cfg.qr_key, &token);

        let short_code = crypto::generate_short_code();
        let raw_code = short_code.replace(['-', ' '], "");
        let short_code_hash = crypto::short_code_hash(&cfg.short_key, &date_str, &raw_code);

        // 4. Simpan voucher ke database TERLEBIH DAHULU (status issued, email_sent_at NULL)
        // Hanya hash token & hash short_code yang disimpan demi keamanan (T-2)
        let ins_sql = r#"
            INSERT INTO vouchers (
                staff_id, voucher_date, amount, token_hash, short_code_hash,
                valid_from, valid_until, status, email_sent_at
            )
            VALUES ($1, $2, 5000, $3, $4, $5, $6, 'issued', NULL)
            RETURNING id
        "#;

        let voucher_id: i64 = sqlx::query_scalar(ins_sql)
            .bind(staff_id)
            .bind(date)
            .bind(&token_hash)
            .bind(&short_code_hash)
            .bind(valid_from)
            .bind(valid_until)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("Gagal insert voucher untuk {}: {}", staff_name, e))?;

        // 5. Kirim email via Mailer (Microsoft Graph API / SMTP / Log)
        let email_data = VoucherEmailData {
            staff_name: &staff_name,
            staff_email: &staff_email,
            date_str: &date_str,
            qr_payload: &qr_payload,
            short_code: &short_code,
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

        issued_count += 1;
        let mail_note = if email_sent { "Email Terkirim" } else { "Email Tertunda" };
        details.push(format!(
            "Voucher #{} [Rp5.000] ({}) -> {} ({})",
            voucher_id, mail_note, staff_name, staff_email
        ));
    }

    let message = format!(
        "Penerbitan voucher selesai untuk tanggal {}: {} diterbitkan, {} dilewati (total {} staf aktif).",
        date_str, issued_count, skipped_count, total_staff
    );

    Ok(IssueSummary {
        date: date_str,
        total_staff,
        issued_count,
        skipped_count,
        skipped_holiday_or_weekend: false,
        message,
        details,
    })
}
