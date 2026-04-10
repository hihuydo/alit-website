/**
 * In-memory rate limiter keyed by endpoint + client IP.
 * Probabilistic eviction sweep on ~1% of calls to prevent unbounded growth.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const DEFAULT_MAX = 25;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkRateLimit(
  key: string,
  max = DEFAULT_MAX,
  windowMs = DEFAULT_WINDOW_MS
): { allowed: boolean; remaining: number } {
  const now = Date.now();

  // Probabilistic sweep — ~1% of calls, O(n) pass over expired entries
  if (Math.random() < 0.01) {
    for (const [k, v] of store) {
      if (v.resetAt <= now) store.delete(k);
    }
  }

  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1 };
  }

  entry.count++;

  if (entry.count > max) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: max - entry.count };
}
