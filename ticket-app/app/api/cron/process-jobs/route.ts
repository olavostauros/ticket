import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { JOB_TYPES } from "@/lib/constants";
import { createCheckout } from "@/lib/abacatepay";
import { sendEmail } from "@/lib/email";
import { buildConfirmationEmail, buildWelcomeEmail } from "@/lib/email-templates";
import { ok, err } from "@/lib/api-utils";

/**
 * GET /api/cron/process-jobs — Drain the pending_jobs queue.
 *
 * Vercel Cron Jobs fire GET requests. We export both GET and POST
 * for compatibility (webhooks may POST).
 *
 * Protected by JOB_PROCESSOR_SECRET. Uses a Supabase RPC with
 * SELECT ... FOR UPDATE SKIP LOCKED to prevent duplicate processing.
 *
 * Designed to be called by:
 *   - Vercel Cron Jobs (free tier: runs every minute)
 *   - A setTimeout loop in the webhook handler
 */
export async function GET(request: NextRequest) {
  return handleProcessJobs(request);
}

/**
 * POST /api/cron/process-jobs — Same as GET for webhook compatibility.
 */
export async function POST(request: NextRequest) {
  return handleProcessJobs(request);
}

async function handleProcessJobs(request: NextRequest) {
  try {
    // Authenticate the cron caller
    const authHeader = request.headers.get("authorization");
    const queryToken = request.nextUrl.searchParams.get("token");
    // Support both JOB_PROCESSOR_SECRET (manual) and CRON_SECRET (Vercel Cron Jobs built-in)
    const expectedToken = process.env.JOB_PROCESSOR_SECRET || process.env.CRON_SECRET;

    if (!expectedToken) {
      return err("Server configuration error", 500, "config_error");
    }

    const providedToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : queryToken;

    if (providedToken !== expectedToken) {
      return err("Unauthorized", 401, "unauthorized");
    }

    const supabase = createServerClient();

    // Maintenance: expire stale pending orders
    const { data: expiredOrders, error: expireError } = await supabase.rpc(
      "expire_stale_orders",
      { p_max_age_minutes: 30 }
    );

    if (expireError) {
      console.error("Failed to expire stale orders:", expireError);
    } else if (expiredOrders && expiredOrders.length > 0) {
      console.log(`Expired ${expiredOrders.length} stale pending orders`);
    }

    // Process queued jobs
    const { data: jobs, error: fetchError } = await supabase.rpc("fetch_pending_jobs", {
      p_limit: 10,
    });

    if (fetchError) {
      console.error("Failed to fetch pending jobs:", fetchError);
      return err("Failed to fetch jobs", 500, "db_error");
    }

    const results: Array<{ id: string; job_type: string; status: string }> = [];

    for (const job of (jobs || [])) {
      try {
        await processJob(supabase, job);
        await supabase
          .from("pending_jobs")
          .update({ status: "done" })
          .eq("id", job.id);
        results.push({ id: job.id, job_type: job.job_type, status: "done" });
      } catch (processErr) {
        console.error(`Job ${job.id} (${job.job_type}) failed:`, processErr);
        const newRetries = (job.retries || 0) + 1;
        const newStatus = newRetries >= (job.max_retries || 3) ? "failed" : "pending";

        await supabase
          .from("pending_jobs")
          .update({
            status: newStatus,
            retries: newRetries,
          })
          .eq("id", job.id);

        results.push({ id: job.id, job_type: job.job_type, status: newStatus });
      }
    }

    return ok({
      processed: results.length,
      results,
    });
  } catch (caughtErr) {
    console.error("Job processor error:", caughtErr);
    return err("Internal server error", 500);
  }
}

// Job handlers

async function processJob(
  supabase: ReturnType<typeof createServerClient>,
  job: { id: string; job_type: string; payload: Record<string, unknown> }
) {
  switch (job.job_type) {
    case JOB_TYPES.PROCESS_PAID_ORDER:
      return handleProcessPaidOrder(supabase, job);

    case JOB_TYPES.PROCESS_LOST_ORDER:
      return handleProcessLostOrder(supabase, job);

    case JOB_TYPES.RETRY_ABACATEPAY_CHECKOUT:
      return handleRetryAbacatePayCheckout(supabase, job);

    case JOB_TYPES.SEND_CONFIRMATION_EMAIL:
      return handleSendConfirmationEmail(supabase, job);

    case JOB_TYPES.SEND_WELCOME_EMAIL:
      return handleSendWelcomeEmail(supabase, job);

    default:
      console.warn(`Unknown job type: ${job.job_type}`);
  }
}

