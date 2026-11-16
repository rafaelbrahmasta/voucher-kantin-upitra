use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct RateLimiter {
    attempts: Arc<Mutex<HashMap<String, Vec<Instant>>>>,
    max_attempts: usize,
    window: Duration,
}

impl RateLimiter {
    pub fn new(max_attempts: usize, window_secs: u64) -> Self {
        Self {
            attempts: Arc::new(Mutex::new(HashMap::new())),
            max_attempts,
            window: Duration::from_secs(window_secs),
        }
    }

    pub async fn check(&self, key: &str) -> bool {
        let mut map = self.attempts.lock().await;
        let now = Instant::now();
        let cutoff = now.checked_sub(self.window).unwrap_or(now);

        let entry = map.entry(key.to_string()).or_default();
        entry.retain(|&t| t > cutoff);

        if entry.len() >= self.max_attempts {
            false
        } else {
            entry.push(now);
            true
        }
    }
}
