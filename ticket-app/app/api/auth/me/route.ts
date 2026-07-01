import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { updateProfileSchema } from "@/lib/validation";
import { getAuthUser } from "@/lib/auth-middleware";
import { ok, err } from "@/lib/api-utils";

/**
 * GET /api/auth/me — Get the current organizer's profile.
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return err("Not authenticated", 401, "unauthorized");

  const supabase = createServerClient();
  const { data: organizer, error } = await supabase
    .from("organizers")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !organizer) {
    return err("Organizer not found", 404, "not_found");
  }

  return ok({ organizer });
}

/**
 * PATCH /api/auth/me — Update the current organizer's profile.
 */
export async function PATCH(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return err("Not authenticated", 401, "unauthorized");

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON body", 400, "invalid_body");
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return err(
      parsed.error.issues.map((i) => i.message).join("; "),
      400,
      "validation_error",
    );
  }

  const supabase = createServerClient();
  const { error: updateError } = await supabase
    .from("organizers")
    .update(parsed.data)
    .eq("id", user.id);

  if (updateError) {
    console.error("Profile update error:", updateError);
    return err("Failed to update profile", 500, "db_error");
  }

  const { data: organizer } = await supabase
    .from("organizers")
    .select("*")
    .eq("id", user.id)
    .single();

  return ok({ organizer });
}