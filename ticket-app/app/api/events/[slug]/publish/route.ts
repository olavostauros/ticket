import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-middleware";
import { ok, err } from "@/lib/api-utils";

/**
 * POST /api/events/[slug]/publish — Publish a draft event (organizer only).
 * Requires at least one tier to be defined.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return err("Unauthorized", 401, "unauthorized");
    }

    const supabase = createServerClient();
    const { slug } = await params;

    // Fetch event and verify ownership
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, organizer_id, status")
      .eq("slug", slug)
      .single();

    if (eventError || !event) {
      return err("Event not found", 404, "not_found");
    }

    if (event.organizer_id !== user.id) {
      return err("Forbidden", 403, "forbidden");
    }

    if (event.status !== "draft") {
      return err("Only draft events can be published", 400, "not_draft");
    }

    // Require at least one tier before publishing
    const { count, error: countError } = await supabase
      .from("tiers")
      .select("*", { count: "exact", head: true })
      .eq("event_id", event.id);

    if (countError) {
      return err("Failed to check tiers", 500, "db_error");
    }

    if (!count || count === 0) {
      return err("Event must have at least one tier before publishing", 400, "no_tiers");
    }

    // Publish
    const { data: updated, error: updateError } = await supabase
      .from("events")
      .update({ status: "published" })
      .eq("id", event.id)
      .select()
      .single();

    if (updateError) {
      console.error("Publish event error:", updateError);
      return err("Failed to publish event", 500, "db_error");
    }

    return ok(updated);
  } catch (caughtErr) {
    console.error("Publish event error:", caughtErr);
    return err("Internal server error", 500);
  }
}
