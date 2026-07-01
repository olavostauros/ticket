import type { APIRoute } from "astro";
export const prerender = false;
import { query } from "../../../lib/db";
import { ok, err } from "../../../lib/api-utils";

export const GET: APIRoute = async (context) => {
  try {
    const code = context.params.unique_code!;
    const result = await query(
      "SELECT t.id, t.holder_name, t.holder_email, t.checked_in_at, e.title as event_title, e.start_at as event_start_at, e.venue_name as event_venue_name, tr.name as tier_name FROM tickets t LEFT JOIN events e ON t.event_id = e.id LEFT JOIN tiers tr ON t.tier_id = tr.id WHERE t.unique_code = $1",
      [code]
    );
    const ticket = result.rows[0];
    if (!ticket) return err("Ticket not found", 404, "ticket_not_found");
    return ok({
      id: ticket.id,
      holder_name: ticket.holder_name,
      holder_email: ticket.holder_email,
      checked_in: ticket.checked_in_at !== null,
      checked_in_at: ticket.checked_in_at,
      event: { title: ticket.event_title, start_at: ticket.event_start_at, venue_name: ticket.event_venue_name },
      tier: { name: ticket.tier_name },
    });
  } catch (e) { console.error("Get ticket error:", e); return err("Internal server error", 500); }
};