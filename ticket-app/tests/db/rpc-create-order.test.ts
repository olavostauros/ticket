/**
 * Tests for create_order_atomic RPC function.
 *
 * Runs against a real Postgres (local supabase start).
 * Environment: SUPABASE_TEST_URL or falls back to localhost:54321
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initTestDb, getRunId, cleanupAll, seedOrganizer, seedEvent, seedTier } from "./setup";
import type { SupabaseClient } from "@supabase/supabase-js";

let db: SupabaseClient;
let organizerId: string;
let eventId: string;
let tier: Awaited<ReturnType<typeof seedTier>>;

beforeAll(async () => {
  db = await initTestDb();
  await cleanupAll(db);
  const org = await seedOrganizer(db);
  organizerId = org.id;
  const evt = await seedEvent(db, organizerId);
  eventId = evt.id;
  tier = await seedTier(db, eventId, { quantity_total: 10 });
});

afterAll(async () => {
  await cleanupAll(db);
});

function makeItems(tierId: string, quantity: number = 1) {
  return [{ tier_id: tierId, tier_name: "General", quantity, unit_price_cents: 2500 }];
}

describe("create_order_atomic — happy path", () => {
  it("creates an order for a single tier, single item", async () => {
    const { data, error } = await db.rpc("create_order_atomic", {
      p_event_id: eventId,
      p_organizer_id: organizerId,
      p_attendee_email: `happy1-${getRunId()}@test.com`,
      p_attendee_name: "Happy Buyer",
      p_amount_cents: 2500,
      p_fee_cents: 125,
      p_abacatepay_fee_cents: 0,
      p_reference: `TCK-H1-${getRunId()}-1`,
      p_idempotency_key: crypto.randomUUID(),
      p_items: makeItems(tier.id, 1),
      p_billing_id: null,
      p_checkout_url: null,
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data._idempotent).toBe(false);
    expect(data.status).toBe("pending");
    expect(data.attendee_email).toMatch(/happy1.*@test\.com/);
  });

  it("creates an order for a single tier, multiple items (qty=3)", async () => {
    const { data, error } = await db.rpc("create_order_atomic", {
      p_event_id: eventId,
      p_organizer_id: organizerId,
      p_attendee_email: `happy3-${getRunId()}@test.com`,
      p_attendee_name: "Bulk Buyer",
      p_amount_cents: 7500,
      p_fee_cents: 375,
      p_abacatepay_fee_cents: 0,
      p_reference: `TCK-H3-${getRunId()}-1`,
      p_idempotency_key: crypto.randomUUID(),
      p_items: makeItems(tier.id, 3),
    });

    expect(error).toBeNull();
    expect(data._idempotent).toBe(false);
  });

  it("returns idempotent result when same key is used twice", async () => {
    const idempotencyKey = crypto.randomUUID();
    const ref = `TCK-IDEM-${getRunId()}-1`;

    // First call
    const { data: first } = await db.rpc("create_order_atomic", {
      p_event_id: eventId,
      p_organizer_id: organizerId,
      p_attendee_email: `idem-${getRunId()}@test.com`,
      p_attendee_name: "Idempotent Buyer",
      p_amount_cents: 2500,
      p_fee_cents: 125,
      p_abacatepay_fee_cents: 0,
      p_reference: ref,
      p_idempotency_key: idempotencyKey,
      p_items: makeItems(tier.id, 1),
    });
    expect(first._idempotent).toBe(false);

    // Second call with same key
    const { data: second, error: secondErr } = await db.rpc("create_order_atomic", {
      p_event_id: eventId,
      p_organizer_id: organizerId,
      p_attendee_email: `idem-${getRunId()}@test.com`,
      p_attendee_name: "Idempotent Buyer",
      p_amount_cents: 2500,
      p_fee_cents: 125,
      p_abacatepay_fee_cents: 0,
      p_reference: ref,
      p_idempotency_key: idempotencyKey,
      p_items: makeItems(tier.id, 1),
    });

    expect(secondErr).toBeNull();
    expect(second._idempotent).toBe(true);
    expect(second.id).toBe(first.id);
  });
});

describe("create_order_atomic — error cases", () => {
  it("rejects insufficient capacity", async () => {
    // Create a tier with only 2 remaining slots
    const smallTier = await seedTier(db, eventId, { name: "Limited", quantity_total: 2, quantity_sold: 2 });

    const { error } = await db.rpc("create_order_atomic", {
      p_event_id: eventId,
      p_organizer_id: organizerId,
      p_attendee_email: `over-${getRunId()}@test.com`,
      p_attendee_name: "Over Buyer",
      p_amount_cents: 2500,
      p_fee_cents: 125,
      p_abacatepay_fee_cents: 0,
      p_reference: `TCK-OVER-${getRunId()}`,
      p_idempotency_key: crypto.randomUUID(),
      p_items: makeItems(smallTier.id, 1),
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/capacity|insufficient/);
  });

  it("rejects zero-capacity tier", async () => {
    const zeroTier = await seedTier(db, eventId, {
      name: "SoldOut",
      quantity_total: 1,
      quantity_sold: 1,
    });

    const { error } = await db.rpc("create_order_atomic", {
      p_event_id: eventId,
      p_organizer_id: organizerId,
      p_attendee_email: `zero-${getRunId()}@test.com`,
      p_attendee_name: "Zero Buyer",
      p_amount_cents: 2500,
      p_fee_cents: 125,
      p_abacatepay_fee_cents: 0,
      p_reference: `TCK-ZERO-${getRunId()}`,
      p_idempotency_key: crypto.randomUUID(),
      p_items: makeItems(zeroTier.id, 1),
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/capacity|insufficient/);
  });

  it("rejects invalid tier_id (non-existent UUID)", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const { error } = await db.rpc("create_order_atomic", {
      p_event_id: eventId,
      p_organizer_id: organizerId,
      p_attendee_email: `fake-${getRunId()}@test.com`,
      p_attendee_name: "Fake Buyer",
      p_amount_cents: 2500,
      p_fee_cents: 125,
      p_abacatepay_fee_cents: 0,
      p_reference: `TCK-FAKE-${getRunId()}`,
      p_idempotency_key: crypto.randomUUID(),
      p_items: makeItems(fakeId, 1),
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/tier not found/);
  });

  it("rejects when event is in draft status", async () => {
    const draftEvent = await seedEvent(db, organizerId, {
      title: "Draft Event",
      status: "draft",
    });

    const draftTier = await seedTier(db, draftEvent.id, { quantity_total: 10 });

    const { error } = await db.rpc("create_order_atomic", {
      p_event_id: draftEvent.id,
      p_organizer_id: organizerId,
      p_attendee_email: `draft-${getRunId()}@test.com`,
      p_attendee_name: "Draft Buyer",
      p_amount_cents: 2500,
      p_fee_cents: 125,
      p_abacatepay_fee_cents: 0,
      p_reference: `TCK-DRAFT-${getRunId()}`,
      p_idempotency_key: crypto.randomUUID(),
      p_items: makeItems(draftTier.id, 1),
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/not found|not available/);
  });

  it("rejects when event is canceled", async () => {
    const canceledEvent = await seedEvent(db, organizerId, {
      title: "Canceled Event",
      status: "canceled",
    });

    const cancelTier = await seedTier(db, canceledEvent.id, { quantity_total: 10 });

    const { error } = await db.rpc("create_order_atomic", {
      p_event_id: canceledEvent.id,
      p_organizer_id: organizerId,
      p_attendee_email: `cancel-${getRunId()}@test.com`,
      p_attendee_name: "Cancel Buyer",
      p_amount_cents: 2500,
      p_fee_cents: 125,
      p_abacatepay_fee_cents: 0,
      p_reference: `TCK-CANCEL-${getRunId()}`,
      p_idempotency_key: crypto.randomUUID(),
      p_items: makeItems(cancelTier.id, 1),
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/not found|not available/);
  });

  it("rejects tier belonging to a different event", async () => {
    const otherEvent = await seedEvent(db, organizerId, {
      title: "Other Event",
      status: "published",
    });
    const otherTier = await seedTier(db, otherEvent.id, { quantity_total: 10 });

    const { error } = await db.rpc("create_order_atomic", {
      p_event_id: eventId, // <-- original event, not otherEvent
      p_organizer_id: organizerId,
      p_attendee_email: `cross-${getRunId()}@test.com`,
      p_attendee_name: "Cross Buyer",
      p_amount_cents: 2500,
      p_fee_cents: 125,
      p_abacatepay_fee_cents: 0,
      p_reference: `TCK-CROSS-${getRunId()}`,
      p_idempotency_key: crypto.randomUUID(),
      p_items: makeItems(otherTier.id, 1),
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/tier not found/);
  });
});

describe("create_order_atomic — concurrency", () => {
  it("allows exactly capacity number of concurrent requests to succeed", async () => {
    const capacity = 5;
    const concurrent = 10;
    const concurrencyTier = await seedTier(db, eventId, {
      name: "Concurrency Test",
      quantity_total: capacity,
    });

    const results = await Promise.allSettled(
      Array.from({ length: concurrent }, (_, i) =>
        db.rpc("create_order_atomic", {
          p_event_id: eventId,
          p_organizer_id: organizerId,
          p_attendee_email: `conc-${getRunId()}-${i}@test.com`,
          p_attendee_name: `Concurrent ${i}`,
          p_amount_cents: 2500,
          p_fee_cents: 125,
          p_abacatepay_fee_cents: 0,
          p_reference: `TCK-CONC-${getRunId()}-${i}`,
          p_idempotency_key: crypto.randomUUID(),
          p_items: makeItems(concurrencyTier.id, 1),
        })
      )
    );

    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.data?.id
    ).length;
    const failed = results.filter(
      (r) =>
        r.status === "rejected" ||
        (r.status === "fulfilled" && r.value.error?.message?.toLowerCase().includes("capacity"))
    ).length;

    expect(succeeded).toBe(capacity);
    expect(failed).toBe(concurrent - capacity);

    // Verify DB reflects exact capacity sold
    const { data: tierAfter } = await db
      .from("tiers")
      .select("quantity_sold")
      .eq("id", concurrencyTier.id)
      .single();

    expect(tierAfter!.quantity_sold).toBe(capacity);
  });
});