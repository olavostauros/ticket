import type { APIRoute } from "astro";
export const prerender = false;

import { getAuthUser } from "../../../lib/auth";
import { query } from "../../../lib/db";
import { updateProfileSchema } from "../../../lib/validation";
import { ok, err } from "../../../lib/api-utils";

export const GET: APIRoute = async (context) => {
  const user = await getAuthUser(context);
  if (!user) return err("Not authenticated", 401, "unauthorized");

  const result = await query("SELECT * FROM organizers WHERE id = $1", [
    user.id,
  ]);
  const organizer = result.rows[0];
  if (!organizer) return err("Organizer not found", 404, "not_found");

  return ok({ organizer });
};

export const PATCH: APIRoute = async (context) => {
  const user = await getAuthUser(context);
  if (!user) return err("Not authenticated", 401, "unauthorized");

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return err("Invalid JSON body", 400, "invalid_body");
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return err(
      parsed.error.issues.map((i) => i.message).join("; "),
      400,
      "validation_error"
    );
  }

  try {
    await query(
      "UPDATE organizers SET name = $1, avatar_url = $2, pix_key = $3, pix_key_type = $4 WHERE id = $5",
      [
        parsed.data.name,
        parsed.data.avatar_url,
        parsed.data.pix_key,
        parsed.data.pix_key_type,
        user.id,
      ]
    );
  } catch (updateError) {
    console.error("Profile update error:", updateError);
    return err("Failed to update profile", 500, "db_error");
  }

  const result = await query("SELECT * FROM organizers WHERE id = $1", [
    user.id,
  ]);
  return ok({ organizer: result.rows[0] });
};