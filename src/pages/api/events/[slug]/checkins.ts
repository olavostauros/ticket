import type { APIRoute } from "astro";
export const prerender = false;
import { getAuthUser } from "../../../../lib/auth";
import { query } from "../../../../lib/db";
import { ok, err } from "../../../../lib/api-utils";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

export const GET: APIRoute = async (context) => {
  try {
    const user = await getAuthUser(context);
    if (!user) return err("Unauthorized", 401, "unauthorized");
    const slug = context.params.slug!;
    const url = new URL(context.request.url);
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0") || 0);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT)) || DEFAULT_LIMIT));

    const ev = (await query("SELECT id, organizer_id, title FROM events WHERE slug = $1", [slug])).rows[0];
    if (!ev) return err("Event not found", 404, "event_not_found");
    if (ev.organizer_id !== user.id) return err("Forbidden", 403, "forbidden");

    const totalResult = await query("SELECT COUNT(*) as cnt FROM tickets WHERE event_id = $1", [ev.id]);
    const total = parseInt(totalResult.rows[0].cnt);
    const ticketsResult = await query(
      "SELECT t.id, t.unique_code, t.holder_name, t.holder_email, t.checked_in_at, t.tier_id, tr.name as tier_name FROM tickets t LEFT JOIN tiers tr ON t.tier_id = tr.id WHERE t.event_id = $1 ORDER BY t.holder_name ASC LIMIT $2 OFFSET $3",
      [ev.id, limit, offset]
    );

    return ok({
      event: { id: ev.id, title: ev.title },
      tickets: ticketsResult.rows,
      pagination: { offset, limit, total, has_more: offset + limit < total },
    });
  } catch (e) { console.error("Checkins error:", e); return err("Internal server error", 500); }
};