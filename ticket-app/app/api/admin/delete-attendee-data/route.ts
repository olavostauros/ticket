import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-middleware";
import { ok, err } from "@/lib/api-utils";
import { z } from "zod";

const deleteSchema = z.object({
  email: z.string().email(),
});

/**
 * POST /api/admin/delete-attendee-data
 *
 * Anonymizes all data associated with an attendee email address.
 * This is required for LGPD (Brazilian data privacy law) compliance.
 *
 * Organizers can only delete attendee data for their OWN events.
 * The attendee's name and email are scrambled — records are preserved
 * for financial audit purposes but no longer link to a real person.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return err("Unauthorized", 401, "unauthorized");
    }

    const supabase = createServerClient();

    // Verify the requester is an organizer
    const { data: organizer } = await supabase
      .from("organizers")
      .select("id")
      .eq("id", user.id)
      .single();

    if (!organizer) {
      return err("Only organizers can request data deletion", 403, "forbidden");
    }

    // Parse and validate request body
    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);

    if (!parsed.success) {
      return err(
        "Validation failed: " + parsed.error.issues.map((i) => i.message).join("; "),
        400,
        "validation_error"
      );
    }

    const { email } = parsed.data;

    // Use a single anonymized email for this request so orders + tickets
    // get the same replacement (audit trail consistency).
    const anonymizedEmail = `deleted-${Date.now()}@anonymized.ticket.app`;

    // Scope deletion to orders belonging to this organizer's events only
    const { error: orderError } = await supabase
      .from("orders")
      .update({
        attendee_name: null,
        attendee_email: anonymizedEmail,
      })
      .eq("attendee_email", email)
      .eq("organizer_id", user.id);

    if (orderError) {
      console.error("Failed to anonymize orders:", orderError);
      return err("Failed to delete attendee data", 500, "db_error");
    }

    // Scope ticket anonymization to events owned by this organizer
    const { error: ticketError } = await supabase
      .from("tickets")
      .update({
        holder_name: "Removido",
        holder_email: anonymizedEmail,
      })
      .eq("holder_email", email)
      .eq("organizer_id", user.id);

    if (ticketError) {
      console.error("Failed to anonymize tickets:", ticketError);
      return err("Failed to delete ticket data", 500, "db_error");
    }

    return ok({ deleted: true, email });
  } catch (caughtErr) {
    console.error("Delete attendee data error:", caughtErr);
    return err("Internal server error", 500);
  }
}