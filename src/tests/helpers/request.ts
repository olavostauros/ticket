/**
 * Request builder for handler tests (Tier 2).
 *
 * Constructs a minimal Astro `APIContext`-like object without importing
 * Astro internals. Keeps handler tests concise by eliminating repetitive
 * `{ request: new Request(...), cookies: { set: vi.fn() } } as any` boilerplate.
 *
 * Usage:
 *   import { buildRequest } from "../helpers/request";
 *
 *   const ctx = buildRequest({
 *     method: "POST",
 *     url: "/api/events",
 *     body: { title: "My Event", slug: "my-event" },
 *   });
 *
 *   const res = await POST(ctx);
 */

import { vi } from "vitest";

export interface BuildRequestOptions {
  /** HTTP method (default: "GET") */
  method?: string;
  /** Full URL path (default: "/") */
  url?: string;
  /** JSON body — auto-stringified and sets Content-Type header */
  body?: Record<string, unknown>;
  /** Custom headers merged over defaults */
  headers?: Record<string, string>;
  /** Astro cookies mock override (default: { set: vi.fn(), get: vi.fn(), delete: vi.fn() }) */
  cookies?: Record<string, unknown>;
  /** Additional context properties merged into the returned object */
  extra?: Record<string, unknown>;
}

/**
 * Build a minimal APIContext-like object for testing route handlers.
 *
 * Returns a plain object typed as `any` so it can be passed directly to
 * `POST(ctx)`, `GET(ctx)`, etc. without TypeScript complaints about
 * missing Astro-specific fields.
 */
export function buildRequest(opts: BuildRequestOptions = {}): any {
  const {
    method = "GET",
    url = "/",
    body,
    headers = {},
    cookies = { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
    extra = {},
  } = opts;

  const reqHeaders: Record<string, string> = {
    ...headers,
  };

  let requestBody: BodyInit | undefined;

  if (body !== undefined) {
    reqHeaders["Content-Type"] = reqHeaders["Content-Type"] ?? "application/json";
    requestBody = JSON.stringify(body);
  }

  const request = new Request(`http://localhost:4321${url}`, {
    method,
    headers: reqHeaders,
    body: requestBody,
  });

  return {
    request,
    cookies,
    ...extra,
  };
}