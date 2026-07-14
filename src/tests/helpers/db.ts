/**
 * DB helpers for integration tests (Tier 4 — planned).
 *
 * These functions seed known data into a real PostgreSQL database
 * and tear it down between test runs.
 *
 * Prerequisites:
 *   - A `docker compose.test.yml` with a test-only database
 *   - `DATABASE_URL` pointing to that database
 *
 * Usage (in a describe/it block):
 *   import { seed, teardown } from "../helpers/db";
 *
 *   beforeAll(async () => { await seed(); });
 *   afterEach(async () => { await teardown(); });
 */

import type { Organizer, Event, Tier, Registration } from "../../lib/types";

// ─── Seed helpers ────────────────────────────────────────────────

export interface SeedData {
  organizer: Organizer;
  events: Event[];
  tiers: Tier[];
  registrations: Registration[];
}

/**
 * Insert seed data into the real test database.
 * Returns the created entities for use in assertions.
 *
 * @param data - Override defaults for specific test scenarios.
 */
export async function seed(data?: Partial<SeedData>): Promise<SeedData> {
  // TODO(Tier 4): Implement when integration test tier is built.
  // Use `await query(...)` from lib/db to INSERT known data.
  // Return the created rows.
  void data;
  throw new Error("Integration test helpers not yet implemented — see TESTING.md Tier 4");
}

/**
 * Clean all test data from the database.
 * Truncates all tables in dependency order (children first).
 */
export async function teardown(): Promise<void> {
  // TODO(Tier 4): Implement when integration test tier is built.
  // Use `await query("TRUNCATE checkins, tickets, order_items, orders, tiers, events, organizers CASCADE")`
  throw new Error("Integration test helpers not yet implemented — see TESTING.md Tier 4");
}