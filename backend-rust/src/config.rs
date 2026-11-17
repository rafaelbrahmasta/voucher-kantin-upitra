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
    pub mail_driver: String,
    pub mail_from: String,
    pub ms_tenant_id: Option<String>,
    pub ms_client_id: Option<String>,
    pub ms_client_secret: Option<String>,
    pub ms_mail_from: Option<String>,
    pub smtp_host: Option<String>,
    pub smtp_port: u16,
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

        let mail_driver = env::var("MAIL_DRIVER").unwrap_or_else(|_| "log".to_string()).to_lowercase();
        let mail_from = env::var("MAIL_FROM").unwrap_or_else(|_| "Voucher Kantin UPITRA <voucher@upitra.ac.id>".to_string());

        let ms_tenant_id = env::var("MS_TENANT_ID").ok().filter(|s| !s.trim().is_empty() && s != "your-azure-tenant-id");
        let ms_client_id = env::var("MS_CLIENT_ID").ok().filter(|s| !s.trim().is_empty() && s != "your-azure-client-id");
        let ms_client_secret = env::var("MS_CLIENT_SECRET").ok().filter(|s| !s.trim().is_empty() && s != "your-azure-client-secret");
        let ms_mail_from = env::var("MS_MAIL_FROM").ok().filter(|s| !s.trim().is_empty());

        let smtp_host = env::var("SMTP_HOST").ok().filter(|s| !s.trim().is_empty());
        let smtp_port = env::var("SMTP_PORT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(1025);

        Ok(Config {
            env: env_mode,
            addr,
            database_url,
            qr_key: qr_str.into_bytes(),
            short_key: short_str.into_bytes(),
            dev_tenant_id,
            dev_user_id,
            mail_driver,
            mail_from,
            ms_tenant_id,
            ms_client_id,
            ms_client_secret,
            ms_mail_from,
            smtp_host,
            smtp_port,
        })
    }
}
