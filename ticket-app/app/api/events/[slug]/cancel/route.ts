import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-middleware";
import { ok, err } from "@/lib/api-utils";

/**
 * POST /api/events/[slug]/cancel — Cancel an event (organizer only).
 * Allows cancelling draft or published events. Returns 400 if already canceled.
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

    if (event.status === "canceled") {
      return err("Event is already canceled", 400, "already_canceled");
    }

    // Cancel
    const { data: updated, error: updateError } = await supabase
      .from("events")
      .update({ status: "canceled" })
      .eq("id", event.id)
      .select()
      .single();

    if (updateError) {
      console.error("Cancel event error:", updateError);
      return err("Failed to cancel event", 500, "db_error");
    }

    return ok(updated);
  } catch (caughtErr) {
    console.error("Cancel event error:", caughtErr);
    return err("Internal server error", 500);
  }
}
