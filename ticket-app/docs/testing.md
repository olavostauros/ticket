# Testing — Framework & Improvements

This document describes the test framework used in Ticket, how to run tests,
the conventions for writing new tests, and a plan for closing coverage gaps.

---

## 1. Framework

| Tool | Version | Purpose |
|------|---------|---------|
| **Vitest** | ^4.1.9 | Test runner (fast, Jest-compatible, native ESM) |
| **@vitejs/plugin-react** | ^6.0.3 | React JSX transform for component tests (future use) |
| **TypeScript** | ^6.0.3 | Type-checked tests via `vitest` (no separate ts-jest) |

**Key config** (`vitest.config.ts`):

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", ".next", ".nvm"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

### Why Vitest?

- **Native ESM** — works with Next.js/TypeScript `bundler` moduleResolution
- **Fast** — 366ms for 148 tests (no db, no network)
- **Jest-compatible API** — `describe`/`it`/`expect`/`vi` out of the box
- **Native TypeScript** — no ts-jest, no Babel transforms
- **Mock system** — `vi.mock()`, `vi.fn()`, `vi.stubGlobal()` cover all needs

---

## 2. Running Tests

```bash
# Run all tests (CI mode, single run)
npm test

# Watch mode (re-run on changes)
npm run test:watch

# Run a single test file
npx vitest run tests/validation.test.ts

# Run tests matching a pattern
npx vitest run --reporter=verbose

# With coverage (install @vitest/coverage-v8 first)
npx vitest run --coverage
```

### Docker

```bash
docker compose run --rm app npx vitest run
docker compose run --rm app npx vitest        # watch mode
```

---

## 3. Test Structure

```
tests/
├── setup.ts                          # Global env vars for all tests
├── validation.test.ts                # Schema validation unit tests
├── utils.test.ts                     # Pure utility function tests
├── fees.test.ts                      # Financial calculation tests
├── api/
│   ├── auth.test.ts                  # Auth schema + middleware unit tests
│   ├── auth.routes.test.ts           # Auth route handler integration tests
│   ├── events.test.ts                # Event schema unit tests
│   ├── checkout.test.ts              # Checkout schemas + AbacatePay client + route
│   └── tickets.test.ts               # Tickets lookup + email + QR code
└── routes/
    └── events.test.ts                # Route-level integration tests (events, upload, publish, cancel)
```

### Conventions

1. **Pure logic → `tests/`** — schema validation, fee calculations, utility functions
2. **Route handlers → `tests/api/` or `tests/routes/`** — mock Supabase + test HTTP status/body
3. **File name matches source** — `validation.test.ts` tests `lib/validation.ts`
4. **Imports use `@/` alias** — same as app code
5. **Setup file** sets env vars in `beforeAll` — no `dotenv` dependency
6. **No database dependency** — all Supabase calls are mocked

---

## 4. Patterns

### 4.1 Schema unit tests (validation)

```ts
import { describe, it, expect } from "vitest";
import { createEventSchema } from "@/lib/validation";

describe("createEventSchema", () => {
  it("accepts minimal valid input", () => {
    const result = createEventSchema.safeParse({ title: "Event", slug: "event", ... });
    expect(result.success).toBe(true);
  });
  it("rejects invalid slug format", () => {
    const result = createEventSchema.safeParse({ ... });
    expect(result.success).toBe(false);
  });
});
```

### 4.2 Pure function tests (utils, fees)

```ts
describe("calculateFees", () => {
  it("calculates PIX correctly", () => {
    const result = calculateFees(2500, "pix");
    expect(result.total_cents).toBe(2675);
  });
});
```

### 4.3 Route handler tests (mocked Supabase)

Mock the server client and auth middleware, then call the exported handler directly:

