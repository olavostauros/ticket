import type { APIRoute } from "astro";
export const prerender = false;

import { query } from "../../lib/db";
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

    // Fetch event
    const eventResult = await query("SELECT id, organizer_id, title, status FROM events WHERE id = $1", [event_id]);
    const event = eventResult.rows[0];
    if (!event) return err("Event not found", 404, "not_found");
    if (event.status !== "published") return err("Event is not available", 400, "event_not_available");

    // Fetch tiers and verify capacity
    const uniqueTierIds = [...new Set(items.map((i: any) => i.tier_id))];
    const tiersResult = await query("SELECT * FROM tiers WHERE id = ANY($1::uuid[])", [uniqueTierIds]);
    const tiers = tiersResult.rows;

    if (tiers.length !== uniqueTierIds.length) return err("One or more tiers not found", 404, "tier_not_found");
    const allBelong = tiers.every((t: any) => t.event_id === event_id);
    if (!allBelong) return err("Invalid tier selection", 400, "invalid_tier");

    const tierMap = new Map(tiers.map((t: any) => [t.id, t]));

    // Check capacity for each tier
    for (const item of items) {
      const tier = tierMap.get(item.tier_id);
      if (tier.quantity_sold + item.quantity > tier.quantity_total) {
        return err(`Insufficient capacity for tier: ${tier.name}`, 409, "insufficient_capacity");
      }
    }

    // Calculate fees
    let subtotalCents = 0;
    for (const item of items) {
      const tier = tierMap.get(item.tier_id);
      subtotalCents += tier.price_cents * item.quantity;
    }
    const fees = calculateFees(subtotalCents);
    const reference = generateOrderReference();

    // Call AbacatePay
    const appUrl = process.env.PUBLIC_APP_URL || "http://localhost:4321";
    let checkoutUrl: string | null = null;
    let billingId: string | null = null;

    try {
      const abacateData = await createCheckout({
        amountCents: fees.total_cents,
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
      return err("Payment provider temporarily unavailable. Please try again.", 502, "payment_unavailable");
    }

    // Insert order
    const orderResult = await query(
      `INSERT INTO orders (event_id, organizer_id, attendee_email, attendee_name, amount_cents, fee_cents, abacatepay_fee_cents, reference, idempotency_key, status, abacatepay_billing_id, abacatepay_checkout_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11)
       RETURNING *`,
      [event_id, event.organizer_id, attendee_email, attendee_name || null, fees.total_cents, fees.platform_fee_cents, fees.abacatepay_fee_cents, reference, idempotency_key, billingId, checkoutUrl]
    );
    const order = orderResult.rows[0];

    // Insert order items
    for (const item of items) {
      const tier = tierMap.get(item.tier_id);
      await query(
        "INSERT INTO order_items (order_id, tier_id, tier_name, quantity, unit_price_cents) VALUES ($1, $2, $3, $4, $5)",
        [order.id, item.tier_id, tier.name, item.quantity, tier.price_cents]
      );
    }

    return ok({
      order_reference: reference,
      checkout_url: checkoutUrl,
      order,
    }, 201);
  } catch (caughtErr) {
    console.error("Checkout error:", caughtErr);
    return err("Internal server error", 500);
  }
};