use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ── Master Dosen & Staf ───────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Staff {
    pub id: i64,
    pub nip: Option<String>,
    pub name: String,
    pub email: String,
    pub unit: String,
    pub is_active: bool,
    pub created_at: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct StaffInput {
    pub nip: Option<String>,
    pub name: String,
    pub email: String,
    pub unit: String,
    #[serde(default = "default_true")]
    pub is_active: bool,
}

fn default_true() -> bool {
    true
}

// ── Master Stan Kantin (Tenant) ───────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Tenant {
    pub id: i64,
    pub name: String,
    #[serde(rename = "stall")]
    pub stall_location: Option<String>,
    #[serde(rename = "owner")]
    pub owner_name: String,
    pub bank_name: Option<String>,
    pub bank_account: Option<String>,
    #[serde(rename = "active")]
    pub is_active: bool,
    #[serde(default)]
    pub has_device: bool,
    pub menu_count: Option<i64>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TenantInput {
    pub name: String,
    #[serde(default)]
    pub stall: Option<String>,
    pub owner: String,
    #[serde(default)]
    pub bank_name: Option<String>,
    #[serde(default)]
    pub bank_account: Option<String>,
    #[serde(default = "default_true")]
    pub active: bool,
}

// ── Pengguna Sistem (Users) ───────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: i64,
    pub role: String,
    pub username: Option<String>,
    pub password_hash: Option<String>,
    pub display_name: String,
    pub is_active: bool,
}

// ── Menu Items ────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct MenuItem {
    pub id: i64,
    pub tenant_id: i64,
    pub name: String,
    pub price: i32,
    pub is_available: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct MenuItemInput {
    pub name: String,
    pub price: i32,
    #[serde(default = "default_true")]
    pub available: bool,
}

// ── Scanner & Hasil Scan ──────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrderLineIn {
    pub id: i64,
    pub qty: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrderLineOut {
    pub name: String,
    pub qty: i32,
    pub price: i32,
    pub subtotal: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrderOut {
    pub items: Vec<OrderLineOut>,
    pub total: i32,
    pub pay: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScanResult {
    pub result: String, // "ok" | "invalid" | "used" | "expired" | "void"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub staff: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub at: Option<String>,
    #[serde(rename = "usedAt", skip_serializing_if = "Option::is_none")]
    pub used_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tenant: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<OrderOut>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TodayData {
    pub count: i64,
    pub total: i64,
}

// ── Transaksi ─────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Transaction {
    #[serde(rename = "At")]
    pub at: String,
    #[serde(rename = "Staff")]
    pub staff: String,
    #[serde(rename = "Unit")]
    pub unit: String,
    #[serde(rename = "Tenant")]
    pub tenant: String,
    #[serde(rename = "Amount")]
    pub amount: i32,
    #[serde(rename = "Voided")]
    pub voided: bool,
    #[serde(rename = "Items")]
    pub items: String,
}
