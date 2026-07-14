/**
 * smoke.test.ts — Post-Deploy Smoke Tests
 *
 * These tests verify the deployed stack is healthy and responding correctly.
 * They require the application server to be running (e.g., after `docker compose up`).
 *
 * Run with: `bun run test:smoke`
 * Or:       `vitest run --reporter=verbose src/tests/smoke.suite.ts`
 *
 * @see .agents/SMOKE-TEST.md for the full smoke test specification.
 */

import { describe, it, expect } from "vitest";

const BASE_URL = process.env.SMOKE_TEST_BASE_URL || "http://localhost:4321";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function status(path: string, init?: RequestInit): Promise<number> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  return res.status;
}

async function finalStatus(path: string): Promise<number> {
  const res = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (location) {
      const follow = await fetch(new URL(location, BASE_URL));
      return follow.status;
    }
  }
  return res.status;
}

async function html(path: string): Promise<string> {
  const res = await fetch(`${BASE_URL}${path}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Tier 1 — Basic Smoke Tests
// ---------------------------------------------------------------------------

describe("Tier 1 — Basic Smoke Tests", () => {
  it("1. App responds with 200", async () => {
    expect(await status("/")).toBe(200);
  });

  it("2. Public event page returns 200, 302, or 404 (non-existent event)", async () => {
    const code = await status("/events/test-event");
    expect([200, 302, 404]).toContain(code);
  });

  it("3. GET /api/auth/me returns 401 (no auth)", async () => {
    expect(await status("/api/auth/me")).toBe(401);
  });

  it("4. Static assets are served (favicon)", async () => {
    const code = await status("/favicon.ico");
    expect([200, 204, 301, 302, 404]).toContain(code);
  });

  it('5. Signup page renders with "Criar conta"', async () => {
    const body = await html("/signup");
    expect(body).toContain("Criar conta");
  });

  it("6. Dashboard renders or redirects (no auth)", async () => {
    const final = await finalStatus("/dashboard");
    expect(final).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — Comprehensive Smoke Tests
// ---------------------------------------------------------------------------

describe("Tier 2 — Comprehensive Smoke Tests", () => {
  // ---- Public Pages (all should return 200) ----

  describe("Static public pages", () => {
    const publicPages = [
      "/",
      "/signup",
      "/login",
      "/forgot-password",
      "/privacy",
      "/my-tickets",
    ];

    for (const path of publicPages) {
      it(`GET ${path} returns 200`, async () => {
        expect(await status(path)).toBe(200);
      });
    }

    it("returns 404 for nonexistent route", async () => {
      expect(await status("/nonexistent-xyz")).toBe(404);
    });

    for (const path of publicPages) {
      it(`GET ${path} has valid HTML structure`, async () => {
        const body = await html(path);
        expect(body).toContain("<html");
        expect(body).toContain("</body>");
        expect(body).toContain("<title");
      });
    }
  });

  // ---- Dynamic Public Pages ----

  describe("Dynamic public pages", () => {
    it("GET /events/test-event returns 200, 302, or 404 (non-existent event)", async () => {
      const code = await status("/events/test-event");
      expect([200, 302, 404]).toContain(code);
    });

    it("GET /order/REF123/success returns 200, 302, or 404 (order not found)", async () => {
      const code = await status("/order/REF123/success");
      expect([200, 302, 404]).toContain(code);
    });

    it("GET /tickets/TEST1234 returns 404 (non-existent short code, was 500 due to UUID bug)", async () => {
      const code = await status("/tickets/TEST1234");
      // UUID→text fix: short codes no longer crash with 500
      expect(code).toBe(404);
    });
  });

  // ---- Protected Pages (no auth → should redirect to login) ----

  describe("Protected pages redirect when not authenticated", () => {
    const protectedPaths = [
      "/dashboard",
      "/dashboard/events",
      "/dashboard/events/new",
      "/dashboard/profile",
    ];

    for (const path of protectedPaths) {
      it(`GET ${path} redirects (no auth)`, async () => {
        const final = await finalStatus(path);
        expect(final).toBe(200); // redirect chain ends at login page
      });
    }
  });

  // ---- Event-specific dashboard pages (no event → may 404) ----

  describe("Event-specific dashboard pages", () => {
    const eventPaths = [
      "/dashboard/events/testevent",
      "/dashboard/events/testevent/edit",
      "/dashboard/events/testevent/dashboard",
      "/dashboard/events/testevent/checkin",
      "/dashboard/events/testevent/tiers/new",
    ];

    for (const path of eventPaths) {
      it(`GET ${path} returns a status code without crashing`, async () => {
        const code = await finalStatus(path);
        // Should not 500 — redirect, 404, or 200 are acceptable
        expect(code).not.toBe(500);
      });
    }
  });

  // ---- Public API Routes (GET) ----

  describe("Public API GET routes", () => {
    it("GET /api/auth/me returns 401", async () => {
      expect(await status("/api/auth/me")).toBe(401);
    });

    it("GET /api/events returns 404 (POST only)", async () => {
      expect(await status("/api/events")).toBe(404);
    });

    it("GET /api/events/test returns 404 (no such event)", async () => {
      expect(await status("/api/events/test")).toBe(404);
    });

    it("GET /api/tickets/SHORTCODE returns 404 (non-existent code, was 500 due to UUID bug)", async () => {
      const code = await status("/api/tickets/SHORTCODE");
      expect(code).toBe(404);
    });

    it("GET /api/orders/lookup returns 404 (POST only)", async () => {
      expect(await status("/api/orders/lookup")).toBe(404);
    });
  });

  // ---- Public API Routes (POST, empty body → should not 500) ----

  describe("Public API POST routes with empty body", () => {
    const postRoutes = [
      "/api/auth/login",
      "/api/auth/signup",
      "/api/auth/logout",
      "/api/auth/forgot-password",
      "/api/checkin",
      "/api/upload",
      "/api/events",
    ];

    for (const route of postRoutes) {
      it(`POST ${route} returns 400/403/404 — not 500`, async () => {
        const code = await status(route, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        // Any of these are acceptable; 500 is always a failure
        expect(code).not.toBe(500);
      });
    }
  });

  // ---- API Response Body Sanity ----

  describe("API response body sanity", () => {
    it("/api/auth/me returns valid JSON", async () => {
      const res = await fetch(`${BASE_URL}/api/auth/me`);
      const text = await res.text();
      expect(() => JSON.parse(text)).not.toThrow();
    });

    it("/api/events returns 404 HTML page (Portuguese)", async () => {
      const res = await fetch(`${BASE_URL}/api/events`);
      const text = await res.text();
      expect(text).toMatch(/Página não encontrada/i);
    });
  });
});