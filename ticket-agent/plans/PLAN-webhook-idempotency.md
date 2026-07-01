# Plan: Webhook Idempotency Verification

> **Roadmap:** [#7 — Webhook Idempotency Verification](../ROADMAP.md#7-webhook-idempotency-verification)
> **Priority:** P1 — Should Have
> **Effort:** ½ day

---

## Goal

Verify that the AbacatePay webhook handler correctly handles duplicate and racy webhook deliveries without creating duplicate tickets, double-voiding orders, or losing payments.

---

## Why This Matters

AbacatePay (like most payment gateways) delivers webhooks with **at-least-once** semantics. The same webhook event may be sent multiple times (e.g., network retry, dashboard replay). If the handler is not idempotent:

```text
Webhook #1: checkout.completed → Order → paid, tickets generated ✅
Webhook #2: checkout.completed (duplicate) → Double-pay, duplicate tickets ❌
```

Additionally, a **race condition** could occur where `checkout.completed` and `checkout.lost` arrive near-simultaneously:

```text
Webhook #1: checkout.completed    (t=0ms)
Webhook #2: checkout.lost         (t=50ms — race!)

Which one wins? Both could process if not locked properly.
```

---

## Scenarios to Test

### Scenario 1: Duplicate `checkout.completed`

```
Setup: Order exists, status=pending
  ↓
Send checkout.completed webhook
  → Order → paid, tickets created ✓
  ↓
Send same checkout.completed webhook again (same billing_id)
  → Should return 200 (not 500)
  → Should NOT create duplicate tickets
  → Should NOT change order status (already paid)
  → pending_jobs should have exactly 1 email job (not 2)
```

### Scenario 2: Duplicate `checkout.lost`

```
Setup: Order exists, status=pending
  ↓
Send checkout.lost webhook
  → Order → lost, quantity_sold decremented ✓
  ↓
Send same checkout.lost webhook again (same billing_id)
  → Should return 200
  → Should NOT decrement quantity_sold again
  → Should NOT throw error
```

### Scenario 3: Completed then Lost (Race)

```
Setup: Order exists, status=pending, billing_id = "B001"
  ↓
Send checkout.completed for B001
  → Order → paid, tickets created
  ↓
Send checkout.lost for B001 (arrived late or out-of-order)
  → Should reject — order is already paid
  → Should return error, not void the paid order
```

### Scenario 4: Lost then Completed (Reverse Race)

```
Setup: Order exists, status=pending, billing_id = "B002"
  ↓
Send checkout.lost for B002
  → Order → lost, quantity_sold decremented
  ↓
Send checkout.completed for B002 (arrived late)
  → Should reject — order is already lost
  → Should return error, not mark a lost order as paid
```

### Scenario 5: Unknown `billing_id`

```
Send webhook with billing_id that doesn't match any order
  → Should return 200 (graceful ack, AbacatePay expects 200)
  → Should log warning, not crash
```

### Scenario 6: Tampered Payload (already tested in PLAN-route-edge-cases)

Covered in the route edge case plan — wrong HMAC, missing header, etc.

---

## Implementation

### Where Tests Go

Add tests to the existing webhook test file:

**File:** `ticket-app/tests/api/checkout.test.ts` (existing)

Add a new `describe("webhook idempotency")` block:

```typescript
describe("webhook idempotency", () => {
  it("does not create duplicate tickets on duplicate checkout.completed", async () => {
    // 1. Create a pending order via the checkout flow (mocked)
    const order = await createTestOrder({ status: "pending" });
    
    // 2. Send first webhook
    const webhook1 = await sendWebhook("checkout.completed", order.billing_id);
    expect(webhook1.status).toBe(200);

    // 3. Count tickets
    const ticketsAfter1 = await countTicketsForOrder(order.id);
    expect(ticketsAfter1).toBe(2); // assuming qty=2

    // 4. Send duplicate webhook
    const webhook2 = await sendWebhook("checkout.completed", order.billing_id);
    expect(webhook2.status).toBe(200);

    // 5. Count tickets again — should be same
    const ticketsAfter2 = await countTicketsForOrder(order.id);
    expect(ticketsAfter2).toBe(2); // NOT 4

    // 6. Verify only 1 email job was queued
    const emailJobs = await countPendingJobs("send_confirmation_email", order.id);
    expect(emailJobs).toBe(1);
  });

  it("does not double-void on duplicate checkout.lost", async () => {
    // Similar to above — verify quantity_sold only decremented once
  });

  it("rejects checkout.completed after checkout.lost (race prevention)", async () => {
    // Mark order as lost first, then try to complete
  });

  it("rejects checkout.lost after checkout.completed (race prevention)", async () => {
    // Mark order as paid first, then try to void
  });

  it("gracefully handles unknown billing_id", async () => {
    const res = await sendWebhook("checkout.completed", "non-existent-billing-id");
    expect(res.status).toBe(200); // Must ack, never 500
  });
});
```

### Helper Functions

Add these test helpers to support idempotency tests:

```typescript
async function createTestOrder(overrides = {}) {
  // Use seeded event + tier, call create_order_atomic directly
  // Return order with billing_id
}

async function countTicketsForOrder(orderId: string): Promise<number> {
  const { count } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  return count || 0;
}

async function countPendingJobs(jobType: string, orderId: string): Promise<number> {
  const { count } = await supabase
    .from("pending_jobs")
    .select("id", { count: "exact", head: true })
    .eq("job_type", jobType)
    .filter("payload->>order_id", "eq", orderId);
  return count || 0;
}

async function sendWebhook(event: string, billingId: string) {
  const payload = {
    event,
    data: {
      id: billingId,
      status: event === "checkout.completed" ? "paid" : "lost",
    },
  };
  const signature = await generateValidSignature(JSON.stringify(payload));
  
  return await runHandler("POST", "/api/webhooks/abacatepay", {
    body: payload,
    headers: { "x-abacatepay-signature": signature },
  });
}
```

---

## Verification Without Tests (Manual)

If the test infrastructure for DB RPCs isn't ready yet, verify idempotency manually:

```bash
# 1. Create a pending order via the API
curl -X POST https://ticket-app-beta-silk.vercel.app/api/checkout \
  -H "Content-Type: application/json" \
  -d '{...}'  # use known event + tier

# 2. Send webhook twice
curl -X POST https://ticket-app-beta-silk.vercel.app/api/webhooks/abacatepay \
  -H "Content-Type: application/json" \
  -H "x-abacatepay-signature: $(generate_signature)" \
  -d '{"event":"checkout.completed","data":{...}}'

# 3. Query tickets — should be same count after both calls
curl https://project.supabase.co/rest/v1/tickets?select=id&order_id=eq.ORDER_ID \
  -H "apikey: $ANON_KEY"
```

---

## Success Criteria

| Scenario | Expected | Critical for Launch? |
|----------|----------|---------------------|
| Duplicate `checkout.completed` | No duplicate tickets, no errors | **Yes** — will happen in production |
| Duplicate `checkout.lost` | No double-void, no errors | **Yes** — will happen in production |
| Completed vs Lost race | One wins, no inconsistent state | **Yes** — possible in production |
| Unknown billing_id | 200, no crash | **Yes** — AbacatePay expects 200 |
| All tests pass in CI | Suite green | — |