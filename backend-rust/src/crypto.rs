use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64;
use base64::Engine;
use hmac::{Hmac, Mac};
use rand::RngCore;
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

const QR_PREFIX: &str = "UPV1";
const TOKEN_BYTES: usize = 16;
const SIG_BYTES: usize = 16;
const CROCKFORD: &str = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LEN: usize = 8;
const PAIRING_ALPHABET: &str = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const PAIRING_LEN: usize = 10;

// ── QR Token Kriptografi ──────────────────────────────────────────

pub fn generate_token() -> String {
    let mut bytes = [0u8; TOKEN_BYTES];
    rand::thread_rng().fill_bytes(&mut bytes);
    B64.encode(bytes)
}

pub fn sign_token(key: &[u8], tok: &str) -> [u8; SIG_BYTES] {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC can take any key size");
    mac.update(tok.as_bytes());
    let full = mac.finalize().into_bytes();
    let mut out = [0u8; SIG_BYTES];
    out.copy_from_slice(&full[..SIG_BYTES]);
    out
}

pub fn create_qr_payload(key: &[u8], tok: &str) -> String {
    let sig = sign_token(key, tok);
    format!("{}.{}.{}", QR_PREFIX, tok, B64.encode(sig))
}

pub fn parse_qr_payload(key: &[u8], payload: &str) -> Result<String, &'static str> {
    let parts: Vec<&str> = payload.trim().split('.').collect();
    if parts.len() != 3 || parts[0] != QR_PREFIX {
        return Err("Prefix atau format QR tidak valid");
    }
    let tok = parts[1];
    if tok.len() != 22 {
        return Err("Panjang token tidak valid");
    }
    let got_sig = B64.decode(parts[2]).map_err(|_| "Decode signature gagal")?;
    let expected_sig = sign_token(key, tok);
    if got_sig.len() != SIG_BYTES || got_sig != expected_sig {
        return Err("Tanda tangan QR tidak cocok atau rusak");
    }
    Ok(tok.to_string())
}

pub fn hash_token(tok: &str) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(tok.as_bytes());
    hasher.finalize().to_vec()
}

// ── Kode Pendek Cadangan (8 Karakter) ─────────────────────────────

pub fn generate_short_code() -> String {
    let mut bytes = [0u8; CODE_LEN];
    rand::thread_rng().fill_bytes(&mut bytes);
    let crock = CROCKFORD.as_bytes();
    let chars: String = bytes
        .iter()
        .map(|&b| crock[(b & 31) as usize] as char)
        .collect();
    format!("{}-{}", &chars[..4], &chars[4..])
}

pub fn normalize_short_code(input: &str) -> Option<String> {
    let mut out = String::with_capacity(CODE_LEN);
    for ch in input.to_uppercase().chars() {
        match ch {
            '-' | ' ' => continue,
            'I' | 'L' => out.push('1'),
            'O' => out.push('0'),
            c if CROCKFORD.contains(c) => out.push(c),
            _ => return None,
        }
    }
    if out.len() == CODE_LEN {
        Some(out)
    } else {
        None
    }
}

pub fn short_code_hash(key: &[u8], date: &str, code: &str) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC key");
    let payload = format!("{}|{}", date, code);
    mac.update(payload.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

// ── Kode Pairing Stan Kasir (10 Karakter) ─────────────────────────

pub fn generate_pairing_code() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let chars = PAIRING_ALPHABET.as_bytes();
    let mut res = String::with_capacity(PAIRING_LEN);
    for _ in 0..PAIRING_LEN {
        let idx = rng.gen_range(0..chars.len());
        res.push(chars[idx] as char);
    }
    res
}

pub fn normalize_pairing_code(input: &str) -> Option<String> {
    let clean: String = input
        .to_uppercase()
        .chars()
        .filter(|c| *c != '-' && *c != ' ')
        .collect();
    if clean.len() != PAIRING_LEN {
        return None;
    }
    if clean.chars().all(|c| PAIRING_ALPHABET.contains(c)) {
        Some(clean)
    } else {
        None
    }
}

