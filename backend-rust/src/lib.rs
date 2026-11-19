pub mod config;
pub mod crypto;
pub mod db;
pub mod issuer;
pub mod mailer;
pub mod models;
pub mod rate_limit;
pub mod routes;

use sqlx::PgPool;

pub struct AppState {
    pub pool: PgPool,
    pub config: config::Config,
    pub rate_limiter_code: rate_limit::RateLimiter,
    pub rate_limiter_pair: rate_limit::RateLimiter,
    pub rate_limiter_login: rate_limit::RateLimiter,
}
