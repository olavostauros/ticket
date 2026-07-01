import type { APIRoute } from "astro";
export const prerender = false;
import { getAuthUser } from "../../../../lib/auth";
import { query } from "../../../../lib/db";
import { ok, err } from "../../../../lib/api-utils";

export const POST: APIRoute = async (context) => {
  try {
    const user = await getAuthUser(context);
    if (!user) return err("Unauthorized", 401, "unauthorized");
    const slug = context.params.slug!;
    const ev = (await query("SELECT id, organizer_id, status FROM events WHERE slug = $1", [slug])).rows[0];
    if (!ev) return err("Event not found", 404, "not_found");
    if (ev.organizer_id !== user.id) return err("Forbidden", 403, "forbidden");
    if (ev.status !== "draft") return err("Only draft events can be published", 400, "not_draft");
    const tiers = (await query("SELECT COUNT(*) as cnt FROM tiers WHERE event_id = $1", [ev.id])).rows[0];
    if (parseInt(tiers.cnt) === 0) return err("Event must have at least one tier before publishing", 400, "no_tiers");
    const result = await query("UPDATE events SET status = 'published' WHERE id = $1 RETURNING *", [ev.id]);
    return ok(result.rows[0]);
  } catch (e) { console.error("Publish error:", e); return err("Internal server error", 500); }
};