//! Shared bandwidth cap (token bucket) across all running downloads.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration, Instant};

#[derive(Clone)]
pub struct Limiter {
    bytes_per_sec: Arc<AtomicU64>,
    state: Arc<Mutex<(f64, Instant)>>,
}

impl Limiter {
    pub fn new(bytes_per_sec: u64) -> Self {
        Self { bytes_per_sec: Arc::new(AtomicU64::new(bytes_per_sec)), state: Arc::new(Mutex::new((0.0, Instant::now()))) }
    }
    pub fn set(&self, bytes_per_sec: u64) {
        self.bytes_per_sec.store(bytes_per_sec, Ordering::Relaxed);
    }
    /// Waits until `n` bytes may be consumed. Returns at once when unlimited.
    pub async fn take(&self, n: usize) {
        let rate = self.bytes_per_sec.load(Ordering::Relaxed);
        if rate == 0 {
            return;
        }
        let wait = {
            let mut st = self.state.lock().await;
            let now = Instant::now();
            let elapsed = now.duration_since(st.1).as_secs_f64();
            // Bucket holds at most one second of tokens.
            st.0 = (st.0 + elapsed * rate as f64).min(rate as f64);
            st.1 = now;
            st.0 -= n as f64;
            if st.0 < 0.0 { Duration::from_secs_f64(-st.0 / rate as f64) } else { Duration::ZERO }
        };
        if !wait.is_zero() {
            sleep(wait).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn caps_throughput() {
        let l = Limiter::new(100_000);
        let start = Instant::now();
        for _ in 0..30 {
            l.take(10_000).await; // 300 KB at 100 KB/s, bucket starts empty
        }
        let secs = start.elapsed().as_secs_f64();
        assert!(secs > 2.6 && secs < 3.8, "took {secs}");
    }

    #[tokio::test]
    async fn unlimited_is_free() {
        let l = Limiter::new(0);
        let start = Instant::now();
        for _ in 0..1000 {
            l.take(1_000_000).await;
        }
        assert!(start.elapsed() < Duration::from_millis(50));
    }
}
