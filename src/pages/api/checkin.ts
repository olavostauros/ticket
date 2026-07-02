import type { APIRoute } from "astro";
export const prerender = false;

import { getAuthUser } from "../../lib/auth";
import { query } from "../../lib/db";
import { checkinSchema } from "../../lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../../lib/rate-limit";
import { ok, err } from "../../lib/api-utils";

export const POST: APIRoute = async (context) => {
  try {
    const user = await getAuthUser(context);
    if (!user) return err("Unauthorized", 401, "unauthorized");

    const ip = getClientIp(context.request);
    const { allowed, resetAt } = checkRateLimit(`checkin:${ip}`, 30, 60_000);
    if (!allowed) return rateLimitResponse(resetAt);

    const body = await context.request.json();
    const parsed = checkinSchema.safeParse(body);
    if (!parsed.success) return err("Código de ingresso inválido", 400, "validation_error");

    const { ticket_code } = parsed.data;

    // Find ticket — must belong to an event owned by this organizer
    const ticketResult = await query(
      "SELECT t.id, t.unique_code, t.holder_name, t.holder_email, t.checked_in_at, t.event_id, e.title as event_title, e.organizer_id FROM tickets t JOIN events e ON t.event_id = e.id WHERE t.unique_code = $1",
      [ticket_code]
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) return err("Ticket not found", 404, "ticket_not_found");
    if (ticket.organizer_id !== user.id) return err("This ticket is not for your event", 403, "forbidden");

    if (ticket.checked_in_at) {
      // Re-entry — record check-in but indicate it's a re-entry
      await query("INSERT INTO check_ins (ticket_id, event_id, checked_in_by, type) VALUES ($1, $2, $3, 'reentry') RETURNING *", [ticket.id, ticket.event_id, user.id]);
      return ok({
        already_checked_in: true,
        checked_in_at: ticket.checked_in_at,
        ticket: {
          id: ticket.id,
          holder_name: ticket.holder_name,
          holder_email: ticket.holder_email,
          event_title: ticket.event_title,
        },
      });
    }

    // First-time check-in
    const now = new Date().toISOString();
    await query("UPDATE tickets SET checked_in_at = $1 WHERE id = $2", [now, ticket.id]);
    await query("INSERT INTO check_ins (ticket_id, event_id, checked_in_by, type) VALUES ($1, $2, $3, 'entry')", [ticket.id, ticket.event_id, user.id]);

    return ok({
      checked_in: true,
      checked_in_at: now,
      ticket: {
        id: ticket.id,
        holder_name: ticket.holder_name,
        holder_email: ticket.holder_email,
        event_title: ticket.event_title,
      },
    });
  } catch (caughtErr) {
    console.error("Check-in error:", caughtErr);
    return err("Internal server error", 500);
  }
};