import type { APIRoute } from "astro";
export const prerender = false;

import { query } from "../../../lib/db";
import { verifyWebhookSignature } from "../../../lib/abacatepay";
import { abacatepayWebhookSchema } from "../../../lib/validation";
import { JOB_TYPES } from "../../../lib/constants";
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

    // Defer all heavy work to the job queue — webhook returns 200 immediately.
    if (payload.event === "checkout.completed") {
      const { id: billingId, reference } = payload.data;

      // Avoid inserting duplicate jobs for the same order
      const existing = await query(
        "SELECT id FROM pending_jobs WHERE job_type = $1 AND payload->>'reference' = $2 AND status = 'pending'",
        [JOB_TYPES.PROCESS_PAID_ORDER, reference]
      );
      if (!existing.rows[0]) {
        await query(
          "INSERT INTO pending_jobs (job_type, payload) VALUES ($1, $2)",
          [
            JOB_TYPES.PROCESS_PAID_ORDER,
            JSON.stringify({ billing_id: billingId, reference }),
          ]
        );
      }

      return ok({ received: true });
    }

    if (payload.event === "checkout.lost") {
      const { reference } = payload.data;

      const existing = await query(
        "SELECT id FROM pending_jobs WHERE job_type = $1 AND payload->>'reference' = $2 AND status = 'pending'",
        [JOB_TYPES.PROCESS_LOST_ORDER, reference]
      );
      if (!existing.rows[0]) {
        await query(
          "INSERT INTO pending_jobs (job_type, payload) VALUES ($1, $2)",
          [
            JOB_TYPES.PROCESS_LOST_ORDER,
            JSON.stringify({ reference }),
          ]
        );
      }

      return ok({ received: true });
    }

    return ok({ received: true });
  } catch (caughtErr) {
    console.error("Webhook error:", caughtErr);
    return err("Internal server error", 500);
  }
};