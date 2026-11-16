mod config;
mod crypto;
mod db;
mod models;
mod routes;

use axum::routing::{get, post, put};
use axum::Router;
use sqlx::PgPool;
use std::path::Path;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

pub struct AppState {
    pub pool: PgPool,
    pub config: config::Config,
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
    tracing::info!("Menghubungkan ke database PostgreSQL: {}", cfg.database_url);

    let pool = db::create_pool(&cfg.database_url).await.map_err(|e| {
        format!("Gagal menghubungkan ke database PostgreSQL: {}", e)
    })?;

    tracing::info!("Koneksi database PostgreSQL berhasil.");

    let state = Arc::new(AppState {
        pool,
        config: cfg.clone(),
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Cari letak frontend/dist
    let dist_path = if Path::new("frontend/dist/index.html").exists() {
        "frontend/dist"
    } else if Path::new("../frontend/dist/index.html").exists() {
        "../frontend/dist"
    } else {
        "frontend/dist"
    };

    let index_file = format!("{}/index.html", dist_path);

    let app = Router::new()
        // Health check
        .route("/healthz", get(|| async { "ok" }))
        // Auth API
        .route("/api/auth/me", get(routes::auth::handle_auth_me))
        .route("/api/auth/login", post(routes::auth::handle_auth_login))
        .route("/api/auth/logout", post(routes::auth::handle_auth_logout))
        // Scan / Kasir API
        .route("/api/scan/me", get(routes::scan::handle_scan_me))
        .route("/api/scan/pair", post(routes::scan::handle_scan_pair))
        .route("/api/scan/tenants", get(routes::scan::handle_scan_tenants))
        .route("/api/scan", post(routes::scan::handle_scan_qr))
        .route("/api/scan/code", post(routes::scan::handle_scan_code))
        .route("/api/today", get(routes::scan::handle_today))
        .route("/api/menu", get(routes::scan::handle_menu))
        // Admin IT API
        .route("/api/admin/summary", get(routes::admin::handle_admin_summary))
        .route(
            "/api/admin/staff",
            get(routes::admin::handle_admin_staff_list).post(routes::admin::handle_admin_staff_create),
        )
        .route(
            "/api/admin/staff/:id",
            get(routes::admin::handle_admin_staff_get).put(routes::admin::handle_admin_staff_update),
        )
        .route("/api/admin/staff/:id/toggle", post(routes::admin::handle_admin_staff_toggle))
        .route("/api/admin/staff/:id", axum::routing::delete(routes::admin::handle_admin_staff_delete))
        .route(
            "/api/admin/tenants",
            get(routes::admin::handle_admin_tenants_list).post(routes::admin::handle_admin_tenant_create),
        )
        .route(
            "/api/admin/tenants/:id",
            put(routes::admin::handle_admin_tenant_update).delete(routes::admin::handle_admin_tenant_delete),
        )
        .route("/api/admin/tenants/:id/code", post(routes::admin::handle_admin_tenant_issue_code))
        .route("/api/admin/tenants/:id/revoke", post(routes::admin::handle_admin_tenant_revoke))
        .route("/api/admin/transactions", get(routes::admin::handle_transactions))
        // Finance API
        .route("/api/finance/summary", get(routes::finance::handle_finance_summary))
        .route("/api/finance/payouts", get(routes::finance::handle_finance_payouts))
        .route("/api/finance/transactions", get(routes::admin::handle_transactions))
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
