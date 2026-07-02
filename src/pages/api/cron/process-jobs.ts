import type { APIRoute } from "astro";
export const prerender = false;

import { query, withTransaction } from "../../../lib/db";
import { JOB_TYPES } from "../../../lib/constants";
import { sendEmail } from "../../../lib/email";
import { buildConfirmationEmail } from "../../../lib/email-templates";
import { ok, err } from "../../../lib/api-utils";

/**
 * POST /api/cron/process-jobs
 * Protected by CRON_SECRET env var. Processes pending jobs in the pending_jobs table.
 *
 * Foundation invariants:
 * 1. State-changing operations (order updates, ticket generation, capacity release)
 *    run inside withTransaction() so partial crashes never leave inconsistent state.
 * 2. Side-effects like email sending are enqueued as separate SEND_CONFIRMATION_EMAIL
 *    jobs — they get retry semantics instead of being fire-and-forget.
 */
export const POST: APIRoute = async (context) => {
  try {
    const authHeader = context.request.headers.get("authorization");
    const expectedSecret = process.env.CRON_SECRET;
    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return err("Unauthorized", 401, "unauthorized");
    }

    // --- Housekeeping: expire stale pending orders (runs every tick) ---
    // Uses FOR UPDATE SKIP LOCKED so concurrent cron invocations don't
    // fight over the same rows — each stale order is claimed by exactly
    // one invocation. Everything runs inside withTransaction() so a crash
    // between releasing capacity and updating the order status never
    // leaks capacity or leaves inconsistent state.
    await withTransaction(async (client) => {
      const staleOrders = await client.query(
        `SELECT id FROM orders
         WHERE status = 'pending' AND created_at < NOW() - INTERVAL '30 minutes'
         FOR UPDATE SKIP LOCKED`
      );
      for (const staleOrder of staleOrders.rows) {
        const items = await client.query(
          "SELECT * FROM order_items WHERE order_id = $1",
          [staleOrder.id]
        );
        for (const item of items.rows) {
          await client.query(
            "UPDATE tiers SET quantity_sold = GREATEST(0, quantity_sold - $1) WHERE id = $2",
            [item.quantity, item.tier_id]
          );
        }
        await client.query(
          "UPDATE orders SET status = 'expired' WHERE id = $1",
          [staleOrder.id]
        );
      }
    });

    const MAX_RETRIES = 3;
    const BATCH_SIZE = 10;

    // Fetch next batch of pending jobs
    const jobsResult = await query(
      "SELECT * FROM pending_jobs WHERE status = 'pending' AND retries < $1 ORDER BY created_at ASC LIMIT $2",
      [MAX_RETRIES, BATCH_SIZE]
    );
    const jobs = jobsResult.rows;

    for (const job of jobs) {
      // Mark as processing (stops it from being re-fetched; if we crash here,
      // the job stays 'processing' and a subsequent cron run with a wider
      // "processing OR pending" query could rescue it — acceptable for MVP)
      await query("UPDATE pending_jobs SET status = 'processing' WHERE id = $1", [job.id]);

      try {
        const payload = typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload;

        if (job.job_type === JOB_TYPES.SEND_CONFIRMATION_EMAIL) {
          const { to, orderReference, ticketUrls } = payload;
          await sendEmail({
            to,
            subject: "🎟️ Compra confirmada!",
            html: buildConfirmationEmail({
              attendeeName: to,
              orderReference,
              ticketUrls,
            }),
          });
          await query("UPDATE pending_jobs SET status = 'done' WHERE id = $1", [job.id]);

        } else if (job.job_type === JOB_TYPES.PROCESS_PAID_ORDER) {
          const { billing_id, reference } = payload;

          // Everything inside withTransaction is atomic — crash between steps = full rollback.
          const ticketUrls: string[] = await withTransaction(async (client) => {
            // Find the order inside the transaction
            const orderResult = await client.query(
              "SELECT * FROM orders WHERE reference = $1 FOR UPDATE",
              [reference]
            );
            const order = orderResult.rows[0];
            if (!order) {
              throw Object.assign(new Error(`Order ${reference} not found`), { code: "NOT_FOUND" });
            }

            // Idempotency: skip if already paid
            if (order.status === "paid") {
              return []; // signals "already done"
            }

            // Update order status and billing id
            await client.query(
              "UPDATE orders SET status = 'paid', abacatepay_billing_id = $1 WHERE id = $2",
              [billing_id, order.id]
            );

            // Fetch order items
            const itemsResult = await client.query(
              "SELECT * FROM order_items WHERE order_id = $1",
              [order.id]
            );
            const items = itemsResult.rows;

            // Generate tickets (quantity_sold already incremented at order creation)
            const urls: string[] = [];
            const appUrl = process.env.PUBLIC_APP_URL || "http://localhost:4321";
            for (const item of items) {
              for (let i = 0; i < item.quantity; i++) {
                const ticketResult = await client.query(
                  "INSERT INTO tickets (order_id, event_id, tier_id, organizer_id, holder_name, holder_email) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, unique_code",
                  [order.id, order.event_id, item.tier_id, order.organizer_id, order.attendee_name || order.attendee_email, order.attendee_email]
                );
                const ticket = ticketResult.rows[0];
                urls.push(`${appUrl}/tickets/${ticket.unique_code}`);
              }
            }

            // Enqueue the confirmation email job (inside the same transaction)
            await client.query(
              "INSERT INTO pending_jobs (job_type, payload) VALUES ($1, $2)",
              [
                JOB_TYPES.SEND_CONFIRMATION_EMAIL,
                JSON.stringify({
                  to: order.attendee_email,
                  orderReference: reference,
                  ticketUrls: urls,
                }),
              ]
            );

            return urls;
          });

          // Idempotency path (order was already paid, nothing to do)
          // ticketUrls is empty when already-paid path was taken
          await query("UPDATE pending_jobs SET status = 'done' WHERE id = $1", [job.id]);

        } else if (job.job_type === JOB_TYPES.PROCESS_LOST_ORDER) {
          const { reference } = payload;

          await withTransaction(async (client) => {
            const orderResult = await client.query(
              "SELECT * FROM orders WHERE reference = $1 FOR UPDATE",
              [reference]
            );
            const order = orderResult.rows[0];
            if (!order) {
              throw Object.assign(new Error(`Order ${reference} not found`), { code: "NOT_FOUND" });
            }

            // Idempotency: only void pending orders
            if (order.status === "lost" || order.status === "expired" || order.status === "paid") {
              return; // already in a terminal state
            }

            // Release capacity: decrement quantity_sold for each tier
            const itemsResult = await client.query(
              "SELECT * FROM order_items WHERE order_id = $1",
              [order.id]
            );
            for (const item of itemsResult.rows) {
              await client.query(
                "UPDATE tiers SET quantity_sold = GREATEST(0, quantity_sold - $1) WHERE id = $2",
                [item.quantity, item.tier_id]
              );
            }

            await client.query("UPDATE orders SET status = 'lost' WHERE id = $1", [order.id]);
          });

          await query("UPDATE pending_jobs SET status = 'done' WHERE id = $1", [job.id]);

        } else {
          // Unknown job type — mark as done to avoid clogging the queue
          await query("UPDATE pending_jobs SET status = 'done' WHERE id = $1", [job.id]);
        }
      } catch (jobErr: any) {
        // NOT_FOUND means the order disappeared — mark as done, no retry needed
        if (jobErr?.code === "NOT_FOUND") {
          await query("UPDATE pending_jobs SET status = 'done' WHERE id = $1", [job.id]);
        } else {
          console.error(`Job ${job.id} (${job.job_type}) failed:`, jobErr);
          await query(
            "UPDATE pending_jobs SET status = 'pending', retries = retries + 1 WHERE id = $1 AND retries < $2",
            [job.id, MAX_RETRIES]
          );
        }
      }
    }

    return ok({ processed: jobs.length });
  } catch (caughtErr) {
    console.error("Cron error:", caughtErr);
    return err("Internal server error", 500);
  }
};