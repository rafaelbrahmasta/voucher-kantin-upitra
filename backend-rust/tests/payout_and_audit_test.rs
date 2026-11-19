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
