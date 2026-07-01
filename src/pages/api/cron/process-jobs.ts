import type { APIRoute } from "astro";
export const prerender = false;

import { query } from "../../../lib/db";
import { JOB_TYPES } from "../../../lib/constants";
import { sendEmail } from "../../../lib/email";
import { buildConfirmationEmail } from "../../../lib/email-templates";
import { ok, err } from "../../../lib/api-utils";

/**
 * POST /api/cron/process-jobs
 * Protected by CRON_SECRET env var. Processes pending jobs in the pending_jobs table.
 */
export const POST: APIRoute = async (context) => {
  try {
    const authHeader = context.request.headers.get("authorization");
    const expectedSecret = process.env.CRON_SECRET;
    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return err("Unauthorized", 401, "unauthorized");
    }

    const MAX_RETRIES = 3;
    const BATCH_SIZE = 10;

    // Fetch next batch of pending jobs
    const jobsResult = await query(
      "SELECT * FROM pending_jobs WHERE status = 'pending' AND retries < $1 ORDER BY created_at ASC LIMIT $2",
      [MAX_RETRIES, BATCH_SIZE]
    );
    const jobs = jobsResult.rows;

    for (const job of jobs) {
      // Mark as processing
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

        } else if (job.job_type === JOB_TYPES.PROCESS_EXPIRED_ORDERS) {
          // Mark orders older than 30 minutes as expired
          const expiredResult = await query(
            "UPDATE orders SET status = 'expired' WHERE status = 'pending' AND created_at < NOW() - INTERVAL '30 minutes' RETURNING id"
          );
          await query("UPDATE pending_jobs SET status = 'done' WHERE id = $1", [job.id]);

        } else {
          // Unknown job type — mark as done to avoid clogging the queue
          await query("UPDATE pending_jobs SET status = 'done' WHERE id = $1", [job.id]);
        }
      } catch (jobErr) {
        console.error(`Job ${job.id} (${job.job_type}) failed:`, jobErr);
        await query(
          "UPDATE pending_jobs SET status = 'pending', retries = retries + 1 WHERE id = $1 AND retries < $2",
          [job.id, MAX_RETRIES]
        );
      }
    }

    return ok({ processed: jobs.length });
  } catch (caughtErr) {
    console.error("Cron error:", caughtErr);
    return err("Internal server error", 500);
  }
};