pub fn format_pairing_code(code: &str) -> String {
    if code.len() == PAIRING_LEN {
        format!("{}-{}", &code[..5], &code[5..])
    } else {
        code.to_string()
    }
}

pub fn hash_pairing_code(code: &str) -> Vec<u8> {
    let mut hasher = Sha256::new();
    let payload = format!("upitra-tenant-code-v1:{}", code);
    hasher.update(payload.as_bytes());
    hasher.finalize().to_vec()
}

// ── Cookie Sesi HMAC ──────────────────────────────────────────────

fn sign_cookie_payload(secret_key: &[u8], payload: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret_key).expect("HMAC");
    mac.update(payload.as_bytes());
    let sig = mac.finalize().into_bytes();
    format!("{}.{}", B64.encode(payload), B64.encode(sig))
}

fn verify_cookie_payload(secret_key: &[u8], cookie_val: &str) -> Option<String> {
    let dot = cookie_val.find('.')?;
    let payload_b64 = &cookie_val[..dot];
    let payload_bytes = B64.decode(payload_b64).ok()?;
    let payload = String::from_utf8(payload_bytes).ok()?;

    let expected = sign_cookie_payload(secret_key, &payload);
    if expected == cookie_val {
        Some(payload)
    } else {
        None
    }
}

