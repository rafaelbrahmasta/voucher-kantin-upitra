use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::crypto::{self, TenantSession};
use crate::models::{OrderLineIn, ScanResult, TodayData};
use crate::AppState;

const TENANT_COOKIE: &str = "tenant_sess";

#[derive(Serialize)]
pub struct ScanMeResponse {
    pub authenticated: bool,
    pub role: String,
    #[serde(rename = "tenantId", skip_serializing_if = "Option::is_none")]
    pub tenant_id: Option<i64>,
    #[serde(rename = "displayName", skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stall: Option<String>,
    #[serde(rename = "stallLocation", skip_serializing_if = "Option::is_none")]
    pub stall_location: Option<String>,
}

pub async fn handle_scan_me(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> Json<ScanMeResponse> {
    let now_unix = Utc::now().timestamp();

    if let Some(cookie) = jar.get(TENANT_COOKIE) {
        if let Some(sess) = crypto::decode_tenant_session(&state.config.qr_key, cookie.value(), now_unix) {
            if let Ok(true) = crate::db::is_session_valid(&state.pool, sess.tenant_id, sess.version).await {
                if let Ok(Some(tenant)) = crate::db::get_tenant(&state.pool, sess.tenant_id).await {
                    return Json(ScanMeResponse {
                        authenticated: true,
                        role: "tenant".to_string(),
                        tenant_id: Some(sess.tenant_id),
                        display_name: Some(tenant.name.clone()),
                        stall: Some(tenant.name),
                        stall_location: tenant.stall_location,
                    });
                }
            }
        }
    }

    Json(ScanMeResponse {
        authenticated: false,
        role: String::new(),
        tenant_id: None,
        display_name: None,
        stall: None,
        stall_location: None,
    })
}

#[derive(Deserialize)]
pub struct PairRequest {
    pub code: Option<String>,
}

#[derive(Serialize)]
pub struct PairResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tenant_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stall: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub async fn handle_scan_pair(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    jar: CookieJar,
    Json(payload): Json<PairRequest>,
) -> Result<(CookieJar, Json<PairResponse>), (StatusCode, Json<PairResponse>)> {
    let client_ip = get_client_ip(&headers);
    if !state.rate_limiter_pair.check(&client_ip).await {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(PairResponse {
                ok: false,
                tenant_id: None,
                stall: None,
                error: Some("Terlalu banyak percobaan kode pairing salah. Silakan tunggu 1 menit.".to_string()),
            }),
        ));
    }

    let now_unix = Utc::now().timestamp();
    let exp_unix = now_unix + (30 * 24 * 3600); // 30 hari

    // Pair HANYA via kode pairing 10 karakter yang sah
    let raw_code = payload.code.unwrap_or_default().trim().to_string();
    if raw_code.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(PairResponse {
                ok: false,
                tenant_id: None,
                stall: None,
                error: Some("Kode pairing wajib diisi".to_string()),
            }),
        ));
    }

    let redeemed = crate::db::redeem_pairing_code(&state.pool, &raw_code).await;
    match redeemed {
        Ok(Some((t_id, ver))) => {
            let sess = TenantSession { tenant_id: t_id, version: ver };
            let token = crypto::encode_tenant_session(&state.config.qr_key, &sess, exp_unix);

            let mut cookie_builder = Cookie::build((TENANT_COOKIE, token))
                .path("/")
                .http_only(true)
                .same_site(SameSite::Lax);

            if state.config.env != "dev" {
                cookie_builder = cookie_builder.secure(true);
            }

            let tenant_name = match crate::db::get_tenant(&state.pool, t_id).await {
                Ok(Some(t)) => t.name,
                _ => "Stan Kantin".to_string(),
            };

            Ok((
                jar.add(cookie_builder.build()),
                Json(PairResponse {
                    ok: true,
                    tenant_id: Some(t_id),
                    stall: Some(tenant_name),
                    error: None,
                }),
            ))
        }
        _ => Err((
            StatusCode::BAD_REQUEST,
            Json(PairResponse {
                ok: false,
                tenant_id: None,
                stall: None,
                error: Some("Kode pairing tidak valid atau sudah kedaluwarsa. Minta kode baru dari Admin IT.".to_string()),
            }),
        )),
    }
}

#[derive(Serialize)]
pub struct TenantOption {
    pub id: i64,
    pub name: String,
    pub stall: String,
}

pub async fn handle_scan_tenants(
    State(state): State<Arc<AppState>>,
) -> Json<serde_json::Value> {
    let tenants = crate::db::list_tenants(&state.pool).await.unwrap_or_default();
    let options: Vec<TenantOption> = tenants
        .into_iter()
        .filter(|t| t.is_active)
        .map(|t| TenantOption {
            id: t.id,
            name: t.name,
            stall: t.stall_location.unwrap_or_default(),
        })
        .collect();

    Json(serde_json::json!({ "tenants": options }))
}

fn get_client_ip(headers: &axum::http::HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(|s| s.trim().to_string())
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.trim().to_string())
        })
        .unwrap_or_else(|| "127.0.0.1".to_string())
}

// ── Scan QR Endpoint ──────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ScanPayloadRequest {
    pub qr: String,
    pub items: Option<Vec<OrderLineIn>>,
}

pub async fn handle_scan_qr(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(payload): Json<ScanPayloadRequest>,
) -> Result<Json<ScanResult>, (StatusCode, Json<ScanResult>)> {
    let now_unix = Utc::now().timestamp();
    let tenant_id = extract_tenant_id(&state, &jar, now_unix).await;
    if tenant_id <= 0 {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ScanResult {
                result: "invalid".to_string(),
                staff: None,
                unit: None,
                amount: None,
                at: None,
                used_at: None,
                tenant: None,
                message: Some("Kasir belum terhubung ke stan kantin. Silakan hubungkan lewat kode pairing terlebih dahulu.".to_string()),
                order: None,
            }),
        ));
    }

    let tok = match crypto::parse_qr_payload(&state.config.qr_key, &payload.qr) {
        Ok(t) => t,
        Err(msg) => {
            return Ok(Json(ScanResult {
                result: "invalid".to_string(),
                staff: None,
                unit: None,
                amount: None,
                at: None,
                used_at: None,
                tenant: None,
                message: Some(msg.to_string()),
                order: None,
            }));
        }
    };

    let token_hash = crypto::hash_token(&tok);
    let user_id = crate::db::get_tenant_user_id(&state.pool, tenant_id, state.config.dev_user_id).await;

    let res = crate::db::scan_by_token_hash(&state.pool, &token_hash, tenant_id, user_id, payload.items.as_deref()).await;
    match res {
        Ok(r) => Ok(Json(r)),
        Err(err) => {
            tracing::error!("Scan token error: {:?}", err);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ScanResult {
                    result: "invalid".to_string(),
                    staff: None,
                    unit: None,
                    amount: None,
                    at: None,
                    used_at: None,
                    tenant: None,
                    message: Some("Gagal memproses voucher di database".to_string()),
                    order: None,
                }),
            ))
        }
    }
}

// ── Scan Short Code Endpoint ──────────────────────────────────────

#[derive(Deserialize)]
pub struct ScanCodeRequest {
    pub code: String,
    pub items: Option<Vec<OrderLineIn>>,
}

pub async fn handle_scan_code(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    jar: CookieJar,
    Json(payload): Json<ScanCodeRequest>,
) -> Result<Json<ScanResult>, (StatusCode, Json<ScanResult>)> {
    let client_ip = get_client_ip(&headers);
    if !state.rate_limiter_code.check(&client_ip).await {
        return Ok(Json(ScanResult {
            result: "invalid".to_string(),
            staff: None,
            unit: None,
            amount: None,
            at: None,
            used_at: None,
            tenant: None,
            message: Some("Terlalu banyak percobaan memasukkan kode salah. Silakan tunggu 1 menit.".to_string()),
            order: None,
        }));
    }

    let now_unix = Utc::now().timestamp();
    let tenant_id = extract_tenant_id(&state, &jar, now_unix).await;
    if tenant_id <= 0 {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ScanResult {
                result: "invalid".to_string(),
                staff: None,
                unit: None,
                amount: None,
                at: None,
                used_at: None,
                tenant: None,
                message: Some("Kasir belum terhubung ke stan kantin. Silakan hubungkan lewat kode pairing terlebih dahulu.".to_string()),
                order: None,
            }),
        ));
    }

    let normalized = match crypto::normalize_short_code(&payload.code) {
        Some(c) => c,
        None => {
            return Ok(Json(ScanResult {
                result: "invalid".to_string(),
                staff: None,
                unit: None,
                amount: None,
                at: None,
                used_at: None,
                tenant: None,
                message: Some("Format kode voucher tidak valid".to_string()),
                order: None,
            }));
        }
    };

    let today = Utc::now().date_naive();
    let date_str = today.format("%Y-%m-%d").to_string();
    let code_hash = crypto::short_code_hash(&state.config.short_key, &date_str, &normalized);
    let user_id = crate::db::get_tenant_user_id(&state.pool, tenant_id, state.config.dev_user_id).await;

    let res = crate::db::scan_by_short_code(&state.pool, &code_hash, today, tenant_id, user_id, payload.items.as_deref()).await;
    match res {
        Ok(r) => Ok(Json(r)),
        Err(err) => {
            tracing::error!("Scan short code error: {:?}", err);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ScanResult {
                    result: "invalid".to_string(),
                    staff: None,
                    unit: None,
                    amount: None,
                    at: None,
                    used_at: None,
                    tenant: None,
                    message: Some("Gagal memproses voucher di database".to_string()),
                    order: None,
                }),
            ))
        }
    }
}

// ── Ringkasan Hari Ini & Menu ─────────────────────────────────────

pub async fn handle_today(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> Json<TodayData> {
    let now_unix = Utc::now().timestamp();
    let tenant_id = extract_tenant_id(&state, &jar, now_unix).await;
    if tenant_id <= 0 {
        return Json(TodayData { count: 0, total: 0 });
    }

    let stats = crate::db::get_tenant_today_stats(&state.pool, tenant_id).await.unwrap_or(TodayData { count: 0, total: 0 });
    Json(stats)
}

pub async fn handle_menu(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> Json<serde_json::Value> {
    let now_unix = Utc::now().timestamp();
    let tenant_id = extract_tenant_id(&state, &jar, now_unix).await;
    if tenant_id <= 0 {
        return Json(serde_json::json!({ "items": [] }));
    }

    let items = crate::db::list_menu_items(&state.pool, tenant_id, true).await.unwrap_or_default();
    Json(serde_json::json!({ "items": items }))
}

async fn extract_tenant_id(state: &AppState, jar: &CookieJar, now_unix: i64) -> i64 {
    if let Some(cookie) = jar.get(TENANT_COOKIE) {
        if let Some(sess) = crypto::decode_tenant_session(&state.config.qr_key, cookie.value(), now_unix) {
            if let Ok(true) = crate::db::is_session_valid(&state.pool, sess.tenant_id, sess.version).await {
                return sess.tenant_id;
            }
        }
    }
    0
}
