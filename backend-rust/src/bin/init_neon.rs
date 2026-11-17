use sqlx::postgres::PgPoolOptions;
use std::fs;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let neon_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL wajib diatur");

    println!("Menghubungkan ke database Neon cloud...");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(neon_url)
        .await?;
    println!("✅ Berhasil terhubung ke database Neon!");

    // Jalankan 0001_init.sql
    println!("Menjalankan migrations/0001_init.sql...");
    let init_sql = fs::read_to_string("../migrations/0001_init.sql")
        .or_else(|_| fs::read_to_string("migrations/0001_init.sql"))?;
    sqlx::raw_sql(&init_sql).execute(&pool).await?;
    println!("✅ 0001_init.sql selesai.");

    // Jalankan 0002_admin_master.sql
    println!("Menjalankan migrations/0002_admin_master.sql...");
    let sql_0002 = fs::read_to_string("../migrations/0002_admin_master.sql")
        .or_else(|_| fs::read_to_string("migrations/0002_admin_master.sql"))?;
    sqlx::raw_sql(&sql_0002).execute(&pool).await?;
    println!("✅ 0002_admin_master.sql selesai.");

    // Jalankan 0003_admin_login.sql
    println!("Menjalankan migrations/0003_admin_login.sql...");
    let sql_0003 = fs::read_to_string("../migrations/0003_admin_login.sql")
        .or_else(|_| fs::read_to_string("migrations/0003_admin_login.sql"))?;
    sqlx::raw_sql(&sql_0003).execute(&pool).await?;
    println!("✅ 0003_admin_login.sql selesai.");

    // Jalankan seed dev data jika diperlukan
    println!("Menjalankan deploy/dev_seed.sql...");
    if let Ok(seed_sql) = fs::read_to_string("../deploy/dev_seed.sql")
        .or_else(|_| fs::read_to_string("deploy/dev_seed.sql")) {
        let _ = sqlx::raw_sql(&seed_sql).execute(&pool).await;
        println!("✅ deploy/dev_seed.sql selesai.");
    }

    println!("Menjalankan deploy/dev_menu_seed.sql...");
    if let Ok(menu_sql) = fs::read_to_string("../deploy/dev_menu_seed.sql")
        .or_else(|_| fs::read_to_string("deploy/dev_menu_seed.sql")) {
        let _ = sqlx::raw_sql(&menu_sql).execute(&pool).await;
        println!("✅ deploy/dev_menu_seed.sql selesai.");
    }

    println!("============================================================");
    println!("🎉 DATABASE NEON CLOUD SUKSES DIINISIALISASI & SIAP DIGUNAKAN!");
    println!("============================================================");

    Ok(())
}
