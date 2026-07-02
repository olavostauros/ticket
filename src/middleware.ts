import type { APIContext } from "astro";
import { checkRateLimit, getClientIp, rateLimitResponse, cleanupRateLimiter } from "./lib/rate-limit";

type MiddlewareNext = () => Promise<Response> | Response;

/**
 * Astro middleware — applies global rate limiting to all API routes.
 *
 * This is a broad first line of defense (30 req/min per IP) against
 * basic abuse. Route-specific handlers apply tighter limits as a
 * second line (e.g., 3 req/min for signup, 10 req/min for checkout).
 *
 * Non-API routes pass through without rate limiting.
 */
export async function onRequest(context: APIContext, next: MiddlewareNext): Promise<Response> {
  const url = new URL(context.request.url);

  // Only rate-limit API routes
  if (!url.pathname.startsWith("/api/")) {
    return next();
  }

  // Periodic cleanup of stale rate limiter entries (in-memory fallback)
  cleanupRateLimiter();

  // Global rate limit: 30 requests per minute per IP
  const ip = getClientIp(context.request);
  const kv = (context.locals as any)?.runtime?.env?.RATE_LIMIT as KVNamespace | undefined;
  const { allowed, resetAt } = await checkRateLimit(`global:${ip}`, 30, 60_000, kv);

  if (!allowed) {
    return rateLimitResponse(resetAt);
  }

  return next();
}