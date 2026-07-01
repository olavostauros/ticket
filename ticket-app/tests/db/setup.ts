/**
 * DB RPC Test Setup — helpers for seeding/cleaning test data.
 *
 * All tests connect to a real Postgres (local supabase start) via
 * @supabase/supabase-js with the service_role key so they can bypass RLS.
 *
 * Environment variables:
 *   SUPABASE_TEST_URL    — Direct Postgres connection string (optional)
 *   NEXT_PUBLIC_SUPABASE_URL — Supabase REST API URL (fallback)
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, afterAll } from "vitest";

let supabase: SupabaseClient;

// Unique test run identifier to avoid collisions across parallel runs
const RUN_ID = Date.now().toString(36);

export function getRunId(): string {
  return RUN_ID;
}

export function getSupabase(): SupabaseClient {
  if (!supabase) throw new Error("DB not initialized. Run initTestDb() first.");
  return supabase;
}

export async function initTestDb(): Promise<SupabaseClient> {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

  supabase = createClient(url, key);
  return supabase;
}

// =========================================================================
// Seed helpers — each returns the created entity ID
// =========================================================================

export async function seedOrganizer(
  db: SupabaseClient,
  overrides: Partial<{ email: string; name: string }> = {}
) {
  const email = overrides.email || `org-${RUN_ID}@test.com`;
  const name = overrides.name || "Test Organizer";
  const { data, error } = await db
    .from("organizers")
    .insert({ email, name, pix_key: "12345678900", pix_key_type: "cpf" })
    .select("id")
    .single();
  if (error) throw new Error(`seedOrganizer: ${error.message}`);
  return { id: data.id, email, name };
}

export async function seedEvent(
  db: SupabaseClient,
  organizerId: string,
  overrides: Partial<{ title: string; status: string; slug: string }> = {}
) {
  const slug = overrides.slug || `event-${RUN_ID}-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await db
    .from("events")
    .insert({
      organizer_id: organizerId,
      title: overrides.title || "Test Event",
      slug,
      description: "A test event",
      venue_name: "Test Venue",
      venue_address: "123 Test St",
      start_at: "2026-09-01T20:00:00Z",
      end_at: "2026-09-02T02:00:00Z",
      timezone: "America/Sao_Paulo",
      status: overrides.status || "published",
    })
    .select("id, slug, organizer_id, status")
    .single();
  if (error) throw new Error(`seedEvent: ${error.message}`);
  return data;
}

export async function seedTier(
  db: SupabaseClient,
  eventId: string,
  overrides: Partial<{
    name: string;
    price_cents: number;
    quantity_total: number;
    quantity_sold: number;
  }> = {}
) {
  const { data, error } = await db
    .from("tiers")
    .insert({
      event_id: eventId,
      name: overrides.name || "General",
      price_cents: overrides.price_cents ?? 2500,
      quantity_total: overrides.quantity_total ?? 100,
      quantity_sold: overrides.quantity_sold ?? 0,
    })
    .select("id, name, price_cents, quantity_total, quantity_sold, event_id")
    .single();
  if (error) throw new Error(`seedTier: ${error.message}`);
  return data;
}

export async function seedOrder(
  db: SupabaseClient,
  eventId: string,
  organizerId: string,
  overrides: Partial<{
    attendee_email: string;
    attendee_name: string;
    status: string;
    reference: string;
    idempotency_key: string;
    amount_cents: number;
    fee_cents: number;
  }> = {}
) {
  const ref = overrides.reference || `TCK-TEST-${RUN_ID}-${crypto.randomUUID().slice(0, 8)}`;
  const ik = overrides.idempotency_key || crypto.randomUUID();
  const { data, error } = await db
    .from("orders")
    .insert({
      event_id: eventId,
      organizer_id: organizerId,
      attendee_email: overrides.attendee_email || `attendee-${RUN_ID}@test.com`,
      attendee_name: overrides.attendee_name || "Test Attendee",
      amount_cents: overrides.amount_cents ?? 2500,
      fee_cents: overrides.fee_cents ?? 125,
      abacatepay_fee_cents: 0,
      reference: ref,
      idempotency_key: ik,
      status: overrides.status || "pending",
    })
    .select("id, reference, status, idempotency_key, event_id, organizer_id, attendee_email, attendee_name, amount_cents")
    .single();
  if (error) throw new Error(`seedOrder: ${error.message}`);
  return data;
}

export async function seedOrderItem(
  db: SupabaseClient,
  orderId: string,
  tierId: string,
  tierName: string,
  quantity: number = 1,
  unitPriceCents: number = 2500
) {
  const { data, error } = await db
    .from("order_items")
    .insert({
      order_id: orderId,
      tier_id: tierId,
      tier_name: tierName,
      quantity,
      unit_price_cents: unitPriceCents,
    })
    .select("id, quantity, tier_id")
    .single();
  if (error) throw new Error(`seedOrderItem: ${error.message}`);
  return data;
}

export async function seedTicket(
  db: SupabaseClient,
  orderId: string,
  eventId: string,
  tierId: string,
  organizerId: string,
  overrides: Partial<{ holder_email: string; checked_in_at: string | null }> = {}
) {
  // We can't set unique_code, but we can set checked_in_at
  const { data, error } = await db
    .from("tickets")
    .insert({
      order_id: orderId,
      event_id: eventId,
      tier_id: tierId,
      organizer_id: organizerId,
      holder_name: "Test Holder",
      holder_email: overrides.holder_email || `holder-${RUN_ID}@test.com`,
      checked_in_at: overrides.checked_in_at || null,
    })
    .select("id, unique_code, checked_in_at, event_id, tier_id")
    .single();
  if (error) throw new Error(`seedTicket: ${error.message}`);
  return data;
}

// =========================================================================
// Cleanup — delete all test data for this run
// =========================================================================

const TABLES_IN_DELETE_ORDER = [
  "check_ins",
  "tickets",
  "order_items",
  "pending_jobs",
  "orders",
  "tiers",
  "events",
  "organizers",
];

export async function cleanupAll(db: SupabaseClient) {
  for (const table of TABLES_IN_DELETE_ORDER) {
    const { error } = await db.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000"); // delete all
    if (error) {
      console.warn(`cleanup: ${table} — ${error.message}`);
    }
  }
}