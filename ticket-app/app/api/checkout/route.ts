import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { checkoutSchema } from "@/lib/validation";
import { calculateFees } from "@/lib/fees";
import { generateOrderReference } from "@/lib/utils";
import { createCheckout } from "@/lib/abacatepay";
import { ok, err } from "@/lib/api-utils";

/**
 * POST /api/checkout — Create an order and initiate AbacatePay checkout.
 *
 * Atomicity strategy (see SPECIFICATIONS.md §3.5):
 * 1. All tier locking, capacity checks, order creation happen inside a single
 *    PL/pgSQL RPC with SELECT ... FOR UPDATE (no TOCTOU gap).
 * 2. Idempotency is handled inside the RPC transaction — duplicate idempotency_key
 *    returns the existing order instead of creating a new one.
 * 3. AbacatePay checkout creation happens AFTER the order is committed. If it
 *    fails, the order stays 'pending' and the user gets an error to retry.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = checkoutSchema.safeParse(body);

    if (!parsed.success) {
      return err("Validation failed: " + parsed.error.issues.map((i) => i.message).join("; "), 400, "validation_error");
    }

    const { event_id, items, attendee_email, attendee_name, idempotency_key } = parsed.data;
    const supabase = createServerClient();

    // 1. Fetch event and organizer
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, organizer_id, title, status")
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return err("Event not found", 404, "not_found");
    }

    if (event.status !== "published") {
      return err("Event is not available", 400, "event_not_available");
    }

    // 2. Fetch tier info for fee calculation and tier name mapping.
    // Capacity validation is handled atomically inside the RPC with FOR UPDATE.
    // Deduplicate tier IDs before the query — a client may send multiple items
    // for the same tier (e.g., {tier_id: "A", qty: 2}, {tier_id: "A", qty: 1}).
    const uniqueTierIds = [...new Set(items.map((i) => i.tier_id))];
    const { data: tiers, error: tiersError } = await supabase
      .from("tiers")
      .select("id, event_id, name, price_cents")
      .in("id", uniqueTierIds);

    if (tiersError || !tiers || tiers.length !== uniqueTierIds.length) {
      return err("One or more tiers not found", 404, "tier_not_found");
    }

    // Verify all tiers belong to this event
    const allTiersBelong = tiers.every((t) => t.event_id === event_id);
    if (!allTiersBelong) {
      return err("Invalid tier selection", 400, "invalid_tier");
    }

    const tierMap = new Map(tiers.map((t) => [t.id, t]));

    // 3. Calculate fees
    let subtotalCents = 0;
    for (const item of items) {
      const tier = tierMap.get(item.tier_id)!;
      subtotalCents += tier.price_cents * item.quantity;
    }

    const fees = calculateFees(subtotalCents);
    const reference = generateOrderReference();

    // 4. Create AbacatePay checkout FIRST
    // We call AbacatePay before creating the order so that the billing
    // ID and checkout URL can be stored atomically inside the RPC.
    // If AbacatePay fails, no order is created (no dangling state).
    let checkoutUrl: string | null = null;
    let billingId: string | null = null;

    try {
      const abacateData = await createCheckout({
        amountCents: fees.total_cents,
        customerEmail: attendee_email,
        customerName: attendee_name || undefined,
        reference,
        completionUrl: `${process.env.NEXT_PUBLIC_APP_URL}/order/${reference}/success`,
        notificationUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/abacatepay`,
      });

      checkoutUrl = abacateData.checkoutUrl || null;
      billingId = abacateData.id || null;
    } catch (abacateError) {
      console.error("AbacatePay checkout creation failed:", abacateError);

      // No order was created, so no retry job needed yet.
      // Return 502 so the client can retry the whole checkout.
      return err("Payment provider temporarily unavailable. Please try again.", 502, "payment_unavailable");
    }

    // 5. Atomic order creation via RPC (with billing info)
    // The RPC locks tiers with FOR UPDATE, checks capacity, increments quantity_sold,
    // inserts the order and order_items — all in one transaction.
    // Idempotency is handled inside. Billing info is set atomically.
    const { data: orderResult, error: orderError } = await supabase.rpc(
      "create_order_atomic",
      {
        p_event_id: event_id,
        p_organizer_id: event.organizer_id,
        p_attendee_email: attendee_email,
        p_attendee_name: attendee_name || null,
        p_amount_cents: fees.total_cents,
        p_fee_cents: fees.platform_fee_cents,
        p_abacatepay_fee_cents: fees.abacatepay_fee_cents,
        p_reference: reference,
        p_idempotency_key: idempotency_key,
        p_items: items.map((i) => ({
          tier_id: i.tier_id,
          tier_name: tierMap.get(i.tier_id)!.name,
          quantity: i.quantity,
          unit_price_cents: tierMap.get(i.tier_id)!.price_cents,
        })),
        p_billing_id: billingId,
        p_checkout_url: checkoutUrl,
      }
    );

    if (orderError) {
      const msg = orderError.message.toLowerCase();
      if (msg.includes("insufficient") || msg.includes("capacity")) {
        return err("One or more tiers do not have enough available tickets", 409, "insufficient_capacity");
      }
      if (msg.includes("tier not found")) {
        return err("Invalid tier selection", 400, "invalid_tier");
      }
      console.error("Atomic checkout error:", orderError);
      return err("Checkout failed. Please try again.", 500, "checkout_error");
    }

    // 6. Parse RPC result
    const order = orderResult as Record<string, unknown>;
    const isIdempotent = order._idempotent === true;
    const actualReference = order.reference as string;

    return ok(
      {
        order_reference: actualReference,
        checkout_url: checkoutUrl,
        order: { ...order, abacatepay_checkout_url: checkoutUrl, abacatepay_billing_id: billingId },
      },
      isIdempotent ? 200 : 201
    );
  } catch (caughtErr) {
    console.error("Checkout error:", caughtErr);
    return err("Internal server error", 500);
  }
}