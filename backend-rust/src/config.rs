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

fn get_env_val(key: &str) -> Option<String> {
    if let Ok(val) = env::var(key) {
        let v = val.trim().to_string();
        if !v.is_empty() {
            return Some(v);
        }
    }
    for p in &[".env", "../.env", "../../.env"] {
        if let Ok(content) = std::fs::read_to_string(p) {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('#') {
                    continue;
                }
                if let Some((k, v)) = trimmed.split_once('=') {
                    if k.trim() == key {
                        let val = v.trim().trim_matches('"').trim_matches('\'').to_string();
                        if !val.is_empty() {
                            return Some(val);
                        }
                    }
                }
            }
        }
    }
    None
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        // Muat file .env dari folder saat ini atau folder parent
        let _ = dotenvy::from_filename(".env");
        let _ = dotenvy::from_filename("../.env");
        let _ = dotenvy::dotenv();

        let env_mode = get_env_val("APP_ENV").unwrap_or_else(|| "dev".to_string());
        let addr = get_env_val("APP_ADDR").unwrap_or_else(|| {
            let port = get_env_val("PORT").unwrap_or_else(|| "8080".to_string());
            format!("0.0.0.0:{}", port)
        });
        let database_url = get_env_val("DATABASE_URL")
            .ok_or_else(|| "DATABASE_URL wajib diatur di .env".to_string())?;

        let qr_str = get_env_val("QR_KEY")
            .ok_or_else(|| "QR_KEY wajib diatur di .env (minimal 32 karakter)".to_string())?;
        let short_str = get_env_val("SHORT_KEY")
            .ok_or_else(|| "SHORT_KEY wajib diatur di .env (minimal 32 karakter)".to_string())?;

        if qr_str.len() < 32 || short_str.len() < 32 {
            return Err("QR_KEY dan SHORT_KEY harus minimal 32 karakter".to_string());
        }

        let dev_tenant_id = get_env_val("DEV_TENANT_ID")
            .and_then(|s| s.parse().ok())
            .unwrap_or(1);

        let dev_user_id = get_env_val("DEV_TENANT_USER_ID")
            .and_then(|s| s.parse().ok())
            .unwrap_or(1);

        let mail_driver = get_env_val("MAIL_DRIVER").unwrap_or_else(|| "log".to_string()).to_lowercase();
        let mail_from = get_env_val("MAIL_FROM").unwrap_or_else(|| "Voucher Kantin UPITRA <voucher@upitra.ac.id>".to_string());

        let ms_tenant_id = get_env_val("MS_TENANT_ID").filter(|s| s != "your-azure-tenant-id");
        let ms_client_id = get_env_val("MS_CLIENT_ID").filter(|s| s != "your-azure-client-id");
        let ms_client_secret = get_env_val("MS_CLIENT_SECRET").filter(|s| s != "your-azure-client-secret");
        let ms_mail_from = get_env_val("MS_MAIL_FROM");

        let smtp_host = get_env_val("SMTP_HOST");
        let smtp_port = get_env_val("SMTP_PORT")
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
