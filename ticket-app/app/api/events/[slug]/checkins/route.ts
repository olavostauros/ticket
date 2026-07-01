import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-middleware";
import { ok, err } from "@/lib/api-utils";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/**
 * GET /api/events/:slug/checkins — Polling endpoint for check-in state.
 *
 * Returns current ticket + check-in data for the client to poll.
 * Authenticated (organizer only). Verifies event ownership.
 *
 * Supports pagination via ?offset= and ?limit= query params.
 * @todo Add server-side cursor-based pagination if events regularly exceed 10K tickets.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return err("Unauthorized", 401, "unauthorized");
    }

    const supabase = createServerClient();
    const { slug } = await params;

    // Parse pagination params
    const url = new URL(request.url);
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));

    // Look up event and verify ownership
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, organizer_id, title")
      .eq("slug", slug)
      .single();

    if (eventError || !event) {
      return err("Event not found", 404, "event_not_found");
    }

    if (event.organizer_id !== user.id) {
      return err("Forbidden", 403, "forbidden");
    }

    // Get total count
    const { count: total, error: countError } = await supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("event_id", event.id);

    if (countError) {
      console.error("Failed to count tickets:", countError);
    }

    // Fetch tickets with check-in state (paginated)
    const { data: tickets, error: ticketsError } = await supabase
      .from("tickets")
      .select("id, unique_code, holder_name, holder_email, checked_in_at, tier_id")
      .eq("event_id", event.id)
      .order("holder_name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (ticketsError) {
      console.error("Failed to fetch tickets:", ticketsError);
      return err("Failed to fetch tickets", 500, "fetch_error");
    }

    // Fetch tier names for all tickets (only if there are tickets)
    let tierMap = new Map<string, string>();
    const tierIds = [...new Set((tickets || []).map((t) => t.tier_id).filter(Boolean))];
    if (tierIds.length > 0) {
      const { data: tiers } = await supabase
        .from("tiers")
        .select("id, name")
        .in("id", tierIds);
      tierMap = new Map((tiers || []).map((t) => [t.id, t.name]));
    }
    const ticketsWithTier = (tickets || []).map((t) => ({
      id: t.id,
      unique_code: t.unique_code,
      holder_name: t.holder_name,
      holder_email: t.holder_email,
      checked_in_at: t.checked_in_at,
      tier_name: tierMap.get(t.tier_id) || "",
    }));

    return ok({
      event: { id: event.id, title: event.title },
      tickets: ticketsWithTier,
      pagination: {
        offset,
        limit,
        total: total ?? 0,
        has_more: (offset + limit) < (total ?? 0),
      },
    });
  } catch (caughtErr) {
    console.error("Checkins polling error:", caughtErr);
    return err("Internal server error", 500);
  }
}