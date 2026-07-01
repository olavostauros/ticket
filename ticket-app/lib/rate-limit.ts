/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Uses a Map keyed by IP address. Resets on deploy — good enough for MVP.
 * @todo This is per-instance, not distributed. On Vercel's serverless
 *       architecture, each invocation runs in a separate container.
 *       Replace with Vercel KV (Redis) or a Supabase-based rate limiter.
 * @todo The middleware rate limiter is also per-instance. Same limitation.
 */
import { NextResponse } from "next/server";

interface Window {
  count: number;
  resetAt: number;
}

export const windows = new Map<string, Window>();

// Periodically purge stale entries to prevent memory leak
const PURGE_INTERVAL = 60_000; // 1 minute
let lastPurge = Date.now();

function purgeStale() {
  const now = Date.now();
  if (now - lastPurge < PURGE_INTERVAL) return;
  lastPurge = now;
  for (const [key, win] of windows) {
    if (now >= win.resetAt) {
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
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1, resetAt: now + windowMs };
  }

  entry.count += 1;
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
}

/**
 * Extract client IP from a Next.js request object.
 * Checks common headers in order of preference.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
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
export function rateLimitResponse(resetAt: number): NextResponse {
  return NextResponse.json(
    { error: "Muitas tentativas. Tente novamente em alguns minutos." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
      },
    }
  );
}