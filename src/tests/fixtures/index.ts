/**
 * Test data factories — shared fixtures for all test tiers.
 *
 * Each factory returns a complete entity with sensible defaults.
 * Override any field by passing partial overrides.
 *
 * Usage:
 *   import { buildOrganizer, buildEvent, buildTier } from "../fixtures";
 *
 *   const organizer = buildOrganizer({ email: "test@example.com" });
 *   const event = buildEvent({ organizer_id: organizer.id });
 */

import type {
  Organizer,
  Event,
  EventWithTiers,
  Tier,
  Registration,
  Ticket,
  CheckIn,
} from "../../lib/types";

// ─── Organizer ───────────────────────────────────────────────────

let _orgCounter = 0;

export function buildOrganizer(overrides: Partial<Organizer> = {}): Organizer {
  _orgCounter++;
  const id = overrides.id ?? `org-${_orgCounter}`;
  return {
    id,
    email: `organizer${_orgCounter}@example.com`,
    name: `Organizer ${_orgCounter}`,
    avatar_url: null,
    verified_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── Event ───────────────────────────────────────────────────────

let _eventCounter = 0;

export function buildEvent(overrides: Partial<Event> = {}): Event {
  _eventCounter++;
  const id = overrides.id ?? `event-${_eventCounter}`;
  return {
    id,
    organizer_id: "org-1",
    title: `Event ${_eventCounter}`,
    slug: `event-${_eventCounter}`,
    description: null,
    venue_name: null,
    venue_address: null,
    start_at: "2026-06-01T18:00:00Z",
    end_at: "2026-06-01T23:00:00Z",
    timezone: "America/Sao_Paulo",
    cover_image_url: null,
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function buildEventWithTiers(overrides: Partial<EventWithTiers> = {}): EventWithTiers {
  const base = buildEvent(overrides);
  return {
    ...base,
    tiers: overrides.tiers ?? [buildTier({ event_id: base.id })],
    ...overrides,
  };
}

// ─── Tier ────────────────────────────────────────────────────────

let _tierCounter = 0;

export function buildTier(overrides: Partial<Tier> = {}): Tier {
  _tierCounter++;
  const id = overrides.id ?? `tier-${_tierCounter}`;
  return {
    id,
    event_id: "event-1",
    name: `Tier ${_tierCounter}`,
    description: null,
    quantity_total: 100,
    quantity_sold: 0,
    sale_start_at: null,
    sale_end_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── Registration (replaces Order) ──────────────────────────────

let _regCounter = 0;

export function buildRegistration(overrides: Partial<Registration> = {}): Registration {
  _regCounter++;
  const id = overrides.id ?? `reg-${_regCounter}`;
  return {
    id,
    event_id: "event-1",
    organizer_id: "org-1",
    attendee_email: "attendee@example.com",
    attendee_name: null,
    status: "confirmed",
    reference: `REG-${id.toUpperCase().replace(/-/g, "").slice(0, 8).padEnd(8, "X")}`,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── Ticket ──────────────────────────────────────────────────────

let _ticketCounter = 0;

export function buildTicket(overrides: Partial<Ticket> = {}): Ticket {
  _ticketCounter++;
  const id = overrides.id ?? `ticket-${_ticketCounter}`;
  return {
    id,
    registration_id: "reg-1",
    event_id: "event-1",
    tier_id: "tier-1",
    organizer_id: "org-1",
    holder_name: "John Doe",
    holder_email: "john@example.com",
    unique_code: `00000000-0000-0000-0000-${String(_ticketCounter).padStart(12, "0")}`,
    checked_in_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── CheckIn ─────────────────────────────────────────────────────

export function buildCheckIn(overrides: Partial<CheckIn> = {}): CheckIn {
  return {
    id: "checkin-1",
    ticket_id: "ticket-1",
    event_id: "event-1",
    checked_in_by: "org-1",
    timestamp: "2026-06-01T19:00:00Z",
    type: "entry",
    ...overrides,
  };
}