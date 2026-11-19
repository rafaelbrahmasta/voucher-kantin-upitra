use sqlx::postgres::PgPoolOptions;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();

    let args: Vec<String> = env::args().collect();
    if args.len() < 5 {
        eprintln!("============================================================");
        eprintln!("CLI Pembuat Akun Pengguna (Argon2id Hash Aman)");
        eprintln!("============================================================");
        eprintln!("Penggunaan:");
        eprintln!("  cargo run --bin create_user -- <role> <username> <display_name> <password>");
        eprintln!();
        eprintln!("Contoh:");
        eprintln!("  cargo run --bin create_user -- admin admin.it \"Admin Super IT\" \"KatasandiKuat#2026\"");
        eprintln!("  cargo run --bin create_user -- finance biro.keuangan \"Biro Keuangan UPITRA\" \"KeuanganKuat#2026\"");
        eprintln!("============================================================");
        std::process::exit(1);
    }

    let role = &args[1];
    let username = &args[2];
    let display_name = &args[3];
    let password = &args[4];

    if role != "admin" && role != "finance" {
        eprintln!("❌ Error: Role hanya boleh 'admin' atau 'finance'");
        std::process::exit(1);
    }

    if password.len() < 8 {
        eprintln!("❌ Error: Password minimal 8 karakter demi keamanan.");
        std::process::exit(1);
    }

    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL harus diset di .env");
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&db_url)
        .await?;

    // Hash password dengan Argon2id
    let password_hash = voucher_kantin_backend::crypto::hash_password(password)
        .map_err(|e| format!("Gagal melakukan hash password: {}", e))?;

    let sql = r#"
        INSERT INTO users (role, username, password_hash, display_name, is_active)
        VALUES ($1::user_role, $2, $3, $4, true)
        ON CONFLICT (username) DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            display_name = EXCLUDED.display_name,
            role = EXCLUDED.role,
            is_active = true
        RETURNING id
    "#;

    let row: (i64,) = sqlx::query_as(sql)
        .bind(role)
        .bind(username)
        .bind(&password_hash)
        .bind(display_name)
        .fetch_one(&pool)
        .await?;

    println!("============================================================");
    println!("✅ Akun pengguna berhasil dibuat / diperbarui!");
    println!("   ID           : {}", row.0);
    println!("   Peran (Role) : {}", role);
    println!("   Username     : {}", username);
    println!("   Nama Tampilan: {}", display_name);
    println!("   Metode Hash  : Argon2id (Garansi Enkripsi Kuat)");
    println!("============================================================");

    Ok(())
}
