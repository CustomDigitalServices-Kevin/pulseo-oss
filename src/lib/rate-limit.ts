/**
 * In-memory sliding window rate limiter for Pulseo.
 *
 * Limits requests per identifier (typically IP) over a moving window.
 * Uses an LRU-style Map with periodic cleanup to bound memory.
 *
 * Not distributed: each Node.js process maintains its own state.
 * For multi-instance deployments, prefer Redis-based rate limiting.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, max: 100 });
 *   const result = limiter.check(ip);
 *   if (!result.allowed) return 429;
 */

interface RateLimitOptions {
  /** Sliding window size in milliseconds. */
  windowMs: number;
  /** Maximum requests per window per identifier. */
  max: number;
  /** Maximum entries to keep in memory. Older entries are evicted. */
  maxEntries?: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

interface RateLimiter {
  check(identifier: string): RateLimitResult;
  reset(identifier: string): void;
  size(): number;
}

interface Entry {
  timestamps: number[];
  lastAccess: number;
}

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const { windowMs, max, maxEntries = 10_000 } = options;
  const store = new Map<string, Entry>();

  function evictIfNeeded(): void {
    if (store.size <= maxEntries) return;
    // Evict 10% of the oldest entries by lastAccess.
    const toEvict = Math.ceil(maxEntries * 0.1);
    const sorted = Array.from(store.entries()).sort(
      (a, b) => a[1].lastAccess - b[1].lastAccess
    );
    for (let i = 0; i < toEvict && i < sorted.length; i++) {
      store.delete(sorted[i][0]);
    }
  }

  return {
    check(identifier: string): RateLimitResult {
      const now = Date.now();
      const cutoff = now - windowMs;
      const entry = store.get(identifier);

      let timestamps: number[];
      if (entry) {
        timestamps = entry.timestamps.filter((t) => t > cutoff);
      } else {
        timestamps = [];
      }

      const allowed = timestamps.length < max;
      if (allowed) {
        timestamps.push(now);
      }

      store.set(identifier, { timestamps, lastAccess: now });
      evictIfNeeded();

      const oldest = timestamps[0] ?? now;
      const resetAt = oldest + windowMs;

      return {
        allowed,
        remaining: Math.max(0, max - timestamps.length),
        resetAt,
        limit: max,
      };
    },
    reset(identifier: string): void {
      store.delete(identifier);
    },
    size(): number {
      return store.size;
    },
  };
}

// ─── Pre-configured limiters for common use cases ────────────────────────────

/** Auth endpoints: 5 requests / 15 minutes per IP. */
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
});

/** General API: 100 requests / minute per IP. */
export const apiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
});

/** Heavy actions (create ticket, upload): 30 / minute per IP. */
export const writeLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
});
