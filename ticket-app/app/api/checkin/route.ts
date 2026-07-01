import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-middleware";
import { checkinSchema } from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { ok, err } from "@/lib/api-utils";

/**
 * POST /api/checkin — Check in an attendee by ticket unique code.
 *
 * Organizer-only endpoint. Uses the `checkin_ticket` RPC to atomically
 * insert the check-in record AND update the ticket in a single transaction.
 *
 * Returns 409 if already checked in, 404 if not found.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return err("Unauthorized", 401, "unauthorized");
    }

    const supabase = createServerClient();

    // Verify organizer exists
    const { data: organizer } = await supabase
      .from("organizers")
      .select("id")
      .eq("id", user.id)
      .single();

    if (!organizer) {
      return err("Forbidden", 403, "forbidden");
    }

    // Validate body
    // Rate limit: 30 check-in attempts per minute per IP
    const ip = getClientIp(request);
    const { allowed, resetAt } = checkRateLimit(`checkin:${ip}`, 30, 60_000);
    if (!allowed) {
      return rateLimitResponse(resetAt);
    }

    const body = await request.json();
    const parsed = checkinSchema.safeParse(body);

    if (!parsed.success) {
      return err(
        "Validation failed: " + parsed.error.issues.map((i) => i.message).join("; "),
        400,
        "validation_error"
      );
    }

    const { ticket_code } = parsed.data;

    // Look up ticket with event info
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select(`
        *,
        event:events(title, organizer_id)
      `)
      .eq("unique_code", ticket_code)
      .single();

    if (ticketError || !ticket) {
      return err("Ticket not found", 404, "ticket_not_found");
    }

    // Verify the organizer owns this event
    const eventData = (ticket as unknown as { event: { organizer_id: string } }).event;
    if (!eventData || eventData.organizer_id !== user.id) {
      return err("Forbidden", 403, "forbidden");
    }

    // Check if already checked in (fast path — avoid RPC call)
    if (ticket.checked_in_at) {
      return err("Ticket already checked in", 409, "already_checked_in");
    }

    // Perform atomic check-in via RPC (insert check_ins + update ticket)
    const { data: checkinResult, error: checkinError } = await supabase.rpc("checkin_ticket", {
      p_ticket_id: ticket.id,
      p_event_id: ticket.event_id,
      p_checked_in_by: user.id,
      p_type: "entry",
    });

    if (checkinError) {
      const msg = checkinError.message.toLowerCase();
      if (msg.includes("already checked in")) {
        return err("Ticket already checked in", 409, "already_checked_in");
      }
      console.error("Check-in RPC error:", checkinError);
      return err("Check-in failed", 500, "checkin_error");
    }

    const result = checkinResult as Record<string, unknown>;

    return ok({
      ticket_id: ticket.id,
      holder_name: ticket.holder_name,
      event_name: (ticket as unknown as { event: { title: string } }).event?.title,
      checked_in_at: result.checked_in_at,
    });
  } catch (caughtErr) {
    console.error("Check-in error:", caughtErr);
    return err("Internal server error", 500);
  }
}