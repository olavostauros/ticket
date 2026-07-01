import type { APIRoute } from "astro";
export const prerender = false;

import { query } from "../../../lib/db";
import { verifyWebhookSignature } from "../../../lib/abacatepay";
import { abacatepayWebhookSchema } from "../../../lib/validation";
import { sendEmail } from "../../../lib/email";
import { buildConfirmationEmail } from "../../../lib/email-templates";
import { ok, err } from "../../../lib/api-utils";

export const POST: APIRoute = async (context) => {
  try {
    const signature = context.request.headers.get("x-abacatepay-signature") || "";
    if (!signature) return err("Missing signature header", 401, "missing_signature");

    const rawBody = await context.request.text();
    const isValid = await verifyWebhookSignature(rawBody, signature);
    if (!isValid) return err("Invalid signature", 401, "invalid_signature");

    const body = JSON.parse(rawBody);
    const parsed = abacatepayWebhookSchema.safeParse(body);
    if (!parsed.success) return err("Invalid webhook payload", 400, "invalid_payload");

    const payload = parsed.data;

    if (payload.event === "checkout.completed") {
      const { id: billingId, reference } = payload.data;

      // Find the order
      const orderResult = await query("SELECT * FROM orders WHERE reference = $1", [reference]);
      const order = orderResult.rows[0];
      if (!order) return err("Order not found", 404, "order_not_found");

      // Avoid double processing
      if (order.status === "paid") return ok({ received: true });

      // Update order status
      await query(
        "UPDATE orders SET status = 'paid', abacatepay_billing_id = $1 WHERE id = $2",
        [billingId, order.id]
      );

      // Fetch order items to know how many tickets per tier
      const itemsResult = await query("SELECT * FROM order_items WHERE order_id = $1", [order.id]);
      const items = itemsResult.rows;

      // Generate tickets
      const ticketUrls: string[] = [];
      for (const item of items) {
        for (let i = 0; i < item.quantity; i++) {
          const ticketResult = await query(
            "INSERT INTO tickets (order_id, event_id, tier_id, organizer_id, holder_name, holder_email) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, unique_code",
            [order.id, order.event_id, item.tier_id, order.organizer_id, order.attendee_name || order.attendee_email, order.attendee_email]
          );
          const ticket = ticketResult.rows[0];
          const appUrl = process.env.PUBLIC_APP_URL || "http://localhost:4321";
          ticketUrls.push(`${appUrl}/tickets/${ticket.unique_code}`);
        }

        // Increment quantity_sold on the tier
        await query("UPDATE tiers SET quantity_sold = quantity_sold + $1 WHERE id = $2", [item.quantity, item.tier_id]);
      }

      // Send confirmation email (non-blocking)
      const appUrl = process.env.PUBLIC_APP_URL || "http://localhost:4321";
      sendEmail({
        to: order.attendee_email,
        subject: "🎟️ Compra confirmada!",
        html: buildConfirmationEmail({
          attendeeName: order.attendee_name || order.attendee_email,
          orderReference: reference,
          ticketUrls,
        }),
      }).catch((e: Error) => console.error("Failed to send confirmation email:", e));

      return ok({ received: true });
    }

    if (payload.event === "checkout.lost") {
      const { reference } = payload.data;
      await query("UPDATE orders SET status = 'lost' WHERE reference = $1", [reference]);
      return ok({ received: true });
    }

    return ok({ received: true });
  } catch (caughtErr) {
    console.error("Webhook error:", caughtErr);
    return err("Internal server error", 500);
  }
};