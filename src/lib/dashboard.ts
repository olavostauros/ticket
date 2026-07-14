import { query } from "./db";

export interface EventDashboardStats {
  event: {
    id: string;
    title: string;
    slug: string;
  };
  stats: {
    total_registrations: number;
    total_tickets_sold: number;
    total_checked_in: number;
    remaining_capacity: number | null;
  };
}

/**
 * Fetch dashboard statistics for a given event.
 *
 * Combines all aggregate queries into a single function for consistency
 * between the API route and server-rendered pages. Queries are kept
 * separate (no complex JOINs) for clarity in MVP — optimized later if
 * performance requires it.
 */
export async function getEventDashboardStats(
  eventId: string
): Promise<EventDashboardStats> {
  const eventResult = await query(
    "SELECT id, title, slug FROM events WHERE id = $1",
    [eventId]
  );
  const event = eventResult.rows[0];
  if (!event) throw Object.assign(new Error("Event not found"), { statusCode: 404, code: "not_found" });

  const statsResult = await query(
    `SELECT
       COUNT(*)::int AS total_registrations
     FROM registrations
     WHERE event_id = $1`,
    [eventId]
  );

  const ticketResult = await query(
    `SELECT
       COUNT(*)::int AS total_tickets_sold,
       COALESCE(SUM(CASE WHEN checked_in_at IS NOT NULL THEN 1 ELSE 0 END), 0)::int AS total_checked_in
     FROM tickets
     WHERE event_id = $1`,
    [eventId]
  );

  // Calculate remaining capacity across all tiers
  const capacityResult = await query(
    `SELECT
       COALESCE(SUM(quantity_total - quantity_sold), 0)::int AS remaining_capacity
     FROM tiers
     WHERE event_id = $1`,
    [eventId]
  );

  return {
    event: {
      id: event.id,
      title: event.title,
      slug: event.slug,
    },
    stats: {
      total_registrations: statsResult.rows[0].total_registrations,
      total_tickets_sold: ticketResult.rows[0].total_tickets_sold,
      total_checked_in: ticketResult.rows[0].total_checked_in,
      remaining_capacity: capacityResult.rows[0].remaining_capacity,
    },
  };
}