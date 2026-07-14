import type { APIRoute } from "astro";
export const prerender = false;
import { getAuthUser } from "../../../lib/auth";
import { query } from "../../../lib/db";
import { ok, err } from "../../../lib/api-utils";
import { z } from "zod";

const deleteSchema = z.object({ email: z.string().email() });

export const POST: APIRoute = async (context) => {
  try {
    const user = await getAuthUser(context);
    if (!user) return err("Unauthorized", 401, "unauthorized");

    const body = await context.request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) return err("Invalid email", 400, "validation_error");

    const { email } = parsed.data;

    const orgCheck = await query("SELECT id FROM organizers WHERE id = $1", [user.id]);
    if (!orgCheck.rows[0]) return err("Only organizers can request data deletion", 403, "forbidden");

    // Anonymize attendee data in registrations and tickets for this organizer's events
    await query(
      `UPDATE registrations SET attendee_email = 'redacted@example.com', attendee_name = 'Redactado' WHERE attendee_email = $1 AND organizer_id = $2`,
      [email, user.id]
    );
    await query(
      `UPDATE tickets SET holder_email = 'redacted@example.com', holder_name = 'Redactado' WHERE holder_email = $1 AND organizer_id = $2`,
      [email, user.id]
    );

    return ok({ message: "Attendee data anonymized successfully" });
  } catch (e) { console.error("Admin delete error:", e); return err("Internal server error", 500); }
};