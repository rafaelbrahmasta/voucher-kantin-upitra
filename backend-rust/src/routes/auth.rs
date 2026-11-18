use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use time::Duration;

use crate::crypto::{self, AdminSession};
use crate::AppState;

/// Helper: buat cookie yang kompatibel dengan HTTP (dev) dan HTTPS (prod)
/// Di HTTP/dev: SameSite=Lax, Secure=false (agar cookie diterima browser)
/// Di HTTPS/prod: SameSite=None, Secure=true (agar cross-origin request bisa kirim cookie)
fn make_auth_cookie<'c>(
    name: &'c str,
    value: String,
    is_https: bool,
) -> Cookie<'c> {
    if is_https {
        Cookie::build((name, value))
            .path("/")
            .http_only(true)
            .same_site(SameSite::None)
            .secure(true)
            .build()
    } else {
        Cookie::build((name, value))
            .path("/")
            .http_only(true)
            .same_site(SameSite::Lax)
            .secure(false)
            .build()
    }
}

fn make_clear_cookie<'c>(name: &'c str, is_https: bool) -> Cookie<'c> {
    if is_https {
        Cookie::build((name, ""))
            .path("/")
            .http_only(true)
            .max_age(Duration::seconds(-1))
            .same_site(SameSite::None)
            .secure(true)
            .build()
    } else {
        Cookie::build((name, ""))
            .path("/")
            .http_only(true)
            .max_age(Duration::seconds(-1))
            .same_site(SameSite::Lax)
            .secure(false)
            .build()
    }
}

const ADMIN_COOKIE: &str = "admin_sess";
const FINANCE_COOKIE: &str = "finance_sess";
const TENANT_COOKIE: &str = "tenant_sess";

#[derive(Serialize)]
pub struct AuthMeResponse {
    pub authenticated: bool,
    pub role: String,
    #[serde(rename = "displayName", skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(rename = "userId", skip_serializing_if = "Option::is_none")]
    pub user_id: Option<i64>,
    #[serde(rename = "tenantId", skip_serializing_if = "Option::is_none")]
    pub tenant_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stall: Option<String>,
}

pub async fn handle_auth_me(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> Json<AuthMeResponse> {
    let now_unix = Utc::now().timestamp();

    // 1. Cek Admin Sesi
    if let Some(cookie) = jar.get(ADMIN_COOKIE) {
        if let Some(sess) = crypto::decode_admin_session(&state.config.qr_key, cookie.value(), now_unix) {
            if sess.role == "admin" {
                return Json(AuthMeResponse {
                    authenticated: true,
                    role: "admin".to_string(),
                    display_name: Some(sess.display_name),
                    user_id: Some(sess.user_id),
                    tenant_id: None,
                    stall: None,
                });
            }
        }
    }

    // 2. Cek Finance Sesi
    if let Some(cookie) = jar.get(FINANCE_COOKIE) {
        if let Some(sess) = crypto::decode_admin_session(&state.config.qr_key, cookie.value(), now_unix) {
            if sess.role == "finance" {
                return Json(AuthMeResponse {
                    authenticated: true,
                    role: "finance".to_string(),
                    display_name: Some(sess.display_name),
                    user_id: Some(sess.user_id),
                    tenant_id: None,
                    stall: None,
                });
            }
        }
    }

    // 3. Cek Tenant Sesi
    if let Some(cookie) = jar.get(TENANT_COOKIE) {
        if let Some(sess) = crypto::decode_tenant_session(&state.config.qr_key, cookie.value(), now_unix) {
            if let Ok(true) = crate::db::is_session_valid(&state.pool, sess.tenant_id, sess.version).await {
                let tenant_name = match crate::db::get_tenant(&state.pool, sess.tenant_id).await {
                    Ok(Some(t)) => t.name,
                    _ => "Stan Kantin".to_string(),
                };
                return Json(AuthMeResponse {
                    authenticated: true,
                    role: "tenant".to_string(),
                    display_name: Some(tenant_name.clone()),
                    user_id: None,
                    tenant_id: Some(sess.tenant_id),
                    stall: Some(tenant_name),
                });
            }
        }
    }

    // Fallback mode dev jika tidak ada sesi sama sekali
    if state.config.env == "dev" && state.config.dev_tenant_id > 0 {
        let tenant_name = match crate::db::get_tenant(&state.pool, state.config.dev_tenant_id).await {
            Ok(Some(t)) => t.name,
            _ => "Stan Kantin (Dev)".to_string(),
        };
        return Json(AuthMeResponse {
            authenticated: true,
            role: "tenant".to_string(),
            display_name: Some(tenant_name.clone()),
            user_id: None,
            tenant_id: Some(state.config.dev_tenant_id),
            stall: Some(tenant_name),
        });
    }

    Json(AuthMeResponse {
        authenticated: false,
        role: String::new(),
        display_name: None,
        user_id: None,
        tenant_id: None,
        stall: None,
    })
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub role: String,
    pub email: Option<String>,
    pub password: Option<String>,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub ok: bool,
    pub role: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub async fn handle_auth_login(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(payload): Json<LoginRequest>,
) -> Result<(CookieJar, Json<LoginResponse>), (StatusCode, Json<LoginResponse>)> {
    let role = payload.role.as_str();
    if role != "admin" && role != "finance" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(LoginResponse {
                ok: false,
                role: payload.role,
                display_name: String::new(),
                error: Some("Peran harus 'admin' atau 'finance'".to_string()),
            }),
        ));
    }

    let identifier = payload.email.as_deref().unwrap_or("").trim();
    let password = payload.password.as_deref().unwrap_or("").trim();

    // Verifikasi kredensial ke database
    let user = match crate::db::verify_user_login(&state.pool, role, identifier, password).await {
        Ok(u) => u,
        Err(err_msg) => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(LoginResponse {
                    ok: false,
                    role: payload.role,
                    display_name: String::new(),
                    error: Some(err_msg),
                }),
            ));
        }
    };

    let now = Utc::now();
    let exp = now + chrono::Duration::hours(8);
    let exp_unix = exp.timestamp();

    let cookie_name = if role == "admin" { ADMIN_COOKIE } else { FINANCE_COOKIE };
    let opposing_cookie = if role == "admin" { FINANCE_COOKIE } else { ADMIN_COOKIE };

    let sess = AdminSession {
        user_id: user.id,
        display_name: user.display_name.clone(),
        role: role.to_string(),
    };
    let token = crypto::encode_admin_session(&state.config.qr_key, &sess, exp_unix);

    // Dev (HTTP): SameSite=Lax, Secure=false — Prod (HTTPS): SameSite=None, Secure=true
    let is_https = state.config.env != "dev";
    let updated_jar = jar
        .add(make_auth_cookie(cookie_name, token, is_https))
        .add(make_clear_cookie(opposing_cookie, is_https));

    Ok((
        updated_jar,
        Json(LoginResponse {
            ok: true,
            role: payload.role,
            display_name: user.display_name,
            error: None,
        }),
    ))
}

pub async fn admin_auth_middleware(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> Result<axum::response::Response, (StatusCode, Json<serde_json::Value>)> {
    let now_unix = Utc::now().timestamp();
    if let Some(cookie) = jar.get(ADMIN_COOKIE) {
        if let Some(sess) = crypto::decode_admin_session(&state.config.qr_key, cookie.value(), now_unix) {
            if sess.role == "admin" {
                return Ok(next.run(req).await);
            }
        }
    }

    Err((
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({
            "error": "Akses ditolak: Anda harus login sebagai Admin Super IT terlebih dahulu."
        })),
    ))
}

pub async fn finance_auth_middleware(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> Result<axum::response::Response, (StatusCode, Json<serde_json::Value>)> {
    let now_unix = Utc::now().timestamp();
    if let Some(cookie) = jar.get(FINANCE_COOKIE) {
        if let Some(sess) = crypto::decode_admin_session(&state.config.qr_key, cookie.value(), now_unix) {
            if sess.role == "finance" || sess.role == "admin" {
                return Ok(next.run(req).await);
            }
        }
    }
    if let Some(cookie) = jar.get(ADMIN_COOKIE) {
        if let Some(sess) = crypto::decode_admin_session(&state.config.qr_key, cookie.value(), now_unix) {
            if sess.role == "admin" {
                return Ok(next.run(req).await);
            }
        }
    }

    Err((
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({
            "error": "Akses ditolak: Anda harus login sebagai Biro Keuangan atau Admin terlebih dahulu."
        })),
    ))
}

pub async fn handle_auth_logout(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> (CookieJar, Json<serde_json::Value>) {
    let is_https = state.config.env != "dev";
    let updated_jar = jar
        .add(make_clear_cookie(ADMIN_COOKIE, is_https))
        .add(make_clear_cookie(FINANCE_COOKIE, is_https));
    (updated_jar, Json(serde_json::json!({ "ok": true })))
}

// ── Microsoft OAuth 2.0 SSO (Admin & Finance) ────────────────────────

#[derive(Deserialize)]
pub struct MicrosoftLoginQuery {
    pub role: Option<String>,
}

pub async fn handle_microsoft_login(
    State(state): State<Arc<AppState>>,
    Query(query): Query<MicrosoftLoginQuery>,
    req: axum::extract::Request,
) -> Result<axum::response::Redirect, (StatusCode, String)> {
    let tenant_id = state
        .config
        .ms_tenant_id
        .as_deref()
        .unwrap_or("common");
    let client_id = state
        .config
        .ms_client_id
        .as_deref()
        .ok_or((
            StatusCode::BAD_REQUEST,
            "MS_CLIENT_ID belum diatur di file konfigurasi .env".to_string(),
        ))?;

    let role = query.role.as_deref().unwrap_or("finance");

    let host = req
        .headers()
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("localhost:8080");
    let proto = req
        .headers()
        .get("x-forwarded-proto")
        .and_then(|p| p.to_str().ok())
        .unwrap_or(if host.contains("localhost") { "http" } else { "https" });

    let redirect_uri = format!("{}://{}/auth/microsoft/callback", proto, host);

    let mut auth_url = match reqwest::Url::parse(&format!(
        "https://login.microsoftonline.com/{}/oauth2/v2.0/authorize",
        tenant_id
    )) {
        Ok(u) => u,
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    };

    auth_url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_mode", "query")
        .append_pair("scope", "openid profile email User.Read")
        .append_pair("state", role);

    Ok(axum::response::Redirect::temporary(auth_url.as_str()))
}

#[derive(Deserialize)]
pub struct MicrosoftCallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

pub async fn handle_microsoft_callback(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Query(query): Query<MicrosoftCallbackQuery>,
    req: axum::extract::Request,
) -> Result<(CookieJar, axum::response::Redirect), (StatusCode, String)> {
    if let Some(err) = query.error {
        let desc = query.error_description.unwrap_or_default();
        return Err((
            StatusCode::BAD_REQUEST,
            format!("Microsoft Login dibatalkan atau gagal: {} - {}", err, desc),
        ));
    }

    let code = query.code.ok_or((
        StatusCode::BAD_REQUEST,
        "Parameter authorization code dari Microsoft tidak ditemukan".to_string(),
    ))?;
    let role = query.state.as_deref().unwrap_or("finance");

    let tenant_id = state
        .config
        .ms_tenant_id
        .as_deref()
        .unwrap_or("common");
    let client_id = state
        .config
        .ms_client_id
        .as_deref()
        .ok_or((
            StatusCode::BAD_REQUEST,
            "MS_CLIENT_ID belum diatur di file konfigurasi .env".to_string(),
        ))?;
    let client_secret = state
        .config
        .ms_client_secret
        .as_deref()
        .ok_or((
            StatusCode::BAD_REQUEST,
            "MS_CLIENT_SECRET belum diatur di file konfigurasi .env".to_string(),
        ))?;

    let host = req
        .headers()
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("localhost:8080");
    let proto = req
        .headers()
        .get("x-forwarded-proto")
        .and_then(|p| p.to_str().ok())
        .unwrap_or(if host.contains("localhost") { "http" } else { "https" });
    let redirect_uri = format!("{}://{}/auth/microsoft/callback", proto, host);

    // 1. Dapatkan Access Token OAuth 2.0
    let token_url = format!("https://login.microsoftonline.com/{}/oauth2/v2.0/token", tenant_id);
    let client = reqwest::Client::new();
    let token_res = client
        .post(&token_url)
        .form(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
        ])
        .send()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Koneksi token Microsoft gagal: {}", e)))?;

    if !token_res.status().is_success() {
        let err_text = token_res.text().await.unwrap_or_default();
        return Err((
            StatusCode::UNAUTHORIZED,
            format!("Otorisasi Microsoft gagal: {}", err_text),
        ));
    }

    let token_json: serde_json::Value = token_res
        .json()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Parse response token gagal: {}", e)))?;

    let access_token = token_json["access_token"]
        .as_str()
        .ok_or((StatusCode::UNAUTHORIZED, "Access token tidak ditemukan di response Microsoft".to_string()))?;

    // 2. Ambil profil user dari Microsoft Graph /v1.0/me
    let user_info_res = client
        .get("https://graph.microsoft.com/v1.0/me")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Gagal membaca profil Microsoft Graph: {}", e)))?;

    let user_info: serde_json::Value = user_info_res
        .json()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Parse JSON profil gagal: {}", e)))?;

    let display_name = user_info["displayName"]
        .as_str()
        .unwrap_or("Staf UPITRA (Microsoft)")
        .to_string();

    // 3. Cocokkan atau hubungkan ke database
    let db_user: Option<(i64, String)> = sqlx::query_as(
        "SELECT id, display_name FROM users WHERE role::text = $1 AND is_active = true LIMIT 1"
    )
    .bind(role)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    let (user_id, final_display_name) = match db_user {
        Some((id, name)) => (id, name),
        None => (1, display_name),
    };

    // 4. Terbitkan Sesi Cookie
    let now = Utc::now();
    let exp_unix = (now + chrono::Duration::hours(8)).timestamp();
    let cookie_name = if role == "admin" { ADMIN_COOKIE } else { FINANCE_COOKIE };
    let opposing_cookie = if role == "admin" { FINANCE_COOKIE } else { ADMIN_COOKIE };

    let sess = AdminSession {
        user_id,
        display_name: final_display_name,
        role: role.to_string(),
    };
    let token = crypto::encode_admin_session(&state.config.qr_key, &sess, exp_unix);

    // Callback datang dari HTTPS (via Cloudflare Tunnel atau Azure), jadi selalu pakai Secure
    // Tapi kita cek dari header proto juga
    let is_https = proto == "https";
    let updated_jar = jar
        .add(make_auth_cookie(cookie_name, token, is_https))
        .add(make_clear_cookie(opposing_cookie, is_https));

    let target_page = if role == "admin" { "/admin" } else { "/finance" };
    Ok((updated_jar, axum::response::Redirect::temporary(target_page)))
}
