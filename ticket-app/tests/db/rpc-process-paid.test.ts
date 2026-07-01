/**
 * Tests for process_paid_order_atomic RPC function.
 *
 * Validates: order → paid, ticket generation, email job enqueue, idempotency.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestDb, getRunId, cleanupAll,
  seedOrganizer, seedEvent, seedTier, seedOrder, seedOrderItem,
} from "./setup";
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
  tier = await seedTier(db, eventId, { quantity_total: 100 });
});

afterAll(async () => {
  await cleanupAll(db);
});

describe("process_paid_order_atomic — happy path", () => {
  it("flips a pending order to paid and generates tickets", async () => {
    const order = await seedOrder(db, eventId, organizerId, {
      attendee_email: `process1-${getRunId()}@test.com`,
    });
    await seedOrderItem(db, order.id, tier.id, "General", 2, 2500);

    const { data, error } = await db.rpc("process_paid_order_atomic", {
      p_reference: order.reference,
      p_billing_id: `bill-${getRunId()}-1`,
    });

    expect(error).toBeNull();
    expect(data._idempotent).toBe(false);
    expect(data.ticket_count).toBe(2);
    expect(data.tickets).toHaveLength(2);
    expect(data.attendee_email).toBe(order.attendee_email);

    // Verify order status in DB
    const { data: updatedOrder } = await db
      .from("orders")
      .select("status")
      .eq("id", order.id)
      .single();
    expect(updatedOrder!.status).toBe("paid");

    // Verify tickets created
    const { data: tickets } = await db
      .from("tickets")
      .select("id")
      .eq("order_id", order.id);
    expect(tickets).toHaveLength(2);

    // Verify pending_jobs created
    const { data: jobs } = await db
      .from("pending_jobs")
      .select("job_type, payload")
      .eq("job_type", "send_confirmation_email");
    expect(jobs!.length).toBeGreaterThanOrEqual(1);
    const emailJob = jobs!.find((j) =>
      j.payload?.order_reference === order.reference
    );
    expect(emailJob).toBeDefined();
    expect(emailJob!.payload.attendee_email).toBe(order.attendee_email);
  });

  it("generates correct ticket count for multi-tier order", async () => {
    const tierVip = await seedTier(db, eventId, {
      name: "VIP",
      price_cents: 5000,
      quantity_total: 50,
    });

    const order = await seedOrder(db, eventId, organizerId, {
      attendee_email: `multi-${getRunId()}@test.com`,
      amount_cents: 2500 * 2 + 5000 * 3,
      fee_cents: 425,
    });
    await seedOrderItem(db, order.id, tier.id, "General", 2, 2500);
    await seedOrderItem(db, order.id, tierVip.id, "VIP", 3, 5000);

    const { data, error } = await db.rpc("process_paid_order_atomic", {
      p_reference: order.reference,
      p_billing_id: `bill-${getRunId()}-multi`,
    });

    expect(error).toBeNull();
    expect(data.ticket_count).toBe(5); // 2 + 3
    expect(data.tickets).toHaveLength(5);
  });
});

describe("process_paid_order_atomic — error / idempotency", () => {
  it("is idempotent for already-paid orders", async () => {
    const order = await seedOrder(db, eventId, organizerId, {
      attendee_email: `idemp-${getRunId()}@test.com`,
      status: "paid",
    });
    await seedOrderItem(db, order.id, tier.id, "General", 1, 2500);

    const { data, error } = await db.rpc("process_paid_order_atomic", {
      p_reference: order.reference,
      p_billing_id: `bill-${getRunId()}-idemp`,
    });

    expect(error).toBeNull();
    expect(data._idempotent).toBe(true);
  });

  it("rejects unknown reference", async () => {
    const { error } = await db.rpc("process_paid_order_atomic", {
      p_reference: `NONEXISTENT-${getRunId()}`,
      p_billing_id: `bill-${getRunId()}-unknown`,
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/not found/);
  });

  // ⚠️ Potential bug: the RPC does not explicitly guard against expired/lost orders.
  // It currently flips them to paid regardless of current status (as long as it's not already 'paid').
  // This test documents the current behavior. A future fix should add:
  //   IF v_order.status != 'pending' THEN RAISE EXCEPTION 'Order is not pending'; END IF;
  it("processes expired orders (current behavior — no guard exists)", async () => {
    const order = await seedOrder(db, eventId, organizerId, {
      attendee_email: `expired-${getRunId()}@test.com`,
      status: "expired",
    });
    await seedOrderItem(db, order.id, tier.id, "General", 1, 2500);

    const { data, error } = await db.rpc("process_paid_order_atomic", {
      p_reference: order.reference,
      p_billing_id: `bill-${getRunId()}-expired`,
    });

    // Currently succeeds — flips expired to paid
    expect(error).toBeNull();
    expect(data._idempotent).toBe(false);
  });

  it("processes lost orders (current behavior — no guard exists)", async () => {
    const order = await seedOrder(db, eventId, organizerId, {
      attendee_email: `lost-${getRunId()}@test.com`,
      status: "lost",
    });
    await seedOrderItem(db, order.id, tier.id, "General", 1, 2500);

    const { data, error } = await db.rpc("process_paid_order_atomic", {
      p_reference: order.reference,
      p_billing_id: `bill-${getRunId()}-lost`,
    });

    // Currently succeeds — flips lost to paid
    expect(error).toBeNull();
    expect(data._idempotent).toBe(false);
  });
});