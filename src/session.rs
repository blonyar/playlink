use std::time::Instant;
use uuid::Uuid;

/// Per-session token-bucket configuration for room-message rate limiting.
#[derive(Debug, Clone, Copy)]
pub struct RateLimitConfig {
    /// Maximum tokens (burst size).
    pub burst: u32,
    /// Tokens added per second (sustained rate).
    pub per_sec: f64,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            burst: 30,
            per_sec: 30.0,
        }
    }
}

/// A simple token-bucket limiter. `try_acquire` refills based on elapsed wall
/// time and consumes one token, returning `false` when the bucket is empty.
#[derive(Debug)]
pub struct RateLimiter {
    capacity: f64,
    tokens: f64,
    refill_per_sec: f64,
    last_refill: Instant,
}

impl RateLimiter {
    pub fn new(config: RateLimitConfig) -> Self {
        let capacity = config.burst as f64;
        Self {
            capacity,
            tokens: capacity,
            refill_per_sec: config.per_sec,
            last_refill: Instant::now(),
        }
    }

    pub fn try_acquire(&mut self) -> bool {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        self.last_refill = now;
        self.tokens = (self.tokens + elapsed * self.refill_per_sec).min(self.capacity);

        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

#[derive(Debug)]
pub struct Session {
    pub player_id: Uuid,
    pub player_name: Option<String>,
    pub room_id: Option<Uuid>,
    pub rate_limiter: RateLimiter,
}

impl Session {
    pub fn new(rate_limit: RateLimitConfig) -> Self {
        Self {
            player_id: Uuid::new_v4(),
            player_name: None,
            room_id: None,
            rate_limiter: RateLimiter::new(rate_limit),
        }
    }
}

impl Default for Session {
    fn default() -> Self {
        Self::new(RateLimitConfig::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limiter_allows_burst_then_throttles() {
        let mut limiter = RateLimiter::new(RateLimitConfig {
            burst: 3,
            per_sec: 0.0,
        });

        assert!(limiter.try_acquire());
        assert!(limiter.try_acquire());
        assert!(limiter.try_acquire());
        assert!(!limiter.try_acquire(), "bucket should be empty after burst");
    }

    #[test]
    fn rate_limiter_refills_over_time() {
        let mut limiter = RateLimiter::new(RateLimitConfig {
            burst: 1,
            per_sec: 1000.0,
        });

        assert!(limiter.try_acquire(), "first token from a full bucket");
        assert!(!limiter.try_acquire(), "bucket is now empty");

        // One token at 1000/sec needs 1ms; sleep well past that.
        std::thread::sleep(std::time::Duration::from_millis(10));
        assert!(
            limiter.try_acquire(),
            "bucket should have refilled after waiting"
        );
    }
}
