import type { APIRoute } from "astro";
export const prerender = false;

import { query, withTransaction } from "../../lib/db";
import { checkoutSchema } from "../../lib/validation";
import { calculateFees } from "../../lib/fees";
import { generateOrderReference } from "../../lib/utils";
import { createCheckout } from "../../lib/abacatepay";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../../lib/rate-limit";
import { ok, err } from "../../lib/api-utils";

export const POST: APIRoute = async (context) => {
  try {
    const ip = getClientIp(context.request);
    const { allowed, resetAt } = checkRateLimit(`checkout:${ip}`, 10, 60_000);
    if (!allowed) return rateLimitResponse(resetAt);

    const body = await context.request.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return err("Validation failed: " + parsed.error.issues.map((i: any) => i.message).join("; "), 400, "validation_error");
    }

    const { event_id, items, attendee_email, attendee_name, idempotency_key } = parsed.data;

    // Check idempotency — if this key was already used, return the existing order
    const existing = await query("SELECT * FROM orders WHERE idempotency_key = $1", [idempotency_key]);
    if (existing.rows[0]) {
      return ok(existing.rows[0], 200);
    }

    // Fetch event (read-only, outside transaction)
    const eventResult = await query("SELECT id, organizer_id, title, status FROM events WHERE id = $1", [event_id]);
    const event = eventResult.rows[0];
    if (!event) return err("Event not found", 404, "not_found");
    if (event.status !== "published") return err("Event is not available", 400, "event_not_available");

    const reference = generateOrderReference();
    const appUrl = process.env.PUBLIC_APP_URL || "http://localhost:4321";

    // Phase 1 — Transaction: lock tiers, check capacity, reserve capacity, insert order + items
    // Fast DB-only operation. No external calls inside the transaction.
    const order = await withTransaction(async (client) => {
      const uniqueTierIds = [...new Set(items.map((i: any) => i.tier_id))];

      // Lock tiers with FOR UPDATE — concurrent requests queue here
      const tiersResult = await client.query(
        "SELECT * FROM tiers WHERE id = ANY($1::uuid[]) FOR UPDATE",
        [uniqueTierIds]
      );
      const tiers = tiersResult.rows;

      if (tiers.length !== uniqueTierIds.length) {
        throw Object.assign(new Error("One or more tiers not found"), { statusCode: 404, code: "tier_not_found" });
      }

      const allBelong = tiers.every((t: any) => t.event_id === event_id);
      if (!allBelong) {
        throw Object.assign(new Error("Invalid tier selection"), { statusCode: 400, code: "invalid_tier" });
      }

      const tierMap = new Map(tiers.map((t: any) => [t.id, t]));

      // Check capacity against the locked rows (authoritative state)
      let subtotalCents = 0;
      for (const item of items) {
        const tier = tierMap.get(item.tier_id);
        if (!tier) {
          throw Object.assign(new Error("Tier not found"), { statusCode: 404, code: "tier_not_found" });
        }
        if (tier.quantity_sold + item.quantity > tier.quantity_total) {
          throw Object.assign(
            new Error(`Insufficient capacity for tier: ${tier.name}`),
            { statusCode: 409, code: "insufficient_capacity" }
          );
        }
        subtotalCents += tier.price_cents * item.quantity;
      }

      const fees = calculateFees(subtotalCents);

      // Insert order (status: pending — no billing yet)
      const orderResult = await client.query(
        `INSERT INTO orders (event_id, organizer_id, attendee_email, attendee_name, amount_cents, fee_cents, abacatepay_fee_cents, reference, idempotency_key, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
         RETURNING *`,
        [event_id, event.organizer_id, attendee_email, attendee_name || null, fees.total_cents, fees.platform_fee_cents, fees.abacatepay_fee_cents, reference, idempotency_key]
      );
      const order = orderResult.rows[0];

      // Insert order items and atomically reserve capacity
      for (const item of items) {
        const tier = tierMap.get(item.tier_id);
        await client.query(
          "INSERT INTO order_items (order_id, tier_id, tier_name, quantity, unit_price_cents) VALUES ($1, $2, $3, $4, $5)",
          [order.id, item.tier_id, tier.name, item.quantity, tier.price_cents]
        );
        await client.query(
          "UPDATE tiers SET quantity_sold = quantity_sold + $1 WHERE id = $2",
          [item.quantity, item.tier_id]
        );
      }

      return order;
    });

    // Phase 2 — External call: ask AbacatePay to create a checkout
    // This is outside the transaction, so slow network calls don't hold row locks.
    let checkoutUrl: string | null = null;
    let billingId: string | null = null;
    try {
      const abacateData = await createCheckout({
        amountCents: order.amount_cents,
        customerEmail: attendee_email,
        customerName: attendee_name || undefined,
        reference,
        completionUrl: `${appUrl}/order/${reference}/success`,
        notificationUrl: `${appUrl}/api/webhooks/abacatepay`,
      });
      checkoutUrl = abacateData.checkoutUrl;
      billingId = abacateData.id;
    } catch (abacateError) {
      console.error("AbacatePay checkout creation failed:", abacateError);
      // Order is already in the DB as 'pending' with no billing.
      // Capacity will be released by the cron handler (expires pending orders >30min).
      // The attendee can retry with the same idempotency_key.
      return err(
        "Falha ao processar pagamento. Tente novamente em alguns instantes.",
        502,
        "payment_unavailable"
      );
    }

    // Update order with the billing details from AbacatePay
    await query(
      "UPDATE orders SET abacatepay_billing_id = $1, abacatepay_checkout_url = $2 WHERE id = $3",
      [billingId, checkoutUrl, order.id]
    );

    // Re-fetch the updated order to return
    const updatedOrder = (await query("SELECT * FROM orders WHERE id = $1", [order.id])).rows[0];

    return ok({
      order_reference: reference,
      checkout_url: checkoutUrl,
      order: updatedOrder,
    }, 201);
  } catch (caughtErr: any) {
    // Structured errors from the transaction
    if (caughtErr.statusCode) {
      return err(caughtErr.message, caughtErr.statusCode, caughtErr.code);
    }
    console.error("Checkout error:", caughtErr);
    return err("Internal server error", 500);
  }
};