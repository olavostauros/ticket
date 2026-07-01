import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-middleware";
import { addTierSchema } from "@/lib/validation";
import { ok, err } from "@/lib/api-utils";

/**
 * POST /api/events/[slug]/tiers — Add a ticket tier to an event (organizer only).
 */
export async function POST(
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

    // Verify event exists and organizer owns it
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
      return err("Can only add tiers to draft events", 400, "not_draft");
    }

    // Validate body
    const body = await request.json();
    const parsed = addTierSchema.safeParse(body);

    if (!parsed.success) {
      return err(
        "Validation failed: " + parsed.error.issues.map((i) => i.message).join("; "),
        400,
        "validation_error"
      );
    }

    // Create tier
    const { data: tier, error: insertError } = await supabase
      .from("tiers")
      .insert({
        event_id: event.id,
        ...parsed.data,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Create tier error:", insertError);
      return err("Failed to create tier", 500, "db_error");
    }

    return ok(tier, 201);
  } catch (caughtErr) {
    console.error("Add tier error:", caughtErr);
    return err("Internal server error", 500);
  }
}