```ts
const mockSupabase = { from: vi.fn(), rpc: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => mockSupabase,
}));

describe("POST /api/checkout", () => {
  it("returns 400 on invalid input", async () => {
    const { POST } = await import("@/app/api/checkout/route");
    const request = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: "bad", items: [] }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

For chained queries (`.select().eq().single()`), use a helper that returns a proxy:

```ts
function createMockChain(initialResult?: unknown) {
  // returns a Proxy where every method returns itself,
  // and .single() resolves to initialResult
}
```

### 4.4 HTTP request mocking

```ts
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: vi.fn().mockResolvedValue({ id: "bill-001", checkoutUrl: "...", status: "pending" }),
});
// ... run test ...
vi.restoreAllMocks();
```

### 4.5 Route params (Next.js App Router)

```ts
const { GET } = await import("@/app/api/tickets/[unique_code]/route");
const request = new NextRequest("http://localhost:3000/api/tickets/code");
const response = await GET(request, { params: Promise.resolve({ unique_code: "code" }) });
```

---

## 5. Current Coverage

| Layer | Tests | Coverage |
|-------|-------|----------|
| **Zod schemas** | ~55 | ~100% — all fields, valid/invalid/edge |
| **Utility functions** | ~15 | ~100% — getAvailableTiers, generateOrderReference |
| **Fee calculations** | 9 | ~100% — all payment methods, edge cases |
| **Auth routes** (login, logout, profile) | 16 | ~100% — auth middleware, login, logout, profile read/update |
| **Checkout routes** (create, webhook, cron) | 49 | ~90% — creation, webhook HMAC/events/idempotency, cron auth/jobs/retry |
| **Events API** | ~22 | ~90% — CRUD, listing, routes |
| **Tickets API** | ~12 | ~100% — lookup, download, QR code |
| **React pages** | 0 | **0%** — no component tests |
| **Database RPC** | 0 | **0%** — SQL functions are untested |
| **E2E flows** | 0 | **0%** — no Playwright/Cypress |

### Remaining gaps

| Route file | Status |
|-----------|--------|
| React pages (components, dashboard, listings) | 🟡 Untested — see Phase B |
| Database RPC functions (`create_order_atomic`, `void_order_atomic`, etc.) | 🔴 Untested — see Phase C |
| E2E flows (browse → checkout → pay → view ticket) | 🔴 Untested — see Phase C |

---

## 6. Planned Improvements

### Phase A — ✅ Complete (all 15 `todo` stubs replaced, auth routes added)

1. ✅ **Webhook route** (7 tests) — HMAC verification, `checkout.completed` / `checkout.lost` processing, idempotent replays, unknown event rejection, malformed JSON handling
2. ✅ **Cron route** (5 tests) — bearer/query token auth, `expire_stale_orders`, `fetch_pending_jobs`, `send_confirmation_email`, max retry → permanent failure
3. ✅ **Auth/logout** (3 tests) — cookie clearing (Max-Age=0), JSON response, browser redirect
4. ✅ **Profile update** (4 tests) — unauthenticated, invalid JSON, invalid name, successful update
5. ✅ **Auth lookup** (2 tests) — no organizer record, successful profile return

**Outcome:** 169 tests, 0 todo, 0 failing.

### Phase B — Component tests

3. **Add `@testing-library/react` + `happy-dom`** for React component tests
   - `components/qr-code.tsx`
   - `app/dashboard/page.tsx`
   - `app/events/[slug]/page.tsx`

4. **Switch `vitest.config.ts` environment** to a multi-environment setup:
   - `node` for lib/ and API route tests
   - `happy-dom` for component tests
   - Use `// @vitest-environment happy-dom` file-level pragma

### Phase C — Integration tests

5. **Seed a local PostgreSQL** (via `docker compose`) in CI and run tests against real DB
   - Validates RPC functions (`create_order_atomic`, `void_order_atomic`)
   - Validates unique constraints, foreign keys, row-level locking

6. **Set up E2E with Playwright**
   - Happy path: browse event → checkout → pay → see ticket
   - Auth flow: signup → login → create event → publish

### Phase D — Infrastructure

7. **Add `@vitest/coverage-v8`** and set a coverage threshold in CI
   - Target: 85%+ on `lib/`, 70%+ on `app/api/`, 50%+ on `app/` pages

8. **Add a `pre-commit` hook** (husky or simple git hook) that runs `npm test`

9. **Add `vitest --reporter=junit`** in CI for test result visualization

---

## 7. Environment Variables (test setup)

All env vars are set in `tests/setup.ts` via `process.env` so tests are hermetic:

```ts
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test-project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.RESEND_API_KEY = "re_test";
process.env.ABACATEPAY_API_KEY = "apk_test";
process.env.ABACATEPAY_WEBHOOK_SECRET = "whsec_test";
process.env.JOB_PROCESSOR_SECRET = "test-secret";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
```

No `.env` file is needed to run tests.

---

## 8. Quick Reference

```bash
# Current stats
npm test
# → 169 passed, 0 failed, 413ms

# Run a specific test file
npx vitest run tests/fees.test.ts

# Watch a single file
npx vitest tests/validation.test.ts

# Verbose output to see test names
npx vitest run --reporter=verbose
```

## 9. Changelog

| Date | Change |
|------|--------|
| 2026-06-29 | Initial version — 148 tests, 15 todo |
| 2026-06-29 | Phase A implementation — replaced 15 todo stubs with real webhook (7) and cron (5) tests. Added logout (3), profile update (4), auth lookup (2) tests. Total: 169 tests, 0 todo |