// Admin / Finance Session: "user_id|display_name|role|exp_unix"
pub fn admin_session_key(qr_key: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(qr_key).expect("HMAC");
    mac.update(b"admin-session-v1");
    mac.finalize().into_bytes().to_vec()
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct AdminSession {
    pub user_id: i64,
    pub display_name: String,
    pub role: String,
}

pub fn encode_admin_session(key: &[u8], sess: &AdminSession, exp_unix: i64) -> String {
    let secret = admin_session_key(key);
    let payload = format!("{}|{}|{}|{}", sess.user_id, sess.display_name, sess.role, exp_unix);
    sign_cookie_payload(&secret, &payload)
}

pub fn decode_admin_session(key: &[u8], cookie_val: &str, now_unix: i64) -> Option<AdminSession> {
    let secret = admin_session_key(key);
    let payload = verify_cookie_payload(&secret, cookie_val)?;
    let parts: Vec<&str> = payload.split('|').collect();
    if parts.len() != 4 {
        return None;
    }
    let user_id: i64 = parts[0].parse().ok()?;
    let display_name = parts[1].to_string();
    let role = parts[2].to_string();
    let exp_unix: i64 = parts[3].parse().ok()?;

    if now_unix > exp_unix {
        return None;
    }

    Some(AdminSession {
        user_id,
        display_name,
        role,
    })
}

// Tenant Session: "tenant_id:version:exp_unix"
pub fn tenant_session_key(qr_key: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(qr_key).expect("HMAC");
    mac.update(b"tenant-session-v1");
    mac.finalize().into_bytes().to_vec()
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct TenantSession {
    pub tenant_id: i64,
    pub version: i32,
}

pub fn encode_tenant_session(key: &[u8], sess: &TenantSession, exp_unix: i64) -> String {
    let secret = tenant_session_key(key);
    let payload = format!("{}:{}:{}", sess.tenant_id, sess.version, exp_unix);
    sign_cookie_payload(&secret, &payload)
}

pub fn decode_tenant_session(key: &[u8], cookie_val: &str, now_unix: i64) -> Option<TenantSession> {
    let secret = tenant_session_key(key);
    let payload = verify_cookie_payload(&secret, cookie_val)?;
    let parts: Vec<&str> = payload.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let tenant_id: i64 = parts[0].parse().ok()?;
    let version: i32 = parts[1].parse().ok()?;
    let exp_unix: i64 = parts[2].parse().ok()?;

    if now_unix > exp_unix {
        return None;
    }

    Some(TenantSession { tenant_id, version })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qr_payload_lifecycle() {
        let key = b"dev-only-qr-key-change-me-0123456789abcdef";
        let token = generate_token();
        assert_eq!(token.len(), 22);

        let qr_payload = create_qr_payload(key, &token);
        assert!(qr_payload.starts_with("UPV1."));

        let parsed = parse_qr_payload(key, &qr_payload).expect("Valid QR payload must parse");
        assert_eq!(parsed, token);

        // Invalid signature test
        let wrong_key = b"wrong-key-change-me-0123456789abcdef";
        assert!(parse_qr_payload(wrong_key, &qr_payload).is_err());
    }

    #[test]
    fn test_short_code_normalization() {
        let raw = "k7m4-qxp8";
        let normalized = normalize_short_code(raw).expect("Must normalize");
        assert_eq!(normalized, "K7M4QXP8");

        // I, L -> 1, O -> 0
        let ambiguous = "il-oo";
        // length is 4, not 8
        assert!(normalize_short_code(ambiguous).is_none());

        let ambiguous8 = "ilo1-2345";
        let norm8 = normalize_short_code(ambiguous8).expect("Must normalize");
        assert_eq!(norm8, "11012345");
    }

    #[test]
    fn test_pairing_code_normalization_and_format() {
        let code = generate_pairing_code();
        assert_eq!(code.len(), 10);

        let formatted = format_pairing_code(&code);
        assert_eq!(formatted.len(), 11);
        assert_eq!(&formatted[5..6], "-");

        let normalized = normalize_pairing_code(&formatted).expect("Must normalize");
        assert_eq!(normalized, code);
    }

    #[test]
    fn test_admin_session_lifecycle() {
        let key = b"dev-only-qr-key-change-me-0123456789abcdef";
        let now = 1000000;
        let exp = now + 3600;

        let sess = AdminSession {
            user_id: 3,
            display_name: "Admin Super IT".to_string(),
            role: "admin".to_string(),
        };

        let encoded = encode_admin_session(key, &sess, exp);
        let decoded = decode_admin_session(key, &encoded, now).expect("Must decode");
        assert_eq!(decoded.user_id, 3);
        assert_eq!(decoded.role, "admin");

        // Expired test
        let expired = decode_admin_session(key, &encoded, exp + 10);
        assert!(expired.is_none());
    }

    #[test]
    fn test_tenant_session_lifecycle() {
        let key = b"dev-only-qr-key-change-me-0123456789abcdef";
        let now = 1000000;
        let exp = now + 3600;

        let sess = TenantSession {
            tenant_id: 1,
            version: 2,
        };

        let encoded = encode_tenant_session(key, &sess, exp);
        let decoded = decode_tenant_session(key, &encoded, now).expect("Must decode");
        assert_eq!(decoded.tenant_id, 1);
        assert_eq!(decoded.version, 2);
    }

    #[test]
    fn test_argon2_password_hashing() {
        let raw = "RahasiaKuat#2026";
        let hash = hash_password(raw).expect("Hash must succeed");
        assert!(hash.starts_with("$argon2"));
        assert!(verify_password(raw, &hash));
        assert!(!verify_password("PasswordSalah", &hash));
        assert!(!verify_password(raw, "plain:RahasiaKuat#2026"));
    }
}

// ── Password Hashing (Argon2id) ───────────────────────────────────

pub fn hash_password(password: &str) -> Result<String, String> {
    use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
    use argon2::Argon2;
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| format!("Argon2 hash error: {}", e))
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    use argon2::password_hash::{PasswordHash, PasswordVerifier};
    use argon2::Argon2;
    if !hash.starts_with("$argon2") {
        return false;
    }
    match PasswordHash::new(hash) {
        Ok(parsed) => Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok(),
        Err(_) => false,
    }
}

