import type { APIRoute } from "astro";
export const prerender = false;

import { getAuthUser } from "../../../../lib/auth";
import { query } from "../../../../lib/db";
import { getEventDashboardStats } from "../../../../lib/dashboard";
import { ok, err } from "../../../../lib/api-utils";

/**
 * GET /api/events/[slug]/dashboard
 *
 * Returns aggregate sales and check-in statistics for the event.
 * Only the event owner may access this endpoint.
 */
export const GET: APIRoute = async (context) => {
  try {
    const user = await getAuthUser(context);
    if (!user) return err("Unauthorized", 401, "unauthorized");

    const slug = context.params.slug!;
    const eventResult = await query(
      "SELECT id, organizer_id FROM events WHERE slug = $1",
      [slug]
    );
    const event = eventResult.rows[0];
    if (!event) return err("Event not found", 404, "not_found");
    if (event.organizer_id !== user.id) return err("Forbidden", 403, "forbidden");

    const dashboardData = await getEventDashboardStats(event.id);

    return new Response(JSON.stringify({ data: dashboardData }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (caughtErr: any) {
    if (caughtErr?.statusCode) {
      return err(caughtErr.message, caughtErr.statusCode, caughtErr.code);
    }
    console.error("Dashboard error:", caughtErr);
    return err("Internal server error", 500);
  }
};