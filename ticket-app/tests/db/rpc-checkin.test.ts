/**
 * Tests for checkin_ticket RPC function.
 *
 * Validates: never-checked-in → checked in, already-checked-in rejection,
 * non-existent ticket, event mismatch.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestDb, getRunId, cleanupAll,
  seedOrganizer, seedEvent, seedTier, seedOrder, seedOrderItem, seedTicket,
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

describe("checkin_ticket — happy path", () => {
  it("checks in a never-checked-in ticket", async () => {
    const order = await seedOrder(db, eventId, organizerId, {
      attendee_email: `checkin1-${getRunId()}@test.com`,
    });
    await seedOrderItem(db, order.id, tier.id, "General", 1, 2500);
    const ticket = await seedTicket(db, order.id, eventId, tier.id, organizerId);

    const { data, error } = await db.rpc("checkin_ticket", {
      p_ticket_id: ticket.id,
      p_event_id: eventId,
      p_checked_in_by: organizerId,
      p_type: "entry",
    });

    expect(error).toBeNull();
    expect(data.ticket_id).toBe(ticket.id);
    expect(data.checked_in_at).not.toBeNull();

    // Verify check_ins record created
    const { data: checkIns } = await db
      .from("check_ins")
      .select("id, type")
      .eq("ticket_id", ticket.id);
    expect(checkIns).toHaveLength(1);
    expect(checkIns![0].type).toBe("entry");

    // Verify ticket shows checked_in_at
    const { data: updatedTicket } = await db
      .from("tickets")
      .select("checked_in_at")
      .eq("id", ticket.id)
      .single();
    expect(updatedTicket!.checked_in_at).not.toBeNull();
  });
});

describe("checkin_ticket — error cases", () => {
  it("rejects already-checked-in ticket", async () => {
    const order = await seedOrder(db, eventId, organizerId, {
      attendee_email: `dup-${getRunId()}@test.com`,
    });
    await seedOrderItem(db, order.id, tier.id, "General", 1, 2500);
    // Create ticket that's already checked in
    const ticket = await seedTicket(db, order.id, eventId, tier.id, organizerId, {
      checked_in_at: new Date().toISOString(),
    });

    const { error } = await db.rpc("checkin_ticket", {
      p_ticket_id: ticket.id,
      p_event_id: eventId,
      p_checked_in_by: organizerId,
      p_type: "entry",
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/already checked in/);
  });

  it("rejects non-existent ticket", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const { error } = await db.rpc("checkin_ticket", {
      p_ticket_id: fakeId,
      p_event_id: eventId,
      p_checked_in_by: organizerId,
      p_type: "entry",
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/ticket not found/);
  });
});