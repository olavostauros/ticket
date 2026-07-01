import type { APIRoute } from "astro";
export const prerender = false;
import { query } from "../../../lib/db";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../../../lib/rate-limit";
import { ok, err } from "../../../lib/api-utils";

export const POST: APIRoute = async (context) => {
  try {
    const ip = getClientIp(context.request);
    const { allowed, resetAt } = checkRateLimit(`orders-lookup:${ip}`, 10, 60_000);
    if (!allowed) return rateLimitResponse(resetAt);

    const body = await context.request.json();
    const { email, reference } = body;
    if (!email && !reference) return err("Provide email or order reference", 400, "missing_params");

    let queryText = "SELECT o.*, e.title as event_title FROM orders o LEFT JOIN events e ON o.event_id = e.id WHERE";
    const params: unknown[] = [];
    if (email) { params.push(email); queryText += ` o.attendee_email = $${params.length}`; }
    if (reference) {
      if (params.length > 0) queryText += " OR";
      params.push(reference);
      queryText += ` o.reference = $${params.length}`;
    }

    const result = await query(queryText, params);
    return ok({ orders: result.rows });
  } catch (e) { console.error("Lookup error:", e); return err("Internal server error", 500); }
};