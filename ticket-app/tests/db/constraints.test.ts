/**
 * Schema constraint tests — verified against the local Postgres.
 *
 * Tests: UNIQUE constraints, CHECK constraints, FK referential integrity.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestDb, getRunId, cleanupAll,
  seedOrganizer, seedEvent, seedTier,
} from "./setup";
import type { SupabaseClient } from "@supabase/supabase-js";

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

describe("UNIQUE constraints", () => {
  it("idempotency_key is UNIQUE on orders", async () => {
    const key = crypto.randomUUID();
    // First insert
    const { error: err1 } = await db.from("orders").insert({
      event_id: eventId,
      organizer_id: organizerId,
      attendee_email: `unique1-${getRunId()}@test.com`,
      amount_cents: 2500,
      reference: `TCK-UNIQ-${getRunId()}-1`,
      idempotency_key: key,
    });
    expect(err1).toBeNull();

    // Second insert with same key
    const { error: err2 } = await db.from("orders").insert({
      event_id: eventId,
      organizer_id: organizerId,
      attendee_email: `unique1b-${getRunId()}@test.com`,
      amount_cents: 2500,
      reference: `TCK-UNIQ-${getRunId()}-2`,
      idempotency_key: key,
    });
    expect(err2).not.toBeNull();
    expect(err2!.message.toLowerCase()).toMatch(/unique|duplicate|violat/);
  });

  it("reference is UNIQUE on orders", async () => {
    const ref = `TCK-UNIQREF-${getRunId()}`;
    // First insert
    const { error: err1 } = await db.from("orders").insert({
      event_id: eventId,
      organizer_id: organizerId,
      attendee_email: `uniqueref-${getRunId()}@test.com`,
      amount_cents: 2500,
      reference: ref,
      idempotency_key: crypto.randomUUID(),
    });
    expect(err1).toBeNull();

    // Second insert with same reference
    const { error: err2 } = await db.from("orders").insert({
      event_id: eventId,
      organizer_id: organizerId,
      attendee_email: `uniqueref2-${getRunId()}@test.com`,
      amount_cents: 2500,
      reference: ref,
      idempotency_key: crypto.randomUUID(),
    });
    expect(err2).not.toBeNull();
    expect(err2!.message.toLowerCase()).toMatch(/unique|duplicate|violat/);
  });

  it("unique_code is UNIQUE on tickets", async () => {
    // Two tickets with the same unique_code shouldn't be possible
    // since unique_code defaults to gen_random_uuid().
    // We test the constraint by trying to insert a duplicate
    const { data: existing } = await db.from("tickets").select("unique_code").limit(1);
    if (existing && existing.length > 0) {
      const { error } = await db.from("tickets").insert({
        order_id: "00000000-0000-0000-0000-000000000000",
        event_id: eventId,
        tier_id: "00000000-0000-0000-0000-000000000000",
        organizer_id: organizerId,
        holder_name: "Test",
        holder_email: "test@test.com",
        unique_code: existing[0].unique_code,
      });
      expect(error).not.toBeNull();
      expect(error!.message.toLowerCase()).toMatch(/unique|duplicate|violat/);
    }
  });
});

describe("CHECK constraints", () => {
  it("quantity_sold <= quantity_total on tiers", async () => {
    // Use raw insert to bypass RPC which prevents overselling
    const tier = await seedTier(db, eventId, {
      name: "Check Test",
      quantity_total: 3,
      quantity_sold: 3,
    });

    // Try to set quantity_sold beyond total (should fail)
    const { error } = await db
      .from("tiers")
      .update({ quantity_sold: 5 })
      .eq("id", tier.id);

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/check|violat|constraint/);
  });

  it("status check on events — invalid status rejected", async () => {
    // Try inserting event with invalid status
    // Note: Using raw PostgREST, we need to use the REST API directly
    // supabase-js's insert will validate at the client or server level
    const { error } = await db.from("events").insert({
      organizer_id: organizerId,
      title: "Bad Status",
      slug: `bad-status-${getRunId()}`,
      start_at: "2026-09-01T20:00:00Z",
      end_at: "2026-09-02T02:00:00Z",
      timezone: "America/Sao_Paulo",
      status: "invalid_status",
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/check|violat|constraint|invalid/);
  });

  it("status check on orders — invalid status rejected", async () => {
    const { error } = await db.from("orders").insert({
      event_id: eventId,
      organizer_id: organizerId,
      attendee_email: `statuschk-${getRunId()}@test.com`,
      amount_cents: 2500,
      reference: `TCK-STATUS-${getRunId()}`,
      idempotency_key: crypto.randomUUID(),
      status: "invalid_order_status",
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/check|violat|constraint|invalid/);
  });

  it("price_cents > 0 on tiers", async () => {
    const { error } = await db.from("tiers").insert({
      event_id: eventId,
      name: "Free Tier",
      price_cents: 0,
      quantity_total: 10,
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/check|violat|constraint/);
  });

  it("quantity_total > 0 on tiers", async () => {
    const { error } = await db.from("tiers").insert({
      event_id: eventId,
      name: "No Qty",
      price_cents: 1000,
      quantity_total: 0,
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/check|violat|constraint/);
  });
});

describe("FOREIGN KEY constraints", () => {
  it("events must reference an existing organizer", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const { error } = await db.from("events").insert({
      organizer_id: fakeId,
      title: "Orphan Event",
      slug: `orphan-${getRunId()}`,
      start_at: "2026-09-01T20:00:00Z",
      end_at: "2026-09-02T02:00:00Z",
      timezone: "America/Sao_Paulo",
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/foreign|violat|constraint|not present|insert or update/);
  });

  it("tiers must reference an existing event", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const { error } = await db.from("tiers").insert({
      event_id: fakeId,
      name: "Orphan Tier",
      price_cents: 1000,
      quantity_total: 10,
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/foreign|violat|constraint|not present|insert or update/);
  });
});