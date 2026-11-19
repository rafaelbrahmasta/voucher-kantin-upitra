use axum::routing::{get, post, put};
use axum::{middleware, Router};
use std::path::Path;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use voucher_kantin_backend::config;
use voucher_kantin_backend::db;
use voucher_kantin_backend::rate_limit::RateLimiter;
use voucher_kantin_backend::routes;
use voucher_kantin_backend::AppState;

fn mask_db_url(url: &str) -> String {
    if let Some(start) = url.find("://") {
        let rest = &url[start + 3..];
        if let Some(at) = rest.find('@') {
            let auth = &rest[..at];
            if let Some(colon) = auth.find(':') {
                let user = &auth[..colon];
                return format!("{}://{}:***@{}", &url[..start], user, &rest[at + 1..]);
            }
        }
    }
    url.to_string()
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,voucher_kantin_backend=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let cfg = config::Config::from_env().map_err(|e| format!("Konfigurasi gagal: {}", e))?;
    tracing::info!("Menghubungkan ke database PostgreSQL: {}", mask_db_url(&cfg.database_url));

    let pool = db::create_pool(&cfg.database_url).await.map_err(|e| {
        format!("Gagal menghubungkan ke database PostgreSQL: {}", e)
    })?;

    tracing::info!("Koneksi database PostgreSQL & verifikasi skema migrasi berhasil.");

    // Background job: periksa dan ubah status voucher yang lewat jam berlaku (16:00 WIB) menjadi expired setiap 60 detik
    let expire_pool = pool.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            interval.tick().await;
            if let Ok(count) = db::auto_expire_vouchers(&expire_pool).await {
                if count > 0 {
                    tracing::info!("Auto-expired {} voucher(s) melewati jam berlaku", count);
                }
            }
        }
    });

    let state = Arc::new(AppState {
        pool,
        config: cfg.clone(),
        rate_limiter_code: RateLimiter::new(8, 60), // Maksimal 8 percobaan salah per menit
        rate_limiter_pair: RateLimiter::new(8, 60), // Maksimal 8 percobaan pairing salah per menit
    });

    // CORS: Whitelist eksplisit — TIDAK mirror_request + allow_credentials
    // Hanya origin yang terdaftar yang boleh kirim cookie ke API
    let mut allowed_origins: Vec<axum::http::HeaderValue> = vec![
        "http://localhost:3000".parse().unwrap(),
        "http://localhost:8080".parse().unwrap(),
        "http://127.0.0.1:8080".parse().unwrap(),
        "http://127.0.0.1:3000".parse().unwrap(),
    ];

    // Tambahkan ALLOWED_ORIGINS dari .env jika ada (pisahkan dengan koma)
    if let Some(extra) = voucher_kantin_backend::config::get_allowed_origins() {
        for origin in extra.split(',') {
            let o = origin.trim();
            if !o.is_empty() {
                if let Ok(hv) = o.parse::<axum::http::HeaderValue>() {
                    allowed_origins.push(hv);
                }
            }
        }
    }

    let cors = CorsLayer::new()
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PUT,
            axum::http::Method::DELETE,
            axum::http::Method::OPTIONS,
        ])
        .allow_headers([
            axum::http::header::AUTHORIZATION,
            axum::http::header::CONTENT_TYPE,
            axum::http::header::ACCEPT,
        ])
        .allow_credentials(true)
        .allow_origin(tower_http::cors::AllowOrigin::list(allowed_origins));

    // Cari letak frontend/dist
    let dist_path = if Path::new("frontend/dist/index.html").exists() {
        "frontend/dist"
    } else if Path::new("../frontend/dist/index.html").exists() {
        "../frontend/dist"
    } else {
        "frontend/dist"
    };

    let index_file = format!("{}/index.html", dist_path);

    // ── Rute Terproteksi: Admin Super IT ──────────────────────────────
    let admin_routes = Router::new()
        .route("/summary", get(routes::admin::handle_admin_summary))
        .route(
            "/staff",
            get(routes::admin::handle_admin_staff_list).post(routes::admin::handle_admin_staff_create),
        )
        .route(
            "/staff/:id",
            get(routes::admin::handle_admin_staff_get).put(routes::admin::handle_admin_staff_update).delete(routes::admin::handle_admin_staff_delete),
        )
        .route("/staff/:id/toggle", post(routes::admin::handle_admin_staff_toggle))
        .route(
            "/tenants",
            get(routes::admin::handle_admin_tenants_list).post(routes::admin::handle_admin_tenant_create),
        )
        .route(
            "/tenants/:id",
            put(routes::admin::handle_admin_tenant_update).delete(routes::admin::handle_admin_tenant_delete),
        )
        .route("/tenants/:id/code", post(routes::admin::handle_admin_tenant_issue_code))
        .route("/tenants/:id/revoke", post(routes::admin::handle_admin_tenant_revoke))
        .route("/tenants/:id/menu", get(routes::admin::handle_admin_tenant_menu_list).post(routes::admin::handle_admin_tenant_menu_create))
        .route("/tenants/:id/menu/:menu_id", put(routes::admin::handle_admin_tenant_menu_update).delete(routes::admin::handle_admin_tenant_menu_delete))
        .route("/transactions", get(routes::admin::handle_transactions))
        .route("/issue-vouchers", post(routes::admin::handle_admin_issue_vouchers))
        .route_layer(middleware::from_fn_with_state(state.clone(), routes::auth::admin_auth_middleware));

    // ── Rute Terproteksi: Biro Keuangan ───────────────────────────────
    let finance_routes = Router::new()
        .route("/summary", get(routes::finance::handle_finance_summary))
        .route("/payouts", get(routes::finance::handle_finance_payouts))
        .route("/payouts/claim", post(routes::finance::handle_finance_payout_claim))
        .route("/transactions", get(routes::admin::handle_transactions))
        .route("/export", get(routes::finance::handle_finance_export))
        .route_layer(middleware::from_fn_with_state(state.clone(), routes::auth::finance_auth_middleware));

    let app = Router::new()
        // Health check
        .route("/healthz", get(|| async { "ok" }))
        // Auth API publik
        .route("/api/auth/me", get(routes::auth::handle_auth_me))
        .route("/api/auth/login", post(routes::auth::handle_auth_login))
        .route("/api/auth/logout", post(routes::auth::handle_auth_logout))
        // Microsoft OAuth 2.0 SSO
        .route("/auth/microsoft", get(routes::auth::handle_microsoft_login))
        .route("/auth/microsoft/callback", get(routes::auth::handle_microsoft_callback))
        .route("/api/auth/microsoft", get(routes::auth::handle_microsoft_login))
        .route("/api/auth/microsoft/callback", get(routes::auth::handle_microsoft_callback))
        // Scan / Kasir API
        .route("/api/scan/me", get(routes::scan::handle_scan_me))
        .route("/api/scan/pair", post(routes::scan::handle_scan_pair))
        .route("/api/scan/tenants", get(routes::scan::handle_scan_tenants))
        .route("/api/scan", post(routes::scan::handle_scan_qr))
        .route("/api/scan/code", post(routes::scan::handle_scan_code))
        .route("/api/today", get(routes::scan::handle_today))
        .route("/api/menu", get(routes::scan::handle_menu))
        // Logout kasir — hapus cookie tenant_sess
        .route("/keluar", post(routes::scan::handle_scan_logout))
        .route("/api/scan/logout", post(routes::scan::handle_scan_logout))
        // Pasang router admin dan finance yang terproteksi middleware
        .nest("/api/admin", admin_routes)
        .nest("/api/finance", finance_routes)
        // Static assets dari React SPA
        .nest_service("/assets", ServeDir::new(format!("{}/assets", dist_path)))
        // React SPA single-page routing fallback untuk semua rute UI
        .fallback_service(
            ServeDir::new(dist_path).fallback(ServeFile::new(index_file)),
        )
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let bind_addr = if cfg.addr.starts_with(':') {
        format!("0.0.0.0{}", cfg.addr)
    } else {
        cfg.addr.clone()
    };

    tracing::info!("Server Rust berjalan di http://{} (mode: {})", bind_addr, cfg.env);

    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
