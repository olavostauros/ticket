import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-middleware";
import { updateEventSchema } from "@/lib/validation";
import { getAvailableTiers } from "@/lib/utils";
import { ok, err } from "@/lib/api-utils";
import type { Tier } from "@/lib/types";

/**
 * GET /api/events/[slug] — Public event page with available tiers.
 * Supports ?include_drafts=true for authenticated organizers editing their own events.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = createServerClient();

    const url = new URL(request.url);
    const includeDrafts = url.searchParams.get("include_drafts") === "true";

    let query = supabase
      .from("events")
      .select(`
        *,
        tiers:tiers(*)
      `)
      .eq("slug", slug);

    if (!includeDrafts) {
      query = query.eq("status", "published");
    }

    const { data: event, error } = await query.single();

    if (error || !event) {
      return err("Event not found", 404, "not_found");
    }

    // If include_drafts, verify the caller owns this event
    if (includeDrafts) {
      const user = await getAuthUser();
      if (!user || event.organizer_id !== user.id) {
        return err("Event not found", 404, "not_found");
      }
    }

    // Filter tiers to only available ones (for published events)
    const tiers = (event.tiers || []) as Tier[];
    const availableTiers = includeDrafts ? tiers : getAvailableTiers(tiers);

    // Strip internal fields from public response
    const { organizer_id, ...publicEvent } = event;

    // Use NextResponse directly to set Cache-Control header for public caching
    return NextResponse.json(
      { data: { ...publicEvent, tiers: availableTiers } },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (caughtErr) {
    console.error("Get event error:", caughtErr);
    return err("Internal server error", 500);
  }
}

/**
 * PATCH /api/events/[slug] — Update event (only while draft, organizer only).
 */
export async function PATCH(
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

    // Get event, verify ownership
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
      return err("Can only edit draft events", 400, "not_draft");
    }

    const body = await request.json();
    const parsed = updateEventSchema.safeParse(body);

    if (!parsed.success) {
      return err(
        "Validation failed: " + parsed.error.issues.map((i) => i.message).join("; "),
        400,
        "validation_error"
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("events")
      .update(parsed.data)
      .eq("id", event.id)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === "23505") {
        return err("An event with this slug already exists", 409, "slug_conflict");
      }
      return err("Failed to update event", 500, "db_error");
    }

    return ok(updated);
  } catch (caughtErr) {
    console.error("Update event error:", caughtErr);
    return err("Internal server error", 500);
  }
}

/**
 * DELETE /api/events/[slug] — Delete a draft event (organizer only).
 */
export async function DELETE(
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

    // Get event, verify ownership
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
      return err("Can only delete draft events", 400, "not_draft");
    }

    const { error: deleteError } = await supabase
      .from("events")
      .delete()
      .eq("id", event.id);

    if (deleteError) {
      return err("Failed to delete event", 500, "db_error");
    }

    return ok({ deleted: true });
  } catch (caughtErr) {
    console.error("Delete event error:", caughtErr);
    return err("Internal server error", 500);
  }
}