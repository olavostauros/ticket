/**
 * Sliding-window rate limiter.
 *
 * Dual mode:
 * - In Cloudflare Workers: uses KV namespace with TTL-based expiration.
 * - In local dev / tests: uses in-memory Map as fallback.
 *
 * All functions are async for consistency. Callers that don't provide
 * a KV binding will use the in-memory fallback automatically.
 *
 * Middleware applies a global rate limit to all API routes as a first line
 * of defense; route-specific handlers apply tighter limits as a second line.
 */

interface Window {
  count: number;
  resetAt: number;
  lastAccessed: number;
}

export const windows = new Map<string, Window>();

/** Hard cap on entries to prevent memory leak under sustained abuse. */
const MAX_ENTRIES = 10_000;

// Periodically purge stale entries
const PURGE_INTERVAL = 60_000; // 1 minute
let lastPurge = Date.now();

let evictionCounter = 0;

function purgeStale() {
  const now = Date.now();
  if (now - lastPurge < PURGE_INTERVAL) return;
  lastPurge = now;

  // Pass 1 — remove expired windows
  for (const [key, win] of windows) {
    if (now >= win.resetAt) {
      windows.delete(key);
    }
  }

  // Pass 2 — if still over capacity, evict the least recently accessed
  if (windows.size > MAX_ENTRIES) {
    const sorted = [...windows.entries()].sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    );
    const toDelete = sorted.slice(0, sorted.length - MAX_ENTRIES);
    for (const [key] of toDelete) {
      windows.delete(key);
    }
  }
}

/**
 * Check rate limit — in-memory fallback (local dev / tests).
 */
function checkRateLimitMem(
  key: string,
  maxAttempts: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  purgeStale();

  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || now >= entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs, lastAccessed: now });
    return { allowed: true, remaining: maxAttempts - 1, resetAt: now + windowMs };
  }

  entry.count += 1;
  entry.lastAccessed = now;
  const allowed = entry.count <= maxAttempts;
  const remaining = Math.max(0, maxAttempts - entry.count);

  return { allowed, remaining, resetAt: entry.resetAt };
}

/**
 * Check rate limit — KV-backed (Cloudflare Workers).
 */
async function checkRateLimitKV(
  key: string,
  maxAttempts: number,
  windowMs: number,
  kv: KVNamespace
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const record = await kv.get(key);

  if (!record) {
    const resetAt = now + windowMs;
    await kv.put(key, JSON.stringify({ count: 1, resetAt }), {
      expirationTtl: Math.ceil(windowMs / 1000),
    });
    return { allowed: true, remaining: maxAttempts - 1, resetAt };
  }

  const data: Window = JSON.parse(record);

  if (now >= data.resetAt) {
    const resetAt = now + windowMs;
    await kv.put(key, JSON.stringify({ count: 1, resetAt }), {
      expirationTtl: Math.ceil(windowMs / 1000),
    });
    return { allowed: true, remaining: maxAttempts - 1, resetAt };
  }

  data.count += 1;
  data.lastAccessed = now;
  const allowed = data.count <= maxAttempts;
  const remaining = Math.max(0, maxAttempts - data.count);

  await kv.put(key, JSON.stringify(data), {
    expirationTtl: Math.ceil((data.resetAt - now) / 1000),
  });

  return { allowed, remaining, resetAt: data.resetAt };
}

/**
 * Check rate limit for a given key.
 *
 * @param key - Usually the IP address or a composite key (ip + route)
 * @param maxAttempts - Maximum allowed requests in the window
 * @param windowMs - Window duration in milliseconds
 * @param kv - Optional KV namespace. If provided, uses KV-backed storage.
 *             If omitted, uses in-memory Map (local dev / tests).
 * @returns `{ allowed, remaining, resetAt }`
 */
export async function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 60_000,
  kv?: KVNamespace
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  if (kv) {
    return checkRateLimitKV(key, maxAttempts, windowMs, kv);
  }
  return checkRateLimitMem(key, maxAttempts, windowMs);
}

/**
 * Reset all in-memory rate limit windows. Used in testing.
 */
export function resetRateLimiter(): void {
  windows.clear();
  lastPurge = Date.now();
  evictionCounter = 0;
}

/**
 * Lightweight in-memory cleanup. Only relevant when using in-memory fallback
 * (no KV). KV handles expiration via TTL automatically.
 */
export function cleanupRateLimiter(): void {
  evictionCounter++;
  if (evictionCounter % 10 !== 0) return;

  const now = Date.now();
  for (const [key, win] of windows) {
    if (now >= win.resetAt) {
      windows.delete(key);
    }
  }
  if (windows.size > MAX_ENTRIES) {
    const sorted = [...windows.entries()].sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    );
    const toDelete = sorted.slice(0, sorted.length - MAX_ENTRIES);
    for (const [key] of toDelete) {
      windows.delete(key);
    }
  }
}

/**
 * Extract client IP from a Request object.
 * Checks common headers in order of preference.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0];
    if (first) return first.trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

/**
 * Respond with a 429 Too Many Requests response.
 */
export function rateLimitResponse(resetAt: number): Response {
  return new Response(
    JSON.stringify({ error: "Muitas tentativas. Tente novamente em alguns minutos." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
      },
    }
  );
}