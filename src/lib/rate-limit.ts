/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Uses a Map keyed by IP address. Resets on deploy — good enough for MVP.
 * Middleware applies a global rate limit to all API routes as a first line
 * of defense; route-specific handlers apply tighter limits as a second line.
 *
 * @todo Replace with Redis or another distributed store if the app ever
 *       runs on multiple processes/instances.
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
 * Check rate limit for a given key.
 *
 * @param key - Usually the IP address or a composite key (ip + route)
 * @param maxAttempts - Maximum allowed requests in the window
 * @param windowMs - Window duration in milliseconds
 * @returns `true` if the request is allowed, `false` if rate-limited
 */
export function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 60_000
): { allowed: boolean; remaining: number; resetAt: number } {
  purgeStale();

  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || now >= entry.resetAt) {
    // Fresh window
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
 * Reset all rate limit windows. Used in testing.
 */
export function resetRateLimiter(): void {
  windows.clear();
  lastPurge = Date.now();
  evictionCounter = 0;
}

/**
 * Lightweight cleanup that runs on every middleware invocation.
 * Evicts expired entries and enforces the MAX_ENTRIES cap.
 * Uses a counter to only do the full scan every 10 calls.
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
 * Extract client IP from a Next.js request object.
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