async function handleProcessPaidOrder(
  supabase: ReturnType<typeof createServerClient>,
  job: { payload: Record<string, unknown> }
) {
  const { reference, billing_id } = job.payload as {
    reference: string;
    billing_id: string;
  };

  const { data: result, error: rpcError } = await supabase.rpc(
    "process_paid_order_atomic",
    {
      p_reference: reference,
      p_billing_id: billing_id || null,
    }
  );

  if (rpcError) {
    throw new Error(`Failed to process paid order ${reference}: ${rpcError.message}`);
  }

  const rpcResult = result as Record<string, unknown>;
  const isIdempotent = rpcResult._idempotent === true;
  const ticketArr = (rpcResult.tickets || []) as Array<{ unique_code: string }>;
  const ticketCodes = ticketArr.map((t) => t.unique_code);

  if (isIdempotent) {
    return;
  }

  // Confirmation email is enqueued inside the RPC (process_paid_order_atomic).
  // No inline sendConfirmationEmail call — the cron processor handles it via the job queue.
}

async function handleProcessLostOrder(
  supabase: ReturnType<typeof createServerClient>,
  job: { payload: Record<string, unknown> }
) {
  const { reference, billing_id } = job.payload as {
    reference: string;
    billing_id: string;
  };

  const { data: result, error: voidError } = await supabase.rpc("void_order_atomic", {
    p_reference: reference,
    p_billing_id: billing_id || null,
    p_new_status: "lost",
  });

  if (voidError) {
    throw new Error(`Failed to void order ${reference}: ${voidError.message}`);
  }

  const rpcResult = result as Record<string, unknown>;
  if (rpcResult._idempotent === true) {
    return;
  }
}

async function handleRetryAbacatePayCheckout(
  supabase: ReturnType<typeof createServerClient>,
  job: { payload: Record<string, unknown> }
) {
  const { reference, idempotency_key } = job.payload as {
    reference: string;
    idempotency_key: string;
  };

  const { data: order } = await supabase
    .from("orders")
    .select("reference, amount_cents, attendee_email, attendee_name, abacatepay_checkout_url")
    .eq("reference", reference)
    .single();

  if (!order) {
    throw new Error(`Order not found: ${reference}`);
  }

  if (order.abacatepay_checkout_url) {
    return;
  }

  const data = await createCheckout({
    amountCents: order.amount_cents,
    customerEmail: order.attendee_email,
    customerName: order.attendee_name || undefined,
    reference,
    completionUrl: `${process.env.NEXT_PUBLIC_APP_URL}/order/${reference}/success`,
    notificationUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/abacatepay`,
  });

  await supabase
    .from("orders")
    .update({
      abacatepay_checkout_url: data.checkoutUrl || null,
      abacatepay_billing_id: data.id || null,
    })
    .eq("reference", reference);
}

async function handleSendConfirmationEmail(
  supabase: ReturnType<typeof createServerClient>,
  job: { payload: Record<string, unknown> }
) {
  const { order_reference, attendee_email, attendee_name, ticket_codes } = job.payload as {
    order_reference: string;
    attendee_email: string;
    attendee_name?: string;
    ticket_codes?: string[];
  };

  // Ticket codes are always populated by process_paid_order_atomic RPC.
  // The fallback below is only reached if the job was enqueued manually
  // (e.g., from an admin tool) without ticket_codes.
  let ticketCodes = ticket_codes;

  if (!ticketCodes || ticketCodes.length === 0) {
    const { data: order } = await supabase
      .from("orders")
      .select("*, tickets(unique_code)")
      .eq("reference", order_reference)
      .single();

    if (!order) {
      throw new Error(`Order not found: ${order_reference}`);
    }

    const tickets = (order.tickets || []) as Array<{ unique_code: string }>;
    if (tickets.length === 0) {
      throw new Error(`No tickets found for order: ${order_reference}`);
    }

    ticketCodes = tickets.map((t) => t.unique_code);
  }

  await sendConfirmationEmail({
    attendeeEmail: attendee_email,
    attendeeName: attendee_name || undefined,
    orderReference: order_reference,
    ticketCodes,
  });
}

// Shared helpers

async function handleSendWelcomeEmail(
  supabase: ReturnType<typeof createServerClient>,
  job: { payload: Record<string, unknown> }
) {
  const { email, name } = job.payload as {
    email: string;
    name: string;
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ticket.app";

  await sendEmail({
    to: email,
    subject: "Bem-vindo ao Ticket! 🎟️",
    html: buildWelcomeEmail({ name, appUrl }),
  });
}

async function sendConfirmationEmail(opts: {
  attendeeEmail: string;
  attendeeName?: string;
  orderReference: string;
  ticketCodes: string[];
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ticket.app";
  const ticketUrls = opts.ticketCodes.map(
    (code) => `${appUrl}/tickets/${code}`
  );

  await sendEmail({
    to: opts.attendeeEmail,
    subject: `Seus ingressos para o evento — Pedido ${opts.orderReference}`,
    html: buildConfirmationEmail({
      attendeeName: opts.attendeeName || "Olá",
      orderReference: opts.orderReference,
      ticketUrls,
    }),
  });
}