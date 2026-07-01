import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyWebhookSignature } from "@/lib/abacatepay";
import { abacatepayWebhookSchema } from "@/lib/validation";
import { JOB_TYPES } from "@/lib/constants";
import { ok, err } from "@/lib/api-utils";

/**
 * POST /api/webhooks/abacatepay — Webhook receiver for AbacatePay.
 *
 * Steps:
 * 1. Verify HMAC-SHA256 signature via shared lib
 * 2. Validate payload schema (discriminated union — TypeScript narrows data shape)
 * 3. Process the event inline using atomic RPCs (order status + tickets in one txn)
 * 4. Enqueue email as async best-effort (tickets already created, email can retry)
 * 5. Return 200 immediately
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verify HMAC signature
    const signature = request.headers.get("x-abacatepay-signature") || "";

    if (!signature) {
      return err("Missing signature header", 401, "missing_signature");
    }

    const rawBody = await request.text();

    const isValid = await verifyWebhookSignature(rawBody, signature);

    if (!isValid) {
      return err("Invalid signature", 401, "invalid_signature");
    }

    // 2. Parse and validate
    const body = JSON.parse(rawBody);
    const parsed = abacatepayWebhookSchema.safeParse(body);

    if (!parsed.success) {
      return err("Invalid webhook payload", 400, "invalid_payload");
    }

    const payload = parsed.data;
    const supabase = createServerClient();

    // 3. Handle specific events
    if (payload.event === "checkout.completed") {
      const { id: billingId, reference } = payload.data;

      const { data: result, error: rpcError } = await supabase.rpc(
        "process_paid_order_atomic",
        {
          p_reference: reference,
          p_billing_id: billingId,
        }
      );

      if (rpcError) {
        console.error("Failed to process paid order via webhook:", rpcError);
        return err("Failed to process payment confirmation", 500, "rpc_error");
      }

      const rpcResult = result as Record<string, unknown>;
      const isIdempotent = rpcResult._idempotent === true;

      // Confirmation email is enqueued inside the RPC (process_paid_order_atomic).
      // No separate job insert needed here.
    }

    if (payload.event === "checkout.lost") {
      const { id: billingId, reference } = payload.data;

      const { error: voidError } = await supabase.rpc("void_order_atomic", {
        p_reference: reference,
        p_billing_id: billingId || null,
        p_new_status: "lost",
      });

      if (voidError) {
        console.error("Failed to void lost order via webhook:", voidError);
        return err("Failed to process lost payment", 500, "rpc_error");
      }
    }

    // Unrecognized events are acknowledged but logged so monitoring
    // can detect new AbacatePay event types that may need handling
    console.warn(
      `[webhook] Unhandled event type: ${(payload as Record<string, unknown>).event || "unknown"}`
    );
    return ok({ received: true });
  } catch (caughtErr) {
    console.error("Webhook error:", caughtErr);
    return err("Internal server error", 500);
  }
}
