import type { APIRoute } from "astro";
export const prerender = false;

import { getAuthUser } from "../../../../lib/auth";
import { query } from "../../../../lib/db";
import { addTierSchema } from "../../../../lib/validation";
import { ok, err } from "../../../../lib/api-utils";

export const POST: APIRoute = async (context) => {
  try {
    const user = await getAuthUser(context);
    if (!user) return err("Unauthorized", 401, "unauthorized");

    const slug = context.params.slug!;
    const eventResult = await query(
      "SELECT id, organizer_id, status FROM events WHERE slug = $1",
      [slug]
    );
    const event = eventResult.rows[0];
    if (!event) return err("Event not found", 404, "not_found");
    if (event.organizer_id !== user.id) return err("Forbidden", 403, "forbidden");
    if (event.status !== "draft") return err("Can only add tiers to draft events", 400, "not_draft");

    const body = await context.request.json();
    const parsed = addTierSchema.safeParse(body);
    if (!parsed.success) {
      return err("Validation failed: " + parsed.error.issues.map((i: any) => i.message).join("; "), 400, "validation_error");
    }

    const result = await query(
      "INSERT INTO tiers (event_id, name, description, quantity_total, sale_start_at, sale_end_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [event.id, parsed.data.name, parsed.data.description, parsed.data.quantity_total, parsed.data.sale_start_at || null, parsed.data.sale_end_at || null]
    );
    return ok(result.rows[0], 201);
  } catch (caughtErr) {
    console.error("Add tier error:", caughtErr);
    return err("Internal server error", 500);
  }
};