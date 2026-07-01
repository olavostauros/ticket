# Plan: End-to-End Happy Path Test

> **Roadmap:** [#2 — E2E Happy Path Test](../ROADMAP.md#2-🧪-end-to-end-test-happy-path)
> **Priority:** P0 — Launch Blocker
> **Effort:** 1 day (Supertest) + 2 days optional (Playwright)

---

## Goal

Create a single automated test that validates the **complete MVP transaction lifecycle** from organizer signup through attendee check-in. This is the single most important test — it proves the MVP gate criteria are met.

---

## The Full Flow

```
┌─────────────────────────────────────────────────────────┐
│  Organizer                                              │
│                                                         │
│  1. POST /api/auth/signup  →  account created          │
│  2. POST /api/auth/login   →  session cookie            │
│  3. POST /api/events       →  event created (draft)     │
│  4. POST /api/events/{slug}/tiers → tier added          │
│  5. POST /api/events/{slug}/publish → event live        │
├─────────────────────────────────────────────────────────┤
│  Attendee                                               │
│                                                         │
│  6. GET /api/events/{slug}  →  see event + tiers       │
│  7. POST /api/checkout      →  order created (pending)  │
│                                + AbacatePay checkout URL │
├─────────────────────────────────────────────────────────┤
│  AbacatePay (simulated)                                  │
│                                                         │
│  8. POST /api/webhooks/abacatepay  →  checkout.completed│
│              ↓                                           │
│             Order → paid, tickets generated, email queued│
├─────────────────────────────────────────────────────────┤
│  Verification                                           │
│                                                         │
│  9. GET /api/tickets/{code}  →  ticket exists + details │
│ 10. POST /api/checkin        →  attendee checked in     │
│ 11. Query DB directly        →  everything consistent   │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation: Supertest (HTTP-Level)

Use **Supertest** (`supertest`) to hit all API routes in sequence with mocked external services (AbacatePay, Resend). No browser needed.

### Setup

**Add supertest dependency:**
```bash
cd ticket-app && npm install --save-dev supertest @types/supertest
```

**Create test file:** `ticket-app/tests/e2e/happy-path.test.ts`

### Test Structure

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
// ... Next.js test utilities or direct API route imports
```

**Option A: Use Next.js test helpers** — Next.js 16's `@next/test-utils` allows running a full server for testing. This is the most faithful approach.

**Option B: Test route handlers directly** — Import each route handler and call it with mocked request/response objects. Simpler but less realistic.

**Option C (recommended for MVP):** Create a test script that:
1. Starts the Next.js dev server or uses the built server
2. Uses `fetch` (Node 24 built-in) to make real HTTP requests
3. Mocks external services at the network level using MSW or nock

**Decision: Option B** — Direct handler tests. All routes already accept standard `NextRequest` objects. This avoids the complexity of a full server boot and keeps tests fast. Use the existing test infrastructure (mocked Supabase).

### Test Steps (Detailed)

```typescript
// ================================================================
// Step 1: Signup as organizer
// ================================================================

// Mock Supabase auth admin to return a successful signup
const signupResponse = await runRoute("POST /api/auth/signup", {
  body: { name: "Test Organizer", email: "org@test.com", password: "password123" },
});

expect(signupResponse.status).toBe(200);
expect(signupResponse.body.data.organizer.email).toBe("org@test.com");
const authToken = signupResponse.cookies["sb-auth-token"];

// ================================================================
// Step 2: Create event
// ================================================================

const eventResponse = await runRoute("POST /api/events", {
  auth: authToken,
  body: {
    title: "Test Event",
    slug: "test-event",
    description: "An event for testing",
    venue_name: "Test Venue",
    venue_address: "123 Test St",
    start_at: "2026-08-15T20:00:00Z",
    end_at: "2026-08-16T02:00:00Z",
    timezone: "America/Sao_Paulo",
    cover_image_url: null,
  },
});

expect(eventResponse.status).toBe(201);
const event = eventResponse.body.data;
expect(event.status).toBe("draft");
const eventSlug = event.slug;

// ================================================================
// Step 3: Add a ticket tier
// ================================================================

const tierResponse = await runRoute(`POST /api/events/${eventSlug}/tiers`, {
  auth: authToken,
  body: { name: "General", price_cents: 2500, quantity_total: 100, description: "" },
});

expect(tierResponse.status).toBe(201);
const tier = tierResponse.body.data;

// ================================================================
// Step 4: Publish the event
// ================================================================

const publishResponse = await runRoute(`POST /api/events/${eventSlug}/publish`, {
  auth: authToken,
});

expect(publishResponse.status).toBe(200);
expect(publishResponse.body.data.status).toBe("published");

// ================================================================
// Step 5: Attendee views the event publicly
// ================================================================

const publicEventResponse = await runRoute(`GET /api/events/${eventSlug}`, {
  // No auth
});

expect(publicEventResponse.status).toBe(200);
expect(publicEventResponse.body.data.tiers).toHaveLength(1);
expect(publicEventResponse.body.data.tiers[0].id).toBe(tier.id);

// ================================================================
// Step 6: Attendee creates a checkout
// ================================================================

// Mock AbacatePay.createCheckout to return a test checkout URL + billing ID
const idempotencyKey = crypto.randomUUID();

const checkoutResponse = await runRoute("POST /api/checkout", {
  body: {
    event_id: event.id,
    items: [{ tier_id: tier.id, quantity: 2 }],
    attendee_email: "attendee@test.com",
    attendee_name: "Test Attendee",
    idempotency_key: idempotencyKey,
  },
});

expect(checkoutResponse.status).toBe(201);
const checkout = checkoutResponse.body.data;
expect(checkout.order_reference).toBeDefined();
expect(checkout.checkout_url).toBe("https://abacatepay.test/checkout/...");
expect(checkout.order.status).toBe("pending");
const reference = checkout.order_reference;

// ================================================================
// Step 7: Simulate AbacatePay webhook — checkout.completed
// ================================================================

// Generate valid HMAC signature
const webhookBody = {
  event: "checkout.completed",
  data: {
    id: checkout.order.abacatepay_billing_id,
    reference: reference,
    status: "paid",
    amount: tier.price_cents * 2 + /* fees */,
    payment_method: "pix",
  },
};

const webhookResponse = await runRoute("POST /api/webhooks/abacatepay", {
  body: webhookBody,
  headers: {
    "x-abacatepay-signature": await generateSignature(webhookBody),
  },
});

expect(webhookResponse.status).toBe(200);

// ================================================================
// Step 8: Verify tickets were created
// ================================================================

// Query the tickets for this order via the lookup endpoint
const lookupResponse = await runRoute(
  `GET /api/orders/lookup?email=attendee@test.com&reference=${reference}`
);

expect(lookupResponse.status).toBe(200);
expect(lookupResponse.body.data.tickets).toHaveLength(2);
const ticket = lookupResponse.body.data.tickets[0];
expect(ticket.holder_email).toBe("attendee@test.com");
expect(ticket.checked_in_at).toBeNull();

// Verify ticket detail page
const ticketDetailResponse = await runRoute(
  `GET /api/tickets/${ticket.unique_code}`
);

expect(ticketDetailResponse.status).toBe(200);
expect(ticketDetailResponse.body.data.tier.name).toBe("General");

// ================================================================
// Step 9: Check in attendee
// ================================================================

const checkinResponse = await runRoute("POST /api/checkin", {
  auth: authToken,
  body: {
    event_id: event.id,
    ticket_code: ticket.unique_code,
  },
});

expect(checkinResponse.status).toBe(200);

// Verify ticket now shows checked-in
const ticketAfterCheckin = await runRoute(
  `GET /api/tickets/${ticket.unique_code}`
);
expect(ticketAfterCheckin.body.data.checked_in_at).not.toBeNull();
```

### Mocking Strategy

| External Service | What to Mock | How |
|-----------------|-------------|-----|
| **AbacatePay API** (`lib/abacatepay.ts`) | `createCheckout()` | Return fake checkout URL + billing ID |
| **AbacatePay Webhook** | Signature verification | Use known secret + generate HMAC in test |
| **Resend (email)** | `sendEmail()` | No-op spy — assert it was called with correct params |
| **Supabase Auth** | `admin.createUser()`, `admin.generateLink()` | Return mock user/token |
| **Supabase DB** | All `.from().*` queries | Return mock data (existing pattern) |

---

## Implementation: Playwright (Browser-Level) — Optional

For a more thorough test, add a Playwright test that opens actual pages and clicks buttons. This validates the HTML/JS rendering, not just the API.

**Not needed for initial launch.** The Supertest version above validates the MVP gate criteria. Add Playwright as technical debt post-launch (see [ROADMAP.md — Technical Debt](../ROADMAP.md#technical-debt-ongoing)).

---

## Key Assertions

| # | Assertion | Why It Matters |
|---|-----------|----------------|
| 1 | Signup returns organizer + sets cookie | Auth works |
| 2 | Event created with `draft` status | CRUD works |
| 3 | Tier added to event | Tier management works |
| 4 | Publish flips event to `published` | Publishing works |
| 5 | Public endpoint returns event + tiers | Visibility control works |
| 6 | Checkout returns `pending` order + checkout URL | Payment initiation works |
| 7 | Idempotent checkout returns 200 (not 201) | Idempotency works |
| 8 | Webhook flips order to `paid` | Payment processing works |
| 9 | 2 tickets created for qty=2 | Ticket generation works |
| 10 | Check-in succeeds | Check-in works |
| 11 | Check-in is reflected in ticket detail | State persistence works |

---

## Files to Create

| File | Purpose |
|------|---------|
| `ticket-app/tests/e2e/happy-path.test.ts` | The full happy path test |

---

## Running the Test

```bash
cd ticket-app && npx vitest run tests/e2e --reporter verbose
```

This test should be added to the CI pipeline to run on every push (see [TESTING_PLAN.md §9](../plan/TESTING_PLAN.md#9-ci-integration) for CI setup).

---

## Edge Cases to Add Later

| Edge Case | When |
|-----------|------|
| Draft event is not publicly visible | After happy path works |
| Canceled event rejects checkouts | After happy path works |
| Expired idempotency key handling | Post-launch |
| Payment failure (checkout.lost) → void order | After happy path works (see [PLAN-overselling-concurrency](../plans/PLAN-overselling-concurrency.md)) |