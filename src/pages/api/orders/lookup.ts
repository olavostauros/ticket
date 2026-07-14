import type { APIRoute } from "astro";
export const prerender = false;
import { query } from "../../../lib/db";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../../../lib/rate-limit";
import { ok, err } from "../../../lib/api-utils";

export const POST: APIRoute = async (context) => {
  try {
    const ip = getClientIp(context.request);
    const kv = (context.locals as any)?.runtime?.env?.RATE_LIMIT as KVNamespace | undefined;
    const { allowed, resetAt } = await checkRateLimit(`orders-lookup:${ip}`, 10, 60_000, kv);
    if (!allowed) return rateLimitResponse(resetAt);

    const body = await context.request.json();
    const { email, reference } = body;
    if (!email && !reference) return err("Informe email ou código do pedido", 400, "missing_params");

    let queryText = "SELECT r.*, e.title as event_title FROM registrations r LEFT JOIN events e ON r.event_id = e.id WHERE";
    const params: unknown[] = [];
    if (email) { params.push(email); queryText += ` r.attendee_email = $${params.length}`; }
    if (reference) {
      if (params.length > 0) queryText += " OR";
      params.push(reference);
      queryText += ` r.reference = $${params.length}`;
    }

    const result = await query(queryText, params);
    return ok({ registrations: result.rows });
  } catch (e) { console.error("Lookup error:", e); return err("Internal server error", 500); }
};