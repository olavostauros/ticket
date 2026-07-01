# Plan: Overselling Concurrency Test

> **Roadmap:** [#3 — Overselling Concurrency Test](../ROADMAP.md#3-🧪-overselling-concurrency-test)
> **Priority:** P0 — Launch Blocker
> **Effort:** ½ day

---

## Goal

Prove that the `SELECT ... FOR UPDATE` row-locking strategy prevents overselling when multiple attendees buy tickets for the same tier simultaneously. This is the **highest-risk failure mode** in the entire system — a bug here means real financial loss and angry organizers.

---

## The Risk

```text
Tier A: quantity_total = 5, quantity_sold = 0

Attendee 1: buys 3 tickets → checkout request #1 (t=0ms)
Attendee 2: buys 3 tickets → checkout request #2 (t=5ms)
                                (only 2 remaining, but both read 5)

Without locks: both succeed → 6 tickets sold out of 5 → OVERSELL ❌
With FOR UPDATE: request #2 blocks until #1 commits → sees 2 available → fails ✅
```

---

## Implementation

### Approach: Custom Node Script + Direct DB Assertions

Use the `create_order_atomic` RPC directly via Supabase's `rpc()` to simulate concurrent requests, bypassing the network layer for precise timing control.

**File to create:** `ticket-app/tests/e2e/overselling.test.ts`

### Test Setup

1. Seed the database with:
   - An organizer
   - An event (published)
   - A single tier with `quantity_total = 5`, `quantity_sold = 0`

2. Fire **10 concurrent** `create_order_atomic` RPC calls, each requesting 1 ticket

3. Wait for all to settle

4. Assert:
   - Exactly 5 RPC calls returned success
   - Exactly 5 RPC calls returned "insufficient capacity" error
   - `quantity_sold = 5` in the database
   - 5 orders created
   - 5 tickets generated

### Core Test Code

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Use service_role key for direct DB access
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("overselling prevention", () => {
  let organizerId: string;
  let eventId: string;
  let tierId: string;

  beforeAll(async () => {
    // Clean up any leftover data from previous runs
    await cleanup();

    // Seed organizer
    const { data: org } = await supabase
      .from("organizers")
      .insert({ email: "test@oversell.com", name: "Oversell Test" })
      .select("id")
      .single();
    organizerId = org!.id;

    // Seed event (published)
    const { data: evt } = await supabase
      .from("events")
      .insert({
        organizer_id: organizerId,
        title: "Oversell Test Event",
        slug: `oversell-test-${Date.now()}`,
        status: "published",
        start_at: "2026-09-01T20:00:00Z",
        end_at: "2026-09-02T02:00:00Z",
        timezone: "America/Sao_Paulo",
      })
      .select("id")
      .single();
    eventId = evt!.id;

    // Seed tier with quantity_total = 5
    const { data: tier } = await supabase
      .from("tiers")
      .insert({
        event_id: eventId,
        name: "General",
        price_cents: 2500,
        quantity_total: 5,
        quantity_sold: 0,
      })
      .select("id")
      .single();
    tierId = tier!.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  async function cleanup() {
    // Delete in dependency order
    await supabase.from("tickets").delete().eq("event_id", eventId);
    await supabase.from("order_items").delete().eq("event_id", eventId);
    await supabase.from("orders").delete().eq("event_id", eventId);
    await supabase.from("tiers").delete().eq("id", tierId);
    await supabase.from("events").delete().eq("id", eventId);
    await supabase.from("organizers").delete().eq("id", organizerId);
  }

  it("should not oversell under concurrent load", async () => {
    const CONCURRENT_REQUESTS = 10;
    const TIER_CAPACITY = 5;

    // Fire all RPC calls in parallel
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
        supabase.rpc("create_order_atomic", {
          p_event_id: eventId,
          p_organizer_id: organizerId,
          p_attendee_email: `attendee${i}@test.com`,
          p_attendee_name: `Attendee ${i}`,
          p_amount_cents: 2500,
          p_fee_cents: 125, // 5% of 2500
          p_abacatepay_fee_cents: 0,
          p_reference: `TCK-CONC-${Date.now()}-${i}`,
          p_idempotency_key: crypto.randomUUID(),
          p_items: [{ tier_id: tierId, tier_name: "General", quantity: 1, unit_price_cents: 2500 }],
          p_billing_id: `bill-conc-${i}`,
        })
      )
    );

    // Count successes vs failures
    const succeeded = results.filter((r) => r.status === "fulfilled" && r.value.data?.id).length;
    const failed = results.filter(
      (r) =>
        r.status === "rejected" ||
        (r.status === "fulfilled" && r.value.error?.message?.toLowerCase().includes("capacity"))
    ).length;

    // Verify exactly TIER_CAPACITY succeeded
    expect(succeeded).toBe(TIER_CAPACITY);
    // Verify the rest failed
    expect(failed).toBe(CONCURRENT_REQUESTS - TIER_CAPACITY);
    // Verify total successful = capacity
    expect(succeeded + failed).toBe(CONCURRENT_REQUESTS);

    // Verify the database reflects exactly TIER_CAPACITY sold
    const { data: tierAfter } = await supabase
      .from("tiers")
      .select("quantity_sold")
      .eq("id", tierId)
      .single();

    expect(tierAfter!.quantity_sold).toBe(TIER_CAPACITY);

    // Verify exactly TIER_CAPACITY orders exist
    const { count: orderCount } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "pending");

    expect(orderCount).toBe(TIER_CAPACITY);
  });
});
```

### Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | 10 concurrent requests for 1 ticket each, capacity=5 | 5 succeed, 5 fail, quantity_sold=5 |
| 2 | Same tier, same email (duplicate idempotency key) | 1 order created, 1 returned (idempotent) |
| 3 | Request for more than remaining (3 requested, 2 available) | RPC rolls back |
| 4 | Multiple tiers in one order, one oversold | Entire order rolls back |
| 5 | Zero-capacity tier (quantity_total = quantity_sold) | All requests fail |

---

## Running the Test

```bash
# Requires a real Supabase connection (mocked Supabase won't run RPCs)
cd ticket-app && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx vitest run tests/e2e/overselling.test.ts
```

If running against the production Supabase project, use a dedicated test schema or ensure cleanup runs after every test (see `afterAll` hook above).

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Overselling incidents | **Zero** across all test scenarios |
| All concurrent requests complete | No deadlocks, no hanging transactions |
| `quantity_sold <= quantity_total` | Always true (check constraint verification) |
| Idempotency preserved | Duplicate keys return existing order, not a new one |