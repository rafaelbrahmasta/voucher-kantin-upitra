use chrono::{DateTime, FixedOffset, NaiveDate, Utc};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use voucher_kantin_backend::config::Config;
use voucher_kantin_backend::crypto;
use voucher_kantin_backend::db::scan_by_token_hash;
use voucher_kantin_backend::issuer::{resend_single_voucher, resend_single_voucher_at, run_issue_vouchers};
use voucher_kantin_backend::routes::finance::{claim_payout, parse_strict_date, ClaimError};

/// Helper inisialisasi lingkungan tes yang aman sesuai C3:
/// - Menggunakan TEST_DATABASE_URL (bukan DATABASE_URL)
/// - Menolak jalan jika nama database tidak mengandung kata "test"
async fn get_test_pool_and_cfg() -> (PgPool, Config) {
    let _ = dotenvy::from_filename(".env");
    let _ = dotenvy::from_filename("../.env");
    let _ = dotenvy::dotenv();

    let test_db_url = std::env::var("TEST_DATABASE_URL")
        .expect("TEST_DATABASE_URL wajib diatur di .env (tidak boleh lulus diam-diam)");

    if !test_db_url.to_lowercase().contains("test") {
        panic!(
            "KEAMANAN: Nama database di TEST_DATABASE_URL ('{}') harus mengandung kata 'test'!",
            test_db_url
        );
    }

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&test_db_url)
        .await
        .expect("Gagal menghubungkan ke database TEST_DATABASE_URL");

    let mut cfg = Config::from_env().unwrap_or_else(|_| Config {
        env: "test".to_string(),
        addr: "127.0.0.1:8080".to_string(),
        database_url: test_db_url.clone(),
        qr_key: b"01234567890123456789012345678901".to_vec(),
        short_key: b"01234567890123456789012345678901".to_vec(),
        dev_tenant_id: 1,
        dev_user_id: 1,
        mail_driver: "log".to_string(),
        mail_from: "test@upitra.ac.id".to_string(),
        ms_tenant_id: None,
        ms_client_id: None,
        ms_client_secret: None,
        ms_mail_from: None,
        smtp_host: None,
        smtp_port: 1025,
        smtp_user: None,
        smtp_pass: None,
    });
    cfg.database_url = test_db_url;
    cfg.mail_driver = "log".to_string();

    (pool, cfg)
}

fn unique_id() -> i64 {
    Utc::now().timestamp_nanos_opt().unwrap_or(0).abs()
}

// ─────────────────────────────────────────────────────────────────────────────
// C4.1: Email gagal -> voucher tetap 'issued' dengan email_sent_at NULL;
//       penerbitan ulang membuat token baru; token LAMA ditolak oleh
//       scan_by_token_hash (hasil 'invalid'), token BARU diterima.
// ─────────────────────────────────────────────────────────────────────────────
#[tokio::test]
#[ignore = "butuh TEST_DATABASE_URL"]
async fn test_c4_1_email_failure_and_token_invalidation() -> Result<(), Box<dyn std::error::Error>> {
    let (pool, mut cfg) = get_test_pool_and_cfg().await;
    let uid = unique_id();
    let nip = format!("T1-NIP-{}", uid);
    let email = format!("test1_{}@upitra.ac.id", uid);
    let test_date = NaiveDate::from_ymd_opt(2030, 1, 1).unwrap();

    // 1. Buat staf unik untuk tes ini
    let staff_id: i64 = sqlx::query_scalar(
        "INSERT INTO staff (nip, name, email, unit, is_active) VALUES ($1, $2, $3, 'IT-TEST', true) RETURNING id"
    )
    .bind(&nip)
    .bind(format!("Staf Tes 1 {}", uid))
    .bind(&email)
    .fetch_one(&pool)
    .await?;

    // Buat tenant & user kasir unik untuk tes scan
    let tenant_id: i64 = sqlx::query_scalar(
        "INSERT INTO tenants (name, stall_location, owner_name, bank_name, bank_account, is_active) VALUES ($1, 'K1', 'Owner 1', 'BCA', '111', true) RETURNING id"
    )
    .bind(format!("Stan Tes 1 {}", uid))
    .fetch_one(&pool)
    .await?;

    let cashier_id: i64 = sqlx::query_scalar(
        "INSERT INTO users (username, display_name, password_hash, role, tenant_id) VALUES ($1, 'Kasir 1', 'dummy_hash', 'tenant', $2) RETURNING id"
    )
    .bind(format!("cashier_1_{}", uid))
    .bind(tenant_id)
    .fetch_one(&pool)
    .await?;

    // 2. Simulasikan pengiriman email GAGAL dengan mail_driver = "fail"
    cfg.mail_driver = "fail".to_string();
    let res = run_issue_vouchers(&pool, &cfg, Some(test_date), true, false).await?;
    assert!(res.issued_count >= 1);

    // Verifikasi voucher staf berstatus 'issued' dan email_sent_at masih NULL
    let row: (i64, Vec<u8>, Option<DateTime<Utc>>, String) = sqlx::query_as(
        "SELECT id, token_hash, email_sent_at, status::text FROM vouchers WHERE staff_id = $1 AND voucher_date = $2"
    )
    .bind(staff_id)
    .bind(test_date)
    .fetch_one(&pool)
    .await?;

    let voucher_id = row.0;
    let old_token_hash = row.1;
    assert!(row.2.is_none(), "email_sent_at harus NULL saat pengiriman email gagal");
    assert_eq!(row.3, "issued");

    // 3. Penerbitan ulang (retry otomatis) dengan mail_driver = "log"
    cfg.mail_driver = "log".to_string();
    let res_retry = run_issue_vouchers(&pool, &cfg, Some(test_date), true, false).await?;
    assert!(res_retry.issued_count >= 1);

    let row_retry: (Vec<u8>, Option<DateTime<Utc>>) = sqlx::query_as(
        "SELECT token_hash, email_sent_at FROM vouchers WHERE id = $1"
    )
    .bind(voucher_id)
    .fetch_one(&pool)
    .await?;

    let new_token_hash = row_retry.0;
    assert_ne!(old_token_hash, new_token_hash, "Token hash baru harus berbeda dari token hash lama");
    assert!(row_retry.1.is_some(), "email_sent_at harus terisi setelah retry sukses");

    // Sesuaikan valid_from & valid_until agar waktu sekarang berada dalam rentang berlaku untuk pengujian scan
    sqlx::query("UPDATE vouchers SET valid_from = now() - interval '5 minutes', valid_until = now() + interval '5 minutes' WHERE id = $1")
        .bind(voucher_id)
        .execute(&pool)
        .await?;

    // 4. Token LAMA harus ditolak oleh scan_by_token_hash (bukan 'ok')
    let scan_old = scan_by_token_hash(&pool, &old_token_hash, tenant_id, cashier_id, None).await?;
    assert_ne!(scan_old.result, "ok", "Token LAMA harus ditolak oleh kasir");

    // 5. Token BARU harus diterima oleh scan_by_token_hash
    let scan_new = scan_by_token_hash(&pool, &new_token_hash, tenant_id, cashier_id, None).await?;
    assert_eq!(scan_new.result, "ok", "Token BARU harus sukses diterima oleh kasir");

    // Cleanup data milik tes ini
    let _ = sqlx::query("DELETE FROM vouchers WHERE id = $1").bind(voucher_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM users WHERE id = $1").bind(cashier_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM tenants WHERE id = $1").bind(tenant_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM staff WHERE id = $1").bind(staff_id).execute(&pool).await;

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// C4.2: Penerbitan dengan `--force` pada voucher yang emailnya sudah terkirim
//       TIDAK mengubah token_hash; dengan `--resend` token_hash berubah.
// ─────────────────────────────────────────────────────────────────────────────
#[tokio::test]
#[ignore = "butuh TEST_DATABASE_URL"]
async fn test_c4_2_force_vs_resend_behavior() -> Result<(), Box<dyn std::error::Error>> {
    let (pool, cfg) = get_test_pool_and_cfg().await;
    let uid = unique_id();
    let nip = format!("T2-NIP-{}", uid);
    let email = format!("test2_{}@upitra.ac.id", uid);
    // Gunakan hari Selasa (bukan akhir pekan) agar tidak terlewat oleh pengecekan libur/weekend saat resend
    let test_date = NaiveDate::from_ymd_opt(2030, 1, 15).unwrap();

    let staff_id: i64 = sqlx::query_scalar(
        "INSERT INTO staff (nip, name, email, unit, is_active) VALUES ($1, $2, $3, 'IT-TEST', true) RETURNING id"
    )
    .bind(&nip)
    .bind(format!("Staf Tes 2 {}", uid))
    .bind(&email)
    .fetch_one(&pool)
    .await?;

    // Terbitkan awal dengan email sukses (driver log)
    run_issue_vouchers(&pool, &cfg, Some(test_date), true, false).await?;

    let row_init: (i64, Vec<u8>, Option<DateTime<Utc>>) = sqlx::query_as(
        "SELECT id, token_hash, email_sent_at FROM vouchers WHERE staff_id = $1 AND voucher_date = $2"
    )
    .bind(staff_id)
    .bind(test_date)
    .fetch_one(&pool)
    .await?;

    let voucher_id = row_init.0;
    let hash_init = row_init.1;
    assert!(row_init.2.is_some(), "Email harus berstatus terkirim");

    // Terbitkan dengan --force (force=true, resend=false) -> Hash TIDAK BOLEH berubah
    let res_force = run_issue_vouchers(&pool, &cfg, Some(test_date), true, false).await?;
    assert_eq!(res_force.failed_count, 0);

    let row_after_force: (Vec<u8>,) = sqlx::query_as(
        "SELECT token_hash FROM vouchers WHERE id = $1"
    )
    .bind(voucher_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(row_after_force.0, hash_init, "Flag --force saja TIDAK BOLEH mengubah token_hash voucher yang emailnya sudah terkirim");

    // Terbitkan dengan --resend (force=false, resend=true) -> Hash HARUS BERUBAH
    let res_resend = run_issue_vouchers(&pool, &cfg, Some(test_date), false, true).await?;
    assert_eq!(res_resend.failed_count, 0);

    let row_after_resend: (Vec<u8>,) = sqlx::query_as(
        "SELECT token_hash FROM vouchers WHERE id = $1"
    )
    .bind(voucher_id)
    .fetch_one(&pool)
    .await?;
    assert_ne!(row_after_resend.0, hash_init, "Flag --resend HARUS mengubah token_hash voucher");

    // Cleanup
    let _ = sqlx::query("DELETE FROM vouchers WHERE id = $1").bind(voucher_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM staff WHERE id = $1").bind(staff_id).execute(&pool).await;

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// C4.3: Satu staf yang error saat diproses tidak menghentikan staf lain;
//       failed_count benar.
// ─────────────────────────────────────────────────────────────────────────────
#[tokio::test]
#[ignore = "butuh TEST_DATABASE_URL"]
async fn test_c4_3_error_isolation_and_failed_count() -> Result<(), Box<dyn std::error::Error>> {
    let (pool, cfg) = get_test_pool_and_cfg().await;
    let uid = unique_id();
    let test_date = NaiveDate::from_ymd_opt(2030, 3, 3).unwrap();

    let staff_a: i64 = sqlx::query_scalar(
        "INSERT INTO staff (nip, name, email, unit, is_active) VALUES ($1, $2, $3, 'IT-TEST', true) RETURNING id"
    )
    .bind(format!("T3A-{}", uid))
    .bind(format!("Staff Gagal {}", uid))
    .bind(format!("gagal_{}@upitra.ac.id", uid))
    .fetch_one(&pool)
    .await?;

    let staff_b: i64 = sqlx::query_scalar(
        "INSERT INTO staff (nip, name, email, unit, is_active) VALUES ($1, $2, $3, 'IT-TEST', true) RETURNING id"
    )
    .bind(format!("T3B-{}", uid))
    .bind(format!("Staff Sukses {}", uid))
    .bind(format!("sukses_{}@upitra.ac.id", uid))
    .fetch_one(&pool)
    .await?;

    // Pasang trigger DB simulasi error khusus pada staff_a dan test_date ini saja
    let trigger_fn = format!(r#"
        CREATE OR REPLACE FUNCTION trg_sim_fail_{}()
        RETURNS TRIGGER AS $$
        BEGIN
            IF NEW.staff_id = {} AND NEW.voucher_date = '{}' THEN
                RAISE EXCEPTION 'Simulasi DB error pada staf spesifik';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    "#, uid, staff_a, test_date);
    sqlx::query(&trigger_fn).execute(&pool).await?;

    let create_trg = format!(
        "CREATE TRIGGER trg_test_{} BEFORE INSERT ON vouchers FOR EACH ROW EXECUTE FUNCTION trg_sim_fail_{}();",
        uid, uid
    );
    sqlx::query(&create_trg).execute(&pool).await?;

    // Jalankan penerbitan batch
    let summary = run_issue_vouchers(&pool, &cfg, Some(test_date), true, false).await?;

    // Lepas trigger DB
    let _ = sqlx::query(&format!("DROP TRIGGER IF EXISTS trg_test_{} ON vouchers;", uid)).execute(&pool).await;
    let _ = sqlx::query(&format!("DROP FUNCTION IF EXISTS trg_sim_fail_{}();", uid)).execute(&pool).await;

    // Verifikasi: failed_count minimal 1, dan rincian details memuat info error staff_a
    assert!(summary.failed_count >= 1, "failed_count harus mencatat staf yang gagal");
    let has_fail_detail = summary.details.iter().any(|d| d.contains("Gagal:") && d.contains(&format!("Staff Gagal {}", uid)));
    assert!(has_fail_detail, "Details harus memuat pesan error per staf");

    // Verifikasi staff_b berhasil mendapatkan voucher
    let voucher_b: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM vouchers WHERE staff_id = $1 AND voucher_date = $2"
    )
    .bind(staff_b)
    .bind(test_date)
    .fetch_optional(&pool)
    .await?;
    assert!(voucher_b.is_some(), "Staf lain (staff_b) harus tetap berhasil mendapatkan voucher");

    // Cleanup
    if let Some(vid) = voucher_b {
        let _ = sqlx::query("DELETE FROM vouchers WHERE id = $1").bind(vid).execute(&pool).await;
    }
    let _ = sqlx::query("DELETE FROM staff WHERE id = ANY($1)").bind(&[staff_a, staff_b]).execute(&pool).await;

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// C4.4: resend ditolak untuk staf nonaktif, voucher 'used', dan setelah 16:00 WIB.
// ─────────────────────────────────────────────────────────────────────────────
#[tokio::test]
#[ignore = "butuh TEST_DATABASE_URL"]
async fn test_c4_4_resend_validation_rules() -> Result<(), Box<dyn std::error::Error>> {
    let (pool, cfg) = get_test_pool_and_cfg().await;
    let uid = unique_id();
    let today = Utc::now().date_naive();
    let wib = FixedOffset::east_opt(7 * 3600).unwrap();

    // Buat tenant & cashier untuk keperluan data valid voucher 'used'
    let tenant_id: i64 = sqlx::query_scalar(
        "INSERT INTO tenants (name, stall_location, owner_name, bank_name, bank_account, is_active) VALUES ($1, 'K4', 'Owner 4', 'BCA', '444', true) RETURNING id"
    )
    .bind(format!("Stan Tes 4 {}", uid))
    .fetch_one(&pool)
    .await?;

    let cashier_id: i64 = sqlx::query_scalar(
        "INSERT INTO users (username, display_name, password_hash, role, tenant_id) VALUES ($1, 'Kasir 4', 'dummy', 'tenant', $2) RETURNING id"
    )
    .bind(format!("cashier_4_{}", uid))
    .bind(tenant_id)
    .fetch_one(&pool)
    .await?;

    // 4a. Staf nonaktif
    let staff_nonactive: i64 = sqlx::query_scalar(
        "INSERT INTO staff (nip, name, email, unit, is_active) VALUES ($1, 'Nonaktif', $2, 'IT', false) RETURNING id"
    )
    .bind(format!("T4A-{}", uid))
    .bind(format!("nonactive_{}@upitra.ac.id", uid))
    .fetch_one(&pool)
    .await?;

    let hash_4a = crypto::hash_token(&format!("t4a_{}", uid));
    let short_4a = crypto::hash_token(&format!("t4a_sc_{}", uid));
    let v_na: i64 = sqlx::query_scalar(r#"
        INSERT INTO vouchers (staff_id, voucher_date, amount, token_hash, short_code_hash, valid_from, valid_until, status)
        VALUES ($1, $2, 5000, $3, $4, now(), now() + interval '1 hour', 'issued')
        RETURNING id
    "#)
    .bind(staff_nonactive)
    .bind(today)
    .bind(&hash_4a)
    .bind(&short_4a)
    .fetch_one(&pool)
    .await?;

    let res_na = resend_single_voucher(&pool, &cfg, staff_nonactive).await;
    assert!(res_na.is_err(), "Resend harus ditolak untuk staf nonaktif");
    assert!(res_na.unwrap_err().contains("nonaktif"));

    // 4b. Voucher berstatus 'used' (harus mengisi used_at, used_by_tenant_id, scanned_by_user_id sesuai constraint)
    let staff_used: i64 = sqlx::query_scalar(
        "INSERT INTO staff (nip, name, email, unit, is_active) VALUES ($1, 'Used', $2, 'IT', true) RETURNING id"
    )
    .bind(format!("T4B-{}", uid))
    .bind(format!("used_{}@upitra.ac.id", uid))
    .fetch_one(&pool)
    .await?;

    let hash_4b = crypto::hash_token(&format!("t4b_{}", uid));
    let short_4b = crypto::hash_token(&format!("t4b_sc_{}", uid));
    let v_used: i64 = sqlx::query_scalar(r#"
        INSERT INTO vouchers (staff_id, voucher_date, amount, token_hash, short_code_hash, valid_from, valid_until, status, used_at, used_by_tenant_id, scanned_by_user_id)
        VALUES ($1, $2, 5000, $3, $4, now(), now() + interval '1 hour', 'used', now(), $5, $6)
        RETURNING id
    "#)
    .bind(staff_used)
    .bind(today)
    .bind(&hash_4b)
    .bind(&short_4b)
    .bind(tenant_id)
    .bind(cashier_id)
    .fetch_one(&pool)
    .await?;

    let res_used = resend_single_voucher(&pool, &cfg, staff_used).await;
    assert!(res_used.is_err(), "Resend harus ditolak jika voucher sudah status 'used'");

    // 4c. Setelah 16:00 WIB
    let staff_active: i64 = sqlx::query_scalar(
        "INSERT INTO staff (nip, name, email, unit, is_active) VALUES ($1, 'Active', $2, 'IT', true) RETURNING id"
    )
    .bind(format!("T4C-{}", uid))
    .bind(format!("active_{}@upitra.ac.id", uid))
    .fetch_one(&pool)
    .await?;

    let hash_4c = crypto::hash_token(&format!("t4c_{}", uid));
    let short_4c = crypto::hash_token(&format!("t4c_sc_{}", uid));
    let v_active: i64 = sqlx::query_scalar(r#"
        INSERT INTO vouchers (staff_id, voucher_date, amount, token_hash, short_code_hash, valid_from, valid_until, status)
        VALUES ($1, $2, 5000, $3, $4, now(), now() + interval '1 hour', 'issued')
        RETURNING id
    "#)
    .bind(staff_active)
    .bind(today)
    .bind(&hash_4c)
    .bind(&short_4c)
    .fetch_one(&pool)
    .await?;

    // Simulasikan waktu saat ini adalah pukul 16:30 WIB
    let time_after_16 = today
        .and_hms_opt(16, 30, 0)
        .unwrap()
        .and_local_timezone(wib)
        .unwrap();

    let res_after_16 = resend_single_voucher_at(&pool, &cfg, staff_active, time_after_16).await;
    assert!(res_after_16.is_err(), "Resend harus ditolak setelah pukul 16:00 WIB");
    assert!(res_after_16.unwrap_err().contains("16:00"));

    // Cleanup
    let _ = sqlx::query("DELETE FROM vouchers WHERE id = ANY($1)").bind(&[v_na, v_used, v_active]).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM users WHERE id = $1").bind(cashier_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM tenants WHERE id = $1").bind(tenant_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM staff WHERE id = ANY($1)").bind(&[staff_nonactive, staff_used, staff_active]).execute(&pool).await;

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// C4.5: claim_payout sebelum 16:00 WIB pada hari ini -> ditolak;
//       setelah 16:00 -> berhasil; tanggal kemarin kapan saja -> berhasil;
//       tanggal masa depan -> ditolak.
// ─────────────────────────────────────────────────────────────────────────────
#[tokio::test]
#[ignore = "butuh TEST_DATABASE_URL"]
async fn test_c4_5_claim_payout_cutoff_rules() -> Result<(), Box<dyn std::error::Error>> {
    let (pool, _) = get_test_pool_and_cfg().await;
    let uid = unique_id();
    let wib = FixedOffset::east_opt(7 * 3600).unwrap();
    let today = Utc::now().with_timezone(&wib).date_naive();
    let yesterday = today - chrono::Duration::days(1);
    let tomorrow = today + chrono::Duration::days(1);

    let tenant_id: i64 = sqlx::query_scalar(
        "INSERT INTO tenants (name, stall_location, owner_name, bank_name, bank_account, is_active) VALUES ($1, 'K5', 'Owner 5', 'BCA', '555', true) RETURNING id"
    )
    .bind(format!("Stan Tes 5 {}", uid))
    .fetch_one(&pool)
    .await?;

    let cashier_id: i64 = sqlx::query_scalar(
        "INSERT INTO users (username, display_name, password_hash, role, tenant_id) VALUES ($1, 'Kasir 5', 'dummy', 'tenant', $2) RETURNING id"
    )
    .bind(format!("cashier_5_{}", uid))
    .bind(tenant_id)
    .fetch_one(&pool)
    .await?;

    let finance_user_id: i64 = sqlx::query_scalar(r#"
        INSERT INTO users (microsoft_oid, display_name, role)
        VALUES (gen_random_uuid(), 'Finance 5', 'finance')
        RETURNING id
    "#)
    .fetch_one(&pool)
    .await?;

    let staff_id: i64 = sqlx::query_scalar(
        "INSERT INTO staff (nip, name, email, unit, is_active) VALUES ($1, 'Staff 5', $2, 'IT', true) RETURNING id"
    )
    .bind(format!("T5-{}", uid))
    .bind(format!("staff5_{}@upitra.ac.id", uid))
    .fetch_one(&pool)
    .await?;

    // Voucher digunakan kemarin (valid_until > valid_from)
    let v_yesterday: i64 = sqlx::query_scalar(r#"
        INSERT INTO vouchers (staff_id, voucher_date, amount, token_hash, short_code_hash, valid_from, valid_until, status, used_by_tenant_id, scanned_by_user_id, used_at)
        VALUES ($1, $2, 5000, '\x11', '\x12', now() - interval '2 days', now() - interval '1 day', 'used', $3, $4, now() - interval '1 day')
        RETURNING id
    "#)
    .bind(staff_id)
    .bind(yesterday)
    .bind(tenant_id)
    .bind(cashier_id)
    .fetch_one(&pool)
    .await?;

    // Voucher digunakan hari ini (valid_until > valid_from)
    let v_today: i64 = sqlx::query_scalar(r#"
        INSERT INTO vouchers (staff_id, voucher_date, amount, token_hash, short_code_hash, valid_from, valid_until, status, used_by_tenant_id, scanned_by_user_id, used_at)
        VALUES ($1, $2, 5000, '\x13', '\x14', now() - interval '1 hour', now() + interval '5 hours', 'used', $3, $4, now())
        RETURNING id
    "#)
    .bind(staff_id)
    .bind(today)
    .bind(tenant_id)
    .bind(cashier_id)
    .fetch_one(&pool)
    .await?;

    // 5a: Hari ini sebelum 16:00 WIB (misal 14:00) -> DITOLAK
    let now_14_00 = today.and_hms_opt(14, 0, 0).unwrap().and_local_timezone(wib).unwrap();
    let err_before = claim_payout(&pool, tenant_id, today, finance_user_id, now_14_00).await;
    match err_before {
        Err(ClaimError::BeforeCutoff) => {}
        other => panic!("Harus ditolak dengan BeforeCutoff, tapi hasil: {:?}", other),
    }

    // 5b: Tanggal masa depan -> DITOLAK
    let now_17_00 = today.and_hms_opt(17, 0, 0).unwrap().and_local_timezone(wib).unwrap();
    let err_future = claim_payout(&pool, tenant_id, tomorrow, finance_user_id, now_17_00).await;
    match err_future {
        Err(ClaimError::FutureDate) => {}
        other => panic!("Harus ditolak dengan FutureDate, tapi hasil: {:?}", other),
    }

    // 5c: Tanggal kemarin kapan saja (misal jam 10:00 pagi) -> BERHASIL
    let now_10_00 = today.and_hms_opt(10, 0, 0).unwrap().and_local_timezone(wib).unwrap();
    let ok_yesterday = claim_payout(&pool, tenant_id, yesterday, finance_user_id, now_10_00).await;
    assert!(ok_yesterday.is_ok(), "Pencairan kemarin harus berhasil: {:?}", ok_yesterday.err());

    // 5d: Hari ini setelah 16:00 WIB (misal 17:00) -> BERHASIL
    let ok_today = claim_payout(&pool, tenant_id, today, finance_user_id, now_17_00).await;
    assert!(ok_today.is_ok(), "Pencairan hari ini setelah 16:00 harus berhasil: {:?}", ok_today.err());

    // Cleanup
    let _ = sqlx::query("DELETE FROM vouchers WHERE id = ANY($1)").bind(&[v_yesterday, v_today]).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM settlements WHERE tenant_id = $1").bind(tenant_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM payouts WHERE tenant_id = $1").bind(tenant_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM users WHERE id = ANY($1)").bind(&[cashier_id, finance_user_id]).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM staff WHERE id = $1").bind(staff_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM tenants WHERE id = $1").bind(tenant_id).execute(&pool).await;

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// C4.6: Dua claim_payout bersamaan (tokio::join!) untuk stan+tanggal yang sama
//       -> tepat satu sukses, satu ditolak; hanya ada 1 baris payouts & settlements.
// ─────────────────────────────────────────────────────────────────────────────
#[tokio::test]
#[ignore = "butuh TEST_DATABASE_URL"]
async fn test_c4_6_concurrent_claim_race_condition() -> Result<(), Box<dyn std::error::Error>> {
    let (pool, _) = get_test_pool_and_cfg().await;
    let uid = unique_id();
    let wib = FixedOffset::east_opt(7 * 3600).unwrap();
    let yesterday = Utc::now().with_timezone(&wib).date_naive() - chrono::Duration::days(1);
    let now_wib = Utc::now().with_timezone(&wib);

    let tenant_id: i64 = sqlx::query_scalar(
        "INSERT INTO tenants (name, stall_location, owner_name, bank_name, bank_account, is_active) VALUES ($1, 'K6', 'Owner 6', 'BCA', '666', true) RETURNING id"
    )
    .bind(format!("Stan Tes 6 {}", uid))
    .fetch_one(&pool)
    .await?;

    let cashier_id: i64 = sqlx::query_scalar(
        "INSERT INTO users (username, display_name, password_hash, role, tenant_id) VALUES ($1, 'Kasir 6', 'dummy', 'tenant', $2) RETURNING id"
    )
    .bind(format!("cashier_6_{}", uid))
    .bind(tenant_id)
    .fetch_one(&pool)
    .await?;

    let finance_user_id: i64 = sqlx::query_scalar(r#"
        INSERT INTO users (microsoft_oid, display_name, role)
        VALUES (gen_random_uuid(), 'Finance 6', 'finance')
        RETURNING id
    "#)
    .fetch_one(&pool)
    .await?;

    let staff_id: i64 = sqlx::query_scalar(
        "INSERT INTO staff (nip, name, email, unit, is_active) VALUES ($1, 'Staff 6', $2, 'IT', true) RETURNING id"
    )
    .bind(format!("T6-{}", uid))
    .bind(format!("staff6_{}@upitra.ac.id", uid))
    .fetch_one(&pool)
    .await?;

    let v_id: i64 = sqlx::query_scalar(r#"
        INSERT INTO vouchers (staff_id, voucher_date, amount, token_hash, short_code_hash, valid_from, valid_until, status, used_by_tenant_id, scanned_by_user_id, used_at)
        VALUES ($1, $2, 5000, '\x21', '\x22', now() - interval '2 days', now() - interval '1 day', 'used', $3, $4, now() - interval '1 day')
        RETURNING id
    "#)
    .bind(staff_id)
    .bind(yesterday)
    .bind(tenant_id)
    .bind(cashier_id)
    .fetch_one(&pool)
    .await?;

    // Jalankan 2 klaim konkuren via tokio::join!
    let (res1, res2) = tokio::join!(
        claim_payout(&pool, tenant_id, yesterday, finance_user_id, now_wib),
        claim_payout(&pool, tenant_id, yesterday, finance_user_id, now_wib)
    );

    let is_one_ok = (res1.is_ok() && res2.is_err()) || (res1.is_err() && res2.is_ok());
    assert!(is_one_ok, "Tepat satu klaim harus sukses dan satu klaim harus gagal. res1: {:?}, res2: {:?}", res1, res2);

    // Pastikan hanya ada tepat 1 baris payouts dan 1 baris settlements di DB
    let count_payouts: i64 = sqlx::query_scalar("SELECT count(*) FROM payouts WHERE tenant_id = $1")
        .bind(tenant_id)
        .fetch_one(&pool)
        .await?;
    assert_eq!(count_payouts, 1, "Harus tepat ada 1 baris di tabel payouts");

    let count_settlements: i64 = sqlx::query_scalar("SELECT count(*) FROM settlements WHERE tenant_id = $1 AND business_date = $2")
        .bind(tenant_id)
        .bind(yesterday)
        .fetch_one(&pool)
        .await?;
    assert_eq!(count_settlements, 1, "Harus tepat ada 1 baris di tabel settlements");

    // Cleanup
    let _ = sqlx::query("DELETE FROM vouchers WHERE id = $1").bind(v_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM settlements WHERE tenant_id = $1").bind(tenant_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM payouts WHERE tenant_id = $1").bind(tenant_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM users WHERE id = ANY($1)").bind(&[cashier_id, finance_user_id]).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM staff WHERE id = $1").bind(staff_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM tenants WHERE id = $1").bind(tenant_id).execute(&pool).await;

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// C4.7: receipt_no berformat PAY-YYYYMMDD-<tenant_id>; input "2026-1-5" ditolak.
// ─────────────────────────────────────────────────────────────────────────────
#[tokio::test]
#[ignore = "butuh TEST_DATABASE_URL"]
async fn test_c4_7_receipt_no_format_and_strict_date_parsing() -> Result<(), Box<dyn std::error::Error>> {
    let (pool, _) = get_test_pool_and_cfg().await;
    let uid = unique_id();
    let wib = FixedOffset::east_opt(7 * 3600).unwrap();
    let now_wib = Utc::now().with_timezone(&wib);

    // 1. Validasi penolakan format tidak baku (misal "2026-1-5")
    let invalid_parsed = parse_strict_date("2026-1-5");
    match invalid_parsed {
        Err(ClaimError::InvalidDate(_)) => {}
        other => panic!("Input '2026-1-5' harus ditolak dengan InvalidDate, namun hasil: {:?}", other),
    }

    // 2. Format baku YYYY-MM-DD diterima
    let valid_date_str = "2026-01-05";
    let claim_date = parse_strict_date(valid_date_str)?;
    assert_eq!(claim_date, NaiveDate::from_ymd_opt(2026, 1, 5).unwrap());

    // 3. Verifikasi receipt_no berformat PAY-YYYYMMDD-<tenant_id>
    let tenant_id: i64 = sqlx::query_scalar(
        "INSERT INTO tenants (name, stall_location, owner_name, bank_name, bank_account, is_active) VALUES ($1, 'K7', 'Owner 7', 'BCA', '777', true) RETURNING id"
    )
    .bind(format!("Stan Tes 7 {}", uid))
    .fetch_one(&pool)
    .await?;

    let cashier_id: i64 = sqlx::query_scalar(
        "INSERT INTO users (username, display_name, password_hash, role, tenant_id) VALUES ($1, 'Kasir 7', 'dummy', 'tenant', $2) RETURNING id"
    )
    .bind(format!("cashier_7_{}", uid))
    .bind(tenant_id)
    .fetch_one(&pool)
    .await?;

    let finance_user_id: i64 = sqlx::query_scalar(r#"
        INSERT INTO users (microsoft_oid, display_name, role)
        VALUES (gen_random_uuid(), 'Finance 7', 'finance')
        RETURNING id
    "#)
    .fetch_one(&pool)
    .await?;

    let staff_id: i64 = sqlx::query_scalar(
        "INSERT INTO staff (nip, name, email, unit, is_active) VALUES ($1, 'Staff 7', $2, 'IT', true) RETURNING id"
    )
    .bind(format!("T7-{}", uid))
    .bind(format!("staff7_{}@upitra.ac.id", uid))
    .fetch_one(&pool)
    .await?;

    let v_id: i64 = sqlx::query_scalar(r#"
        INSERT INTO vouchers (staff_id, voucher_date, amount, token_hash, short_code_hash, valid_from, valid_until, status, used_by_tenant_id, scanned_by_user_id, used_at)
        VALUES ($1, $2, 5000, '\x31', '\x32', now() - interval '2 days', now() + interval '5 days', 'used', $3, $4, now())
        RETURNING id
    "#)
    .bind(staff_id)
    .bind(claim_date)
    .bind(tenant_id)
    .bind(cashier_id)
    .fetch_one(&pool)
    .await?;

    let claim_res = claim_payout(&pool, tenant_id, claim_date, finance_user_id, now_wib).await?;
    let expected_receipt = format!("PAY-20260105-{}", tenant_id);
    assert_eq!(claim_res.receipt_no, expected_receipt, "Format receipt_no harus PAY-YYYYMMDD-<tenant_id>");

    // Cleanup
    let _ = sqlx::query("DELETE FROM vouchers WHERE id = $1").bind(v_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM settlements WHERE tenant_id = $1").bind(tenant_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM payouts WHERE tenant_id = $1").bind(tenant_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM users WHERE id = ANY($1)").bind(&[cashier_id, finance_user_id]).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM staff WHERE id = $1").bind(staff_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM tenants WHERE id = $1").bind(tenant_id).execute(&pool).await;

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// C4.8: Voucher yang di-scan setelah settlement dibuat tidak ikut dihitung ulang
//       (settlement_id IS NULL).
// ─────────────────────────────────────────────────────────────────────────────
#[tokio::test]
#[ignore = "butuh TEST_DATABASE_URL"]
async fn test_c4_8_vouchers_scanned_after_settlement_excluded() -> Result<(), Box<dyn std::error::Error>> {
    let (pool, _) = get_test_pool_and_cfg().await;
    let uid = unique_id();
    let wib = FixedOffset::east_opt(7 * 3600).unwrap();
    let yesterday = Utc::now().with_timezone(&wib).date_naive() - chrono::Duration::days(1);
    let now_wib = Utc::now().with_timezone(&wib);

    let tenant_id: i64 = sqlx::query_scalar(
        "INSERT INTO tenants (name, stall_location, owner_name, bank_name, bank_account, is_active) VALUES ($1, 'K8', 'Owner 8', 'BCA', '888', true) RETURNING id"
    )
    .bind(format!("Stan Tes 8 {}", uid))
    .fetch_one(&pool)
    .await?;

    let cashier_id: i64 = sqlx::query_scalar(
        "INSERT INTO users (username, display_name, password_hash, role, tenant_id) VALUES ($1, 'Kasir 8', 'dummy', 'tenant', $2) RETURNING id"
    )
    .bind(format!("cashier_8_{}", uid))
    .bind(tenant_id)
    .fetch_one(&pool)
    .await?;

    let finance_user_id: i64 = sqlx::query_scalar(r#"
        INSERT INTO users (microsoft_oid, display_name, role)
        VALUES (gen_random_uuid(), 'Finance 8', 'finance')
        RETURNING id
    "#)
    .fetch_one(&pool)
    .await?;

    let staff_id_1: i64 = sqlx::query_scalar(
        "INSERT INTO staff (nip, name, email, unit, is_active) VALUES ($1, 'Staff 8A', $2, 'IT', true) RETURNING id"
    )
    .bind(format!("T8A-{}", uid))
    .bind(format!("staff8a_{}@upitra.ac.id", uid))
    .fetch_one(&pool)
    .await?;

    let staff_id_2: i64 = sqlx::query_scalar(
        "INSERT INTO staff (nip, name, email, unit, is_active) VALUES ($1, 'Staff 8B', $2, 'IT', true) RETURNING id"
    )
    .bind(format!("T8B-{}", uid))
    .bind(format!("staff8b_{}@upitra.ac.id", uid))
    .fetch_one(&pool)
    .await?;

    let hash_8a = crypto::hash_token(&format!("t8a_{}", uid));
    let short_8a = crypto::hash_token(&format!("t8a_sc_{}", uid));
    // Voucher 1 dicairkan
    let v1: i64 = sqlx::query_scalar(r#"
        INSERT INTO vouchers (staff_id, voucher_date, amount, token_hash, short_code_hash, valid_from, valid_until, status, used_by_tenant_id, scanned_by_user_id, used_at)
        VALUES ($1, $2, 5000, $3, $4, now() - interval '2 days', now() - interval '1 day', 'used', $5, $6, now() - interval '1 day')
        RETURNING id
    "#)
    .bind(staff_id_1)
    .bind(yesterday)
    .bind(&hash_8a)
    .bind(&short_8a)
    .bind(tenant_id)
    .bind(cashier_id)
    .fetch_one(&pool)
    .await?;

    let claim1 = claim_payout(&pool, tenant_id, yesterday, finance_user_id, now_wib).await?;
    assert_eq!(claim1.count, 1);
    assert_eq!(claim1.amount, 5000);

    let hash_8b = crypto::hash_token(&format!("t8b_{}", uid));
    let short_8b = crypto::hash_token(&format!("t8b_sc_{}", uid));
    // Voucher 2 di-scan sesudah settlement dibuat (staf berbeda pada tanggal yang sama)
    let v2: i64 = sqlx::query_scalar(r#"
        INSERT INTO vouchers (staff_id, voucher_date, amount, token_hash, short_code_hash, valid_from, valid_until, status, used_by_tenant_id, scanned_by_user_id, used_at, settlement_id)
        VALUES ($1, $2, 5000, $3, $4, now() - interval '2 days', now() - interval '1 day', 'used', $5, $6, now() - interval '1 day', NULL)
        RETURNING id
    "#)
    .bind(staff_id_2)
    .bind(yesterday)
    .bind(&hash_8b)
    .bind(&short_8b)
    .bind(tenant_id)
    .bind(cashier_id)
    .fetch_one(&pool)
    .await?;

    // Klaim kedua pada tanggal yang sama harus ditolak (AlreadyPaid) karena tanggal tersebut sudah lunas
    let claim2 = claim_payout(&pool, tenant_id, yesterday, finance_user_id, now_wib).await;
    match claim2 {
        Err(ClaimError::AlreadyPaid) => {}
        other => panic!("Klaim susulan harus ditolak dengan AlreadyPaid, namun hasil: {:?}", other),
    }

    // Pastikan voucher 2 tetap memiliki settlement_id NULL (tidak ikut termakan/tertimpa)
    let v2_settlement_id: Option<i64> = sqlx::query_scalar("SELECT settlement_id FROM vouchers WHERE id = $1")
        .bind(v2)
        .fetch_one(&pool)
        .await?;
    assert!(v2_settlement_id.is_none(), "Voucher susulan harus tetap memiliki settlement_id NULL");

    // Cleanup
    let _ = sqlx::query("DELETE FROM vouchers WHERE id = ANY($1)").bind(&[v1, v2]).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM settlements WHERE tenant_id = $1").bind(tenant_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM payouts WHERE tenant_id = $1").bind(tenant_id).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM users WHERE id = ANY($1)").bind(&[cashier_id, finance_user_id]).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM staff WHERE id = ANY($1)").bind(&[staff_id_1, staff_id_2]).execute(&pool).await;
    let _ = sqlx::query("DELETE FROM tenants WHERE id = $1").bind(tenant_id).execute(&pool).await;

    Ok(())
}
