use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub env: String,
    pub addr: String,
    pub database_url: String,
    pub qr_key: Vec<u8>,
    pub short_key: Vec<u8>,
    pub dev_tenant_id: i64,
    pub dev_user_id: i64,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        // Coba muat file .env dari folder saat ini atau folder parent
        if dotenvy::from_path(".env").is_err() {
            if dotenvy::from_path("../.env").is_err() {
                let _ = dotenvy::dotenv();
            }
        }

        let env_mode = env::var("APP_ENV").unwrap_or_else(|_| "dev".to_string());
        let addr = env::var("APP_ADDR").unwrap_or_else(|_| {
            let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());
            format!("0.0.0.0:{}", port)
        });
        let database_url = env::var("DATABASE_URL")
            .map_err(|_| "DATABASE_URL wajib diatur di .env".to_string())?;

        let qr_str = env::var("QR_KEY")
            .map_err(|_| "QR_KEY wajib diatur di .env (minimal 32 karakter)".to_string())?;
        let short_str = env::var("SHORT_KEY")
            .map_err(|_| "SHORT_KEY wajib diatur di .env (minimal 32 karakter)".to_string())?;

        if qr_str.len() < 32 || short_str.len() < 32 {
            return Err("QR_KEY dan SHORT_KEY harus minimal 32 karakter".to_string());
        }

        let dev_tenant_id = env::var("DEV_TENANT_ID")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(1);

        let dev_user_id = env::var("DEV_TENANT_USER_ID")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(1);

        Ok(Config {
            env: env_mode,
            addr,
            database_url,
            qr_key: qr_str.into_bytes(),
            short_key: short_str.into_bytes(),
            dev_tenant_id,
            dev_user_id,
        })
    }
}
