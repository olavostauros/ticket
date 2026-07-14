import type { APIRoute } from "astro";
export const prerender = false;

import { getAuthUser } from "../../../lib/auth";
import { query } from "../../../lib/db";
import { updateEventSchema } from "../../../lib/validation";
import { getAvailableTiers } from "../../../lib/utils";
import type { Tier } from "../../../lib/types";
import { ok, err } from "../../../lib/api-utils";

export const GET: APIRoute = async (context) => {
  try {
    const slug = context.params.slug!;
    const url = new URL(context.request.url);
    const includeDrafts = url.searchParams.get("include_drafts") === "true";

    let result;
    if (includeDrafts) {
      result = await query("SELECT * FROM events WHERE slug = $1", [slug]);
    } else {
      result = await query(
        "SELECT * FROM events WHERE slug = $1 AND status = 'published'",
        [slug]
      );
    }

    const event = result.rows[0];
    if (!event) return err("Event not found", 404, "not_found");

    // If include_drafts, verify the caller owns this event
    if (includeDrafts) {
      const user = await getAuthUser(context);
      if (!user || event.organizer_id !== user.id) {
        return err("Event not found", 404, "not_found");
      }
    }

    const tiersResult = await query(
      "SELECT * FROM tiers WHERE event_id = $1 ORDER BY created_at ASC",
      [event.id]
    );
    const tiers = tiersResult.rows as Tier[];
    const availableTiers = includeDrafts ? tiers : getAvailableTiers(tiers);

    const { organizer_id, ...publicEvent } = event;

    return new Response(JSON.stringify({ data: { ...publicEvent, tiers: availableTiers } }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (caughtErr) {
    console.error("Get event error:", caughtErr);
    return err("Internal server error", 500);
  }
};

export const PATCH: APIRoute = async (context) => {
  try {
    const user = await getAuthUser(context);
    if (!user) return err("Unauthorized", 401, "unauthorized");

    const slug = context.params.slug!;
    const result = await query(
      "SELECT id, organizer_id, status FROM events WHERE slug = $1",
      [slug]
    );
    const event = result.rows[0];
    if (!event) return err("Event not found", 404, "not_found");

    if (event.organizer_id !== user.id) return err("Forbidden", 403, "forbidden");
    if (event.status !== "draft") return err("Can only edit draft events", 400, "not_draft");

    const body = await context.request.json();
    const parsed = updateEventSchema.safeParse(body);
    if (!parsed.success) {
      return err(
        "Validation failed: " + parsed.error.issues.map((i: any) => i.message).join("; "),
        400,
        "validation_error"
      );
    }

    const cols = Object.keys(parsed.data)
      .map((k, i) => `${k} = $${i + 2}`)
      .join(", ");
    const values = Object.values(parsed.data);
    const updateResult = await query(
      `UPDATE events SET ${cols} WHERE id = $1 RETURNING *`,
      [event.id, ...values]
    );

    if (!updateResult.rows[0]) return err("Failed to update event", 500, "db_error");
    return ok(updateResult.rows[0]);
  } catch (caughtErr) {
    console.error("Update event error:", caughtErr);
    return err("Internal server error", 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    const user = await getAuthUser(context);
    if (!user) return err("Unauthorized", 401, "unauthorized");

    const slug = context.params.slug!;
    const result = await query(
      "SELECT id, organizer_id, status FROM events WHERE slug = $1",
      [slug]
    );
    const event = result.rows[0];
    if (!event) return err("Event not found", 404, "not_found");

    if (event.organizer_id !== user.id) return err("Forbidden", 403, "forbidden");
    if (event.status !== "draft") return err("Can only delete draft events", 400, "not_draft");

    await query("DELETE FROM events WHERE id = $1", [event.id]);
    return ok({ deleted: true });
  } catch (caughtErr) {
    console.error("Delete event error:", caughtErr);
    return err("Internal server error", 500);
  }
};