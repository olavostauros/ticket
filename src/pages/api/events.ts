import type { APIRoute } from "astro";
export const prerender = false;

import { getAuthUser } from "../../lib/auth";
import { query } from "../../lib/db";
import { createEventSchema } from "../../lib/validation";
import { ok, err } from "../../lib/api-utils";

export const POST: APIRoute = async (context) => {
  try {
    const user = await getAuthUser(context);
    if (!user) return err("Unauthorized", 401, "unauthorized");

    const body = await context.request.json();
    const parsed = createEventSchema.safeParse(body);
    if (!parsed.success) {
      return err("Validation failed: " + parsed.error.issues.map((i: any) => i.message).join("; "), 400, "validation_error");
    }

    const result = await query(
      `INSERT INTO events (organizer_id, title, slug, description, venue_name, venue_address, start_at, end_at, timezone, cover_image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        user.id,
        parsed.data.title,
        parsed.data.slug,
        parsed.data.description,
        parsed.data.venue_name,
        parsed.data.venue_address,
        parsed.data.start_at,
        parsed.data.end_at,
        parsed.data.timezone || "America/Sao_Paulo",
        parsed.data.cover_image_url,
      ]
    );

    return ok(result.rows[0], 201);
  } catch (caughtErr: any) {
    if (caughtErr?.code === "23505") {
      return err("An event with this slug already exists", 409, "slug_conflict");
    }
    console.error("Create event error:", caughtErr);
    return err("Internal server error", 500);
  }
};