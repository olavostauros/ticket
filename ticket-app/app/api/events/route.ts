import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-middleware";
import { createEventSchema } from "@/lib/validation";
import { ok, err } from "@/lib/api-utils";

/**
 * POST /api/events — Create a new event (organizer only).
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
      return err("Organizer not found", 403, "forbidden");
    }

    // Validate body
    const body = await request.json();
    const parsed = createEventSchema.safeParse(body);

    if (!parsed.success) {
      return err(
        "Validation failed: " + parsed.error.issues.map((i) => i.message).join("; "),
        400,
        "validation_error"
      );
    }

    // Create event
    const { data: event, error: insertError } = await supabase
      .from("events")
      .insert({
        organizer_id: user.id,
        ...parsed.data,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return err("An event with this slug already exists", 409, "slug_conflict");
      }
      return err("Failed to create event", 500, "db_error");
    }

    return ok(event, 201);
  } catch (caughtErr) {
    console.error("Create event error:", caughtErr);
    return err("Internal server error", 500);
  }
}