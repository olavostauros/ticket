# Plan: Route Handler Edge Case Tests

> **Roadmap:** [#6 — Route Handler Edge Cases](../ROADMAP.md#6-route-handler-edge-cases)
> **Priority:** P1 — Should Have
> **Effort:** 2 days

---

## Goal

Add tests for route handler edge cases that are currently missing. The existing test suite covers the happy path and auth checks for most routes, but many edge cases (draft/canceled event visibility, webhook replay attacks, GDPR deletion) are untested.

---

## Test Matrix

### 1. `GET /api/events/[slug]` — Public Event Visibility

**Current coverage:** Auth checks exist. Success case exists for published events.

**Missing:**
| Scenario | Expected | File |
|----------|----------|------|
| Draft event returns 404 (not 200) | `{ error: "Event not found" }` | `tests/api/events.test.ts` |
| Canceled event returns 404 | Same as above | `tests/api/events.test.ts` |
| Event with no published tiers returns 200 with empty tiers array | `data.tiers = []` | `tests/api/events.test.ts` |
| Non-existent slug returns 404 | `{ error: "Event not found" }` | Already covered? Verify |
| Event with future date shows correctly | Date displayed, not "past" state | `tests/pages/event-page.test.tsx` |

### 2. `POST /api/checkin` — Check-in Edge Cases

**Current coverage:** Auth check (must be organizer). Basic success case.

**Missing:**
| Scenario | Expected | File |
|----------|----------|------|
| Manual check-in by **holder_name** (not QR code) | Success — attendee found by name | `tests/api/checkin.test.ts` |
| Manual check-in by **holder_email** | Success — attendee found by email | `tests/api/checkin.test.ts` |
| Manual check-in with partial name match | Configurable — either exact match or prefix search | `tests/api/checkin.test.ts` |
| Ticket from a different event (within same organizer) | Error — mismatch | `tests/api/checkin.test.ts` |
| Ticket from a different organizer's event | Error — 403 forbidden | `tests/api/checkin.test.ts` |
| Already-checked-in ticket returns error | `"Ticket already checked in"` or idempotent success | `tests/api/checkin.test.ts` |
| Canceled event rejects check-in | Error — event not active | `tests/api/checkin.test.ts` |

### 3. `POST /api/auth/login` — Route Handler Test

**Current coverage:** Schema validation only. No actual route handler test.

**Missing:**
| Scenario | Expected | File |
|----------|----------|------|
| Valid credentials return 200 with user data | `{ data: { organizer: {...} } }` | `tests/api/auth.test.ts` |
| Invalid password returns 401 | `{ error: "Invalid credentials" }` | `tests/api/auth.test.ts` |
| Non-existent email returns 401 | Same as above (no user enumeration) | `tests/api/auth.test.ts` |
| Rate limited (429) returns error message | `{ error: "Too many attempts..." }` | `tests/api/auth.test.ts` |
| Empty body returns 400 | `{ error: "Validation failed..." }` | Already covered by schema tests |

### 4. `POST /api/auth/signup` — Route Handler Test

**Current coverage:** Schema validation only. No route handler test.

**Missing:**
| Scenario | Expected | File |
|----------|----------|------|
| Valid signup creates organizer + sets cookie | 200 with organizer data | `tests/api/auth.test.ts` |
| Duplicate email returns error | 409 with email conflict | `tests/api/auth.test.ts` |
| Weak password (< 8 chars) returns validation error | 400 with password error | Already covered by schema tests |
| Welcome email is queued/sent | Verify `sendEmail` was called | `tests/api/auth.test.ts` |

### 5. `POST /api/events/[slug]/publish` — Success Case

**Current coverage:** Auth check. Error case (no tiers). No success test.

**Missing:**
| Scenario | Expected | File |
|----------|----------|------|
| Valid draft event with tiers → published | Status changes to "published" | `tests/api/events.test.ts` |
| Already-published event returns error (or idempotent) | Error: "Already published" or no-op | `tests/api/events.test.ts` |
| Canceled event cannot be published | Error: "Cannot publish canceled event" | `tests/api/events.test.ts` |
| Draft event with no tiers fails | Error: "Add at least one tier" | Already covered? Verify |

### 6. `POST /api/events/[slug]/cancel` — Success Case

**Current coverage:** Auth check. No success test.

**Missing:**
| Scenario | Expected | File |
|----------|----------|------|
| Published event → canceled | Status changes to "canceled" | `tests/api/events.test.ts` |
| Draft event → canceled | Status changes to "canceled" | `tests/api/events.test.ts` |
| Already-canceled event returns error (or idempotent) | Error: "Already canceled" or no-op | `tests/api/events.test.ts` |

### 7. `POST /api/webhooks/abacatepay` — Security Edge Cases

**Current coverage:** Valid webhook with `checkout.completed`. No error cases.

**Missing:**
| Scenario | Expected | File |
|----------|----------|------|
| **Replay attack**: same `billing_id` sent again from different IP | Second request returns 200 but no-op (idempotent) | `tests/api/checkout.test.ts` |
| **Tampered HMAC**: wrong signature | 401 — "Invalid signature" | `tests/api/checkout.test.ts` |
| **Missing HMAC header** | 401 | `tests/api/checkout.test.ts` |
| **Unknown event type** (e.g., `checkout.refunded`) | Logged but 200 (graceful handling) | `tests/api/checkout.test.ts` |
| **Expired timestamp** in payload (replay window > 5 min) | Should reject if timestamp is implemented | `tests/api/checkout.test.ts` |
| **checkout.lost** → void order | Order voids, quantity_sold decremented | `tests/api/checkout.test.ts` |

### 8. `POST /api/admin/delete-attendee-data` — GDPR Deletion

**Current coverage:** **Zero tests.** This endpoint must be tested for LGPD compliance.

**Missing:**
| Scenario | Expected | File |
|----------|----------|------|
| Valid attendee email → data anonymized | Orders: attendee_email → 'deleted', attendee_name → 'deleted' | `tests/api/admin.test.ts` |
| Non-existent email | Returns success (no-op, idempotent) | `tests/api/admin.test.ts` |
| Unauthorized request (no admin secret) | 403 — "Unauthorized" | `tests/api/admin.test.ts` |
| Attendee with multiple orders across events | All orders anonymized | `tests/api/admin.test.ts` |
| Verify `tickets` still reference order but names are removed | Tickets exist, holder_name = 'Deleted' | `tests/api/admin.test.ts` |

---

## Implementation

### File: `tests/api/events.test.ts`

Add tests for draft/canceled visibility, publish/cancel success cases:

```typescript
describe("GET /api/events/[slug]", () => {
  it("returns 404 for draft events", async () => {
    // Arrange: mock event with status='draft'
    const res = await runHandler("GET", `/api/events/draft-event`, {});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Event not found");
  });

  it("returns 404 for canceled events", async () => {
    // Arrange: mock event with status='canceled'
    const res = await runHandler("GET", `/api/events/canceled-event`, {});
    expect(res.status).toBe(404);
  });

  it("returns empty tiers for event with no available tiers", async () => {
    // Arrange: published event, all tiers sold out
    const res = await runHandler("GET", `/api/events/sold-out-event`, {});
    expect(res.status).toBe(200);
    expect(res.body.data.tiers).toEqual([]);
  });
});

describe("POST /api/events/[slug]/publish", () => {
  it("publishes a draft event with tiers", async () => {
    // Arrange: auth, draft event, tiers present
    const res = await runHandler("POST", `/api/events/my-event/publish`, { auth: true });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("published");
  });

  it("rejects publishing an already-published event", async () => {
    // Arrange: event already published
    const res = await runHandler("POST", `/api/events/published-event/publish`, { auth: true });
    expect(res.status).toBe(400); // or 409
    expect(res.body.error).toMatch(/already published/i);
  });
});
```

### File: `tests/api/admin.test.ts`

New file for GDPR deletion tests:

```typescript
describe("POST /api/admin/delete-attendee-data", () => {
  it("anonymizes attendee data across all orders", async () => {
    // Arrange: attendee has 2 orders for 2 different events
    // Act: call delete endpoint
    const res = await runHandler("POST", "/api/admin/delete-attendee-data", {
      body: { email: "attendee@test.com" },
      headers: { "x-admin-secret": "admin-secret" },
    });

    expect(res.status).toBe(200);

    // Assert: orders anonymized
    const orders = await queryDb("SELECT * FROM orders WHERE attendee_email = 'deleted'");
    expect(orders.length).toBe(2);
  });
});
```

---

## Files Summary

| Action | File | New Tests |
|--------|------|-----------|
| **Modify** | `tests/api/events.test.ts` | ~10 new test cases (draft visibility, publish/cancel edge cases) |
| **Modify** | `tests/api/auth.test.ts` | ~6 new test cases (login/signup handler edge cases) |
| **Modify** | `tests/api/checkin.test.ts` | ~6 new test cases (manual search by name/email, cross-event, double check-in) |
| **Modify** | `tests/api/checkout.test.ts` | ~6 new test cases (webhook replay, HMAC, checkout.lost, idempotency) |
| **Create** | `tests/api/admin.test.ts` | ~5 new test cases (GDPR deletion) |
| **Modify** | `tests/api/tickets.test.ts` | ~2 new test cases (ticket lookup for canceled events) |

---

## Expected Outcome

After this plan is complete:

| Metric | Before | After |
|--------|--------|-------|
| Total test files | ~13 | ~14 |
| Total tests | 193 | ~220+ |
| Route handler edge coverage | ~60% | ~90%+ |
| Webhook security test coverage | ~20% | ~90%+ |
| GDPR deletion coverage | 0% | 100% |