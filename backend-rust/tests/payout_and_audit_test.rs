use sqlx::postgres::PgPoolOptions;
use voucher_kantin_backend::db::write_audit_log;

#[tokio::test]
async fn test_payout_status_enum_transferred() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    let db_url = match std::env::var("DATABASE_URL") {
        Ok(u) => u,
        Err(_) => return Ok(()), // Lewati jika tidak ada koneksi DB di lingkungan CI
    };

    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&db_url)
        .await?;

    // T-1: Verifikasi enum 'transferred' dapat diterima di tipe payout_status
    let receipt_test = format!("TEST-PAY-{}", chrono::Utc::now().timestamp_millis());
    let sql = r#"
        INSERT INTO payouts (receipt_no, tenant_id, amount, status, created_by)
        VALUES ($1, 1, 5000, 'transferred'::payout_status, 1)
        RETURNING id, status::text
    "#;

    let res: (i64, String) = sqlx::query_as(sql)
        .bind(&receipt_test)
        .fetch_one(&pool)
        .await?;

    assert_eq!(res.1, "transferred");

    // Bersihkan data test
    let _ = sqlx::query("DELETE FROM payouts WHERE id = $1")
        .bind(res.0)
        .execute(&pool)
        .await?;

    Ok(())
}

#[tokio::test]
async fn test_tamper_evident_audit_log() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    let db_url = match std::env::var("DATABASE_URL") {
        Ok(u) => u,
        Err(_) => return Ok(()),
    };

    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&db_url)
        .await?;

    // T-3: Tulis catatan jejak audit
    let log_id = write_audit_log(
        &pool,
        Some(1),
        "TEST_AUDIT_ACTION",
        None,
        serde_json::json!({ "test_key": "test_value" }),
        Some("Pengujian integritas jejak audit"),
        Some("192.168.1.100"),
    )
    .await?;

    assert!(log_id > 0);

    // Verifikasi row tersimpan dengan hash
    let row: (String, Vec<u8>, Vec<u8>) = sqlx::query_as(
        "SELECT action, prev_hash, row_hash FROM audit_log WHERE id = $1"
    )
    .bind(log_id)
    .fetch_one(&pool)
    .await?;

    assert_eq!(row.0, "TEST_AUDIT_ACTION");
    assert_eq!(row.1.len(), 32);
    assert_eq!(row.2.len(), 32);

    // Bersihkan baris audit test
    let _ = sqlx::query("DELETE FROM audit_log WHERE id = $1")
        .bind(log_id)
        .execute(&pool)
        .await?;

    Ok(())
}

#[tokio::test]
async fn test_voucher_retry_on_unemailed() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    let db_url = match std::env::var("DATABASE_URL") {
        Ok(u) => u,
        Err(_) => return Ok(()),
    };

    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&db_url)
        .await?;

    // Verifikasi bahwa jika email_sent_at IS NULL, token_hash dapat diperbarui
    let test_hash_1 = vec![1u8; 32];
    let test_hash_2 = vec![2u8; 32];
    let test_short_1 = vec![3u8; 32];
    let test_short_2 = vec![4u8; 32];

    let now = chrono::Utc::now();
    let date = now.date_naive();

    // Pastikan ada staf untuk test
    let staff_id: i64 = sqlx::query_scalar("SELECT id FROM staff LIMIT 1")
        .fetch_one(&pool)
        .await?;

    // Bersihkan voucher test jika ada
    let _ = sqlx::query("DELETE FROM vouchers WHERE staff_id = $1 AND voucher_date = $2")
        .bind(staff_id)
        .bind(date)
        .execute(&pool)
        .await;

    // Simpan voucher dengan email_sent_at NULL
    let v_id: i64 = sqlx::query_scalar(r#"
        INSERT INTO vouchers (staff_id, voucher_date, amount, token_hash, short_code_hash, valid_from, valid_until, status, email_sent_at)
        VALUES ($1, $2, 5000, $3, $4, now(), now() + interval '6 hours', 'issued', NULL)
        RETURNING id
    "#)
    .bind(staff_id)
    .bind(date)
    .bind(&test_hash_1)
    .bind(&test_short_1)
    .fetch_one(&pool)
    .await?;

    // Lakukan retry pembaruan token
    let updated = sqlx::query(r#"
        UPDATE vouchers
        SET token_hash = $1, short_code_hash = $2
        WHERE id = $3 AND status = 'issued' AND email_sent_at IS NULL
    "#)
    .bind(&test_hash_2)
    .bind(&test_short_2)
    .bind(v_id)
    .execute(&pool)
    .await?;

    assert_eq!(updated.rows_affected(), 1);

    // Verifikasi hash baru tersimpan
    let (saved_hash,): (Vec<u8>,) = sqlx::query_as("SELECT token_hash FROM vouchers WHERE id = $1")
        .bind(v_id)
        .fetch_one(&pool)
        .await?;

    assert_eq!(saved_hash, test_hash_2);

    // Bersihkan voucher test
    let _ = sqlx::query("DELETE FROM vouchers WHERE id = $1")
        .bind(v_id)
        .execute(&pool)
        .await;

    Ok(())
}

