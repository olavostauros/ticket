import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { ok, err } from "@/lib/api-utils";

/**
 * GET /api/orders/lookup?email=...&reference=...
 *
 * Public endpoint — no auth required. Look up paid orders by attendee
 * email and order reference. Returns the list of tickets for that order.
 *
 * This powers the "My Tickets" page where attendees enter their
 * email and the reference from their confirmation email.
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limit: 10 lookups per minute per IP (public endpoint, prevent enumeration)
    const ip = getClientIp(request);
    const { allowed, resetAt } = checkRateLimit(`orders-lookup:${ip}`, 10, 60_000);
    if (!allowed) {
      return rateLimitResponse(resetAt);
    }

    const url = new URL(request.url);
    const email = url.searchParams.get("email")?.trim();
    const reference = url.searchParams.get("reference")?.trim();

    if (!email || !reference) {
      return err("Email and reference are required", 400, "missing_params");
    }

    const supabase = createServerClient();

    // Fetch the paid order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, event_id, attendee_email, attendee_name")
      .eq("attendee_email", email)
      .eq("reference", reference)
      .eq("status", "paid")
      .single();

    if (orderError || !order) {
      return err("Order not found. Check your email and order reference.", 404, "order_not_found");
    }

    // Fetch tickets for this order
    const { data: tickets, error: ticketsError } = await supabase
      .from("tickets")
      .select(`
        id,
        unique_code,
        holder_name,
        tier_id,
        checked_in_at
      `)
      .eq("order_id", order.id);

    if (ticketsError || !tickets || tickets.length === 0) {
      return err("No tickets found for this order", 404, "tickets_not_found");
    }

    // Fetch tier names for all tickets
    const tierIds = [...new Set(tickets.map((t) => t.tier_id))];
    const { data: tiers } = await supabase
      .from("tiers")
      .select("id, name")
      .in("id", tierIds);

    const tierMap = new Map(tiers?.map((t) => [t.id, t.name]) ?? []);

    const ticketsWithTier = tickets.map((t) => ({
      id: t.id,
      unique_code: t.unique_code,
      holder_name: t.holder_name,
      tier_name: tierMap.get(t.tier_id) ?? "Unknown",
      checked_in_at: t.checked_in_at,
    }));

    return ok({
      order_reference: reference,
      attendee_name: order.attendee_name,
      tickets: ticketsWithTier,
    });
  } catch (caughtErr) {
    console.error("Order lookup error:", caughtErr);
    return err("Internal server error", 500);
  }
}