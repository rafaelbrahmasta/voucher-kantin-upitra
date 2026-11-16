use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use time::Duration;

use crate::crypto::{self, AdminSession};
use crate::AppState;

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

    let sess = AdminSession {
        user_id: user.id,
        display_name: user.display_name.clone(),
        role: role.to_string(),
    };
    let token = crypto::encode_admin_session(&state.config.qr_key, &sess, exp_unix);

    let mut cookie_builder = Cookie::build((cookie_name, token))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax);

    if state.config.env != "dev" {
        cookie_builder = cookie_builder.secure(true);
    }

    let updated_jar = jar.add(cookie_builder.build());

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

pub async fn handle_auth_logout(jar: CookieJar) -> (CookieJar, Json<serde_json::Value>) {
    let mut cleared_jar = jar;

    let admin_c = Cookie::build((ADMIN_COOKIE, ""))
        .path("/")
        .http_only(true)
        .max_age(Duration::seconds(-1))
        .build();

    let finance_c = Cookie::build((FINANCE_COOKIE, ""))
        .path("/")
        .http_only(true)
        .max_age(Duration::seconds(-1))
        .build();

    cleared_jar = cleared_jar.add(admin_c).add(finance_c);

    (cleared_jar, Json(serde_json::json!({ "ok": true })))
}
