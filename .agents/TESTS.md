# Ticket — Test Guidelines

This document describes the testing strategy, conventions, and patterns used in the Ticket codebase. All new code should follow these guidelines.

---

## 1. Test Stack

| Concern | Choice |
|---|---|
| **Test runner** | [Vitest](https://vitest.dev) v4.x |
| **Assertions** | Built-in Vitest (`expect`) |
| **Mocking** | `vi.mock()`, `vi.fn()`, `vi.spyOn()` |
| **Test location** | `src/tests/**/*.test.ts` |
| **Setup file** | `src/tests/setup.ts` |
| **Config** | `vitest.config.ts` |
| **TypeScript** | Full type support via `vitest/globals` |

### Running Tests

```bash
bun run test          # run all tests (vitest run)
bun run test:watch    # watch mode (vitest)
bun run test:smoke    # smoke tests only (src/tests/smoke.suite.ts)
```

---

## 2. Test Tiers (by isolation level)

### Tier 1 — Pure Unit Tests

Tests for pure functions with no I/O, database, or module mocking.

**Location**: `src/tests/*.test.ts` alongside other tests.

**Pattern**:
- Import the function/class directly.
- Test happy path, edge cases, error inputs, and boundary conditions.
- No mocking required.

**Examples**:
- `utils.test.ts` — `generateOrderReference()`, `getAvailableTiers()`
- `email-templates.test.ts` — `buildWelcomeEmail()`, `buildConfirmationEmail()`
- `password-reset.test.ts` — Zod schema validation (`forgotPasswordSchema`, `resetPasswordSchema`)
- `rate-limit.test.ts` — `checkRateLimit()`, `getClientIp()`, `cleanupRateLimiter()`

### Tier 2 — Mocked Route Handler Tests

Tests for Astro API route handlers (`src/pages/api/*.ts`) with mocked database and auth layers.

**Location**: `src/tests/*.test.ts`.

**Pattern**:
1. `vi.mock("../lib/db", () => ({ query: vi.fn() }))` at module top.
2. `vi.mock("../lib/auth", () => ({ getAuthUser: vi.fn(), ... }))` if needed.
3. Inside each test, call `(query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(...)` to set up DB responses.
4. Dynamically import the handler via `await import("../pages/api/...")`.
5. Construct a minimal Astro `APIContext` using `buildRequest()` helper (preferred) or by hand.
6. Assert response status and body.

**Prefer `buildRequest()`** from `src/tests/helpers/request.ts`:

```ts
import { buildRequest } from "../helpers/request";

const ctx = buildRequest({
  method: "POST",
  url: "/api/events",
  body: { title: "Test", slug: "test-event", ... },
});
const res = await POST(ctx);
```

**Examples**: `auth.test.ts`, `events.test.ts`, `checkin.test.ts`.

### Tier 3 — Smoke Tests (Post-Deploy)

Hit a live server to verify the stack responds correctly. Run after deployment or `docker compose up`.

**Location**: `src/tests/smoke.suite.ts`. Run via `bun run test:smoke`.

**Pattern**:
- Use `fetch()` against `SMOKE_TEST_BASE_URL` (default `http://localhost:4321`).
- Test HTTP status codes, redirect chains, HTML content, API JSON responses.
- Never 500 — any non-500 status is acceptable for public routes.
- Tiered: basic smoke tests first, then comprehensive coverage.

### Tier 4 — Integration Tests (Planned)

End-to-end tests against a real PostgreSQL test database.

**Location**: `src/tests/**/*.integration.test.ts` (pending).

**Pattern** (not yet implemented):
- Use `src/tests/helpers/db.ts` — `seed()` and `teardown()` functions.
- Run against a test-only database (`DATABASE_URL=postgresql://.../ticket_test`).
- Truncate all tables between test runs.

---

## 3. Test File Organization

All tests live in `src/tests/`:

```
src/tests/
├── auth.test.ts                # Tier 2 — Auth route handlers
├── checkin.test.ts             # Tier 2 — Check-in handler
├── email-templates.test.ts     # Tier 1 — Email builder functions
├── events.test.ts              # Tier 2 — Events route handlers
├── password-reset.test.ts      # Tier 1 — Password reset schemas + email
├── rate-limit.test.ts          # Tier 1 — Rate limiter logic
├── utils.test.ts               # Tier 1 — Utility functions
├── smoke.suite.ts              # Tier 3 — Post-deploy smoke tests
├── setup.ts                    # Test setup (env vars)
├── fixtures/
│   └── index.ts                # Entity factory functions
└── helpers/
    ├── db.ts                   # DB seed/teardown helpers (Tier 4, WIP)
    └── request.ts              # BuildRequest helper (Tier 2)
```

### Naming Conventions

| Type | Pattern |
|---|---|
| Unit / handler tests | `*.test.ts` |
| Smoke tests | `smoke.suite.ts` |
| Integration tests | `*.integration.test.ts` (planned) |
| Fixtures | `fixtures/index.ts` |
| Helpers | `helpers/*.ts` |

---

## 4. Fixtures & Factories

Use `src/tests/fixtures/index.ts` to create test entities with sensible defaults.

```ts
import { buildOrganizer, buildEvent, buildTier, buildTicket } from "../fixtures";

const organizer = buildOrganizer({ email: "test@example.com" });
const event = buildEvent({ organizer_id: organizer.id });
const tier = buildTier({ event_id: event.id, quantity_total: 100 });
const ticket = buildTicket({ event_id: event.id, tier_id: tier.id });
```

- Factories auto-increment IDs so each call produces a unique entity.
- Override any field by passing a partial.
- Available factories: `buildOrganizer`, `buildEvent`, `buildEventWithTiers`, `buildTier`, `buildRegistration`, `buildTicket`, `buildCheckIn`.

---

## 5. Mocking Guidelines

### Mock only external dependencies

- Mock `../lib/db` (the `query()` function) for handler tests.
- Mock `../lib/auth` functions (`getAuthUser`, `signToken`, `verifyToken`, `requireAuth`, `redirectIfAuthenticated`) when testing auth gates.
- Mock `../lib/password` (`hashPassword`, `verifyPassword`) when testing login/signup.

### Do NOT mock

- Pure utility functions (`src/lib/utils.ts`, `src/lib/format.ts`, `src/lib/email-templates.ts`, `src/lib/validation.ts`).
- Test them directly (Tier 1).

### Mock setup pattern

```ts
// At module top level
vi.mock("../lib/db", () => ({ query: vi.fn() }));
vi.mock("../lib/auth", () => ({
  getAuthUser: vi.fn(),
  signToken: vi.fn().mockResolvedValue("test-token"),
  verifyToken: vi.fn().mockResolvedValue(null),
  requireAuth: vi.fn(),
  redirectIfAuthenticated: vi.fn(),
}));

// Inside tests
import { getAuthUser } from "../lib/auth";
import { query } from "../lib/db";
```

### Dynamic imports for handlers

Always use `await import()` inside the test (not static imports at the top):

```ts
const { POST } = await import("../pages/api/events");
```

This ensures mocks are registered before the module is loaded.

---

## 6. Assertion Patterns

### Prefer status codes over body content

```ts
// Good
expect(res.status).toBe(201);

// Also good — verify structure
const body = await res.json();
expect(body.data.organizer.email).toBe("test@example.com");
```

### Test the unhappy paths

Every handler test should cover, at minimum:

| Scenario | Assert |
|---|---|
| **Success** | 200/201 |
| **Unauthenticated** | 401 |
| **Forbidden (wrong owner)** | 403 |
| **Not found** | 404 |
| **Conflict (duplicate)** | 409 |
| **Validation error** | 400 |

### Pure function edge cases

For Tier 1 tests, cover:

- **Normal case** — expected input produces expected output.
- **Empty/null input** — empty string, null, undefined.
- **Boundary values** — min/max lengths, zero, negative numbers.
- **XSS / injection** — user-provided strings are escaped.

---

## 7. Smoke Test Conventions

Documented inline in `src/tests/smoke.suite.ts`. Key rules:

- Run against a live server (default `http://localhost:4321`).
- **Never assert 500** — every endpoint must handle errors gracefully.
- Use `redirect: "manual"` for protected pages and follow redirects manually.
- Split into Tier 1 (basic: app responds, public pages 200, auth 401) and Tier 2 (comprehensive: all static pages, dynamic pages, API routes).

---

## 8. Writing New Tests — Checklist

- [ ] Place test in `src/tests/<name>.test.ts`.
- [ ] Include in `vitest.config.ts` pattern (`src/tests/**/*.test.ts`) — no config change needed.
- [ ] Use `describe`/`it`/`expect` from vitest (globals enabled).
- [ ] For handler tests: mock `db` and `auth` at the module top, use `vi.clearAllMocks()` in `beforeEach`.
- [ ] For handler tests: use `buildRequest()` from `helpers/request.ts` when possible.
- [ ] Use fixture factories from `fixtures/index.ts` for entity data.
- [ ] Test happy path + all relevant error paths.
- [ ] Run `bun run test` locally and confirm all tests pass before opening a PR.
- [ ] For smoke tests: add new checks to `smoke.suite.ts` with appropriate tier.

---

## 9. CI / Pre-commit (Future)

Automated test runs are planned as part of CI. Ensure all tests pass before committing:

```bash
bun run test
```