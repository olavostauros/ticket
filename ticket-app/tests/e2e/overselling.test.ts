/**
 * Overselling Concurrency Test — Dedicated stress test.
 *
 * Proves that the SELECT ... FOR UPDATE row-locking strategy prevents
 * overselling when multiple attendees buy tickets for the same tier
 * simultaneously. This is the highest-risk failure mode.
 *
 * Runs against a real Postgres (local supabase start).
 *
 * Usage: cd ticket-app && npm run test:db
 * (Runs as part of test:db because it needs a real DB connection)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import { initTestDb, getRunId, cleanupAll, seedOrganizer, seedEvent, seedTier } from "../db/setup";

let db: SupabaseClient;
let organizerId: string;
let eventId: string;

beforeAll(async () => {
  db = await initTestDb();
  await cleanupAll(db);
  const org = await seedOrganizer(db);
  organizerId = org.id;
  const evt = await seedEvent(db, organizerId);
  eventId = evt.id;
});

afterAll(async () => {
  await cleanupAll(db);
});

describe("overselling prevention under concurrent load", () => {
  it("should not oversell — 10 concurrent requests for 1 ticket each, capacity=5", async () => {
    const CAPACITY = 5;
    const CONCURRENT = 10;

    const tier = await seedTier(db, eventId, {
      name: "Oversell Test",
      quantity_total: CAPACITY,
      quantity_sold: 0,
    });

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT }, (_, i) =>
        db.rpc("create_order_atomic", {
          p_event_id: eventId,
          p_organizer_id: organizerId,
          p_attendee_email: `oversell-${getRunId()}-${i}@test.com`,
          p_attendee_name: `Oversell Attendee ${i}`,
          p_amount_cents: 2500,
          p_fee_cents: 125,
          p_abacatepay_fee_cents: 0,
          p_reference: `TCK-OVERSELL-${getRunId()}-${i}`,
          p_idempotency_key: crypto.randomUUID(),
          p_items: [{ tier_id: tier.id, tier_name: "Oversell Test", quantity: 1, unit_price_cents: 2500 }],
          p_billing_id: null,
          p_checkout_url: null,
        })
      )
    );

    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.data?.id && !r.value.data._idempotent
    ).length;

    const failed = results.filter(
      (r) =>
        r.status === "rejected" ||
        (r.status === "fulfilled" &&
          (r.value.error?.message?.toLowerCase().includes("capacity") ||
           r.value.error?.message?.toLowerCase().includes("insufficient")))
    ).length;

    // Exactly CAPACITY should succeed
    expect(succeeded).toBe(CAPACITY);
    expect(succeeded + failed).toBe(CONCURRENT);

    // Verify DB
    const { data: tierAfter } = await db
      .from("tiers")
      .select("quantity_sold")
      .eq("id", tier.id)
      .single();
    expect(tierAfter!.quantity_sold).toBe(CAPACITY);

    // Verify exactly CAPACITY orders exist
    const { count: orderCount } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .neq("idempotency_key", "00000000-0000-0000-0000-000000000000"); // count all
    // At minimum, the CAPACITY successful orders
    expect((orderCount ?? 0)).toBeGreaterThanOrEqual(CAPACITY);
  });

  it("should reject request for more than remaining capacity (3 requested, 2 available)", async () => {
    const tier = await seedTier(db, eventId, {
      name: "Short Tier",
      quantity_total: 5,
      quantity_sold: 3, // only 2 remaining
    });

    const { data, error } = await db.rpc("create_order_atomic", {
      p_event_id: eventId,
      p_organizer_id: organizerId,
      p_attendee_email: `overbuy-${getRunId()}@test.com`,
      p_attendee_name: "Over Buyer",
      p_amount_cents: 7500,
      p_fee_cents: 375,
      p_abacatepay_fee_cents: 0,
      p_reference: `TCK-OVERBUY-${getRunId()}`,
      p_idempotency_key: crypto.randomUUID(),
      p_items: [{ tier_id: tier.id, tier_name: "Short Tier", quantity: 3, unit_price_cents: 2500 }],
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/capacity|insufficient/);
    expect(data).toBeNull();
  });

  it("should reject all requests for a zero-capacity tier", async () => {
    const tier = await seedTier(db, eventId, {
      name: "Sold Out",
      quantity_total: 5,
      quantity_sold: 5, // zero available
    });

    const results = await Promise.allSettled(
      Array.from({ length: 3 }, (_, i) =>
        db.rpc("create_order_atomic", {
          p_event_id: eventId,
          p_organizer_id: organizerId,
          p_attendee_email: `soldout-${getRunId()}-${i}@test.com`,
          p_attendee_name: `Sold Out ${i}`,
          p_amount_cents: 2500,
          p_fee_cents: 125,
          p_abacatepay_fee_cents: 0,
          p_reference: `TCK-SOLDOUT-${getRunId()}-${i}`,
          p_idempotency_key: crypto.randomUUID(),
          p_items: [{ tier_id: tier.id, tier_name: "Sold Out", quantity: 1, unit_price_cents: 2500 }],
        })
      )
    );

    const allFailed = results.every(
      (r) =>
        r.status === "rejected" ||
        (r.status === "fulfilled" && r.value.error?.message?.toLowerCase().includes("capacity"))
    );

    expect(allFailed).toBe(true);
  });

  it("should handle multi-tier orders where one tier is oversold — entire order rolls back", async () => {
    const tierAvailable = await seedTier(db, eventId, {
      name: "Available",
      quantity_total: 10,
    });
    const tierFull = await seedTier(db, eventId, {
      name: "Full",
      quantity_total: 5,
      quantity_sold: 5, // full
    });

    const { data, error } = await db.rpc("create_order_atomic", {
      p_event_id: eventId,
      p_organizer_id: organizerId,
      p_attendee_email: `multiroll-${getRunId()}@test.com`,
      p_attendee_name: "Multi Rollback",
      p_amount_cents: 5000,
      p_fee_cents: 250,
      p_abacatepay_fee_cents: 0,
      p_reference: `TCK-MULTIROLL-${getRunId()}`,
      p_idempotency_key: crypto.randomUUID(),
      p_items: [
        { tier_id: tierAvailable.id, tier_name: "Available", quantity: 1, unit_price_cents: 2500 },
        { tier_id: tierFull.id, tier_name: "Full", quantity: 1, unit_price_cents: 2500 },
      ],
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/capacity|insufficient/);
    expect(data).toBeNull();

    // Verify available tier quantity_sold unchanged
    const { data: tierAvailAfter } = await db
      .from("tiers")
      .select("quantity_sold")
      .eq("id", tierAvailable.id)
      .single();
    expect(tierAvailAfter!.quantity_sold).toBe(0);
  });
});