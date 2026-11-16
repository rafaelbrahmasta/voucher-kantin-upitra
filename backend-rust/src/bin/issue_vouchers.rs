use chrono::NaiveDate;
use std::env;
use voucher_kantin_backend::{config, db, issuer};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("============================================================");
    println!(" UPITRA Voucher Kantin: Job Penerbitan Voucher Harian      ");
    println!("============================================================");

    let cfg = config::Config::from_env().map_err(|e| format!("Konfigurasi gagal: {}", e))?;
    let pool = db::create_pool(&cfg.database_url).await.map_err(|e| {
        format!("Gagal menghubungkan ke database PostgreSQL: {}", e)
    })?;

    let args: Vec<String> = env::args().collect();
    let mut force = false;
    let mut target_date = None;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--force" | "-f" => {
                force = true;
            }
            "--date" | "-d" => {
                if i + 1 < args.len() {
                    i += 1;
                    if let Ok(d) = NaiveDate::parse_from_str(&args[i], "%Y-%m-%d") {
                        target_date = Some(d);
                    } else {
                        eprintln!("Format tanggal salah: {}. Gunakan format YYYY-MM-DD", args[i]);
                        std::process::exit(1);
                    }
                }
            }
            _ => {}
        }
        i += 1;
    }

    match issuer::run_issue_vouchers(&pool, &cfg.qr_key, &cfg.short_key, target_date, force).await {
        Ok(res) => {
            println!("📅 Tanggal: {}", res.date);
            println!("👥 Total Staf Aktif: {}", res.total_staff);
            println!("🎟️  Voucher Diterbitkan: {}", res.issued_count);
            println!("⏩ Dilewati: {}", res.skipped_count);
            println!("ℹ️  Status: {}", res.message);
            println!("------------------------------------------------------------");
            for line in res.details {
                println!("  * {}", line);
            }
            println!("============================================================");
        }
        Err(err) => {
            eprintln!("❌ Error saat menerbitkan voucher: {}", err);
            std::process::exit(1);
        }
    }

    Ok(())
}
