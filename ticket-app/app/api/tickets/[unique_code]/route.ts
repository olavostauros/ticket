import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { ok, err } from "@/lib/api-utils";

/**
 * GET /api/tickets/[unique_code] — Ticket details for QR verification.
 *
 * Public endpoint (no auth required — the unique_code itself is the secret).
 * Returns ticket details + check-in validity.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ unique_code: string }> }
) {
  try {
    const { unique_code } = await params;
    const supabase = createServerClient();

    const { data: ticket, error } = await supabase
      .from("tickets")
      .select(`
        *,
        event:events(title, start_at, venue_name),
        tier:tiers(name)
      `)
      .eq("unique_code", unique_code)
      .single();

    if (error || !ticket) {
      return err("Ticket not found", 404, "ticket_not_found");
    }

    return ok({
      id: ticket.id,
      holder_name: ticket.holder_name,
      holder_email: ticket.holder_email,
      checked_in: ticket.checked_in_at !== null,
      checked_in_at: ticket.checked_in_at,
      event: (ticket as unknown as { event: { title: string; start_at: string; venue_name: string } }).event,
      tier: (ticket as unknown as { tier: { name: string } }).tier,
    });
  } catch (caughtErr) {
    console.error("Get ticket error:", caughtErr);
    return err("Internal server error", 500);
  }
}
