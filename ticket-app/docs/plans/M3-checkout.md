# Milestone 3: Checkout & Payment

**Goal:** An attendee can buy tickets, pay via AbacatePay, and the payment is confirmed via webhook without overselling.

## Dependencies

- Milestone 2 complete (events + tiers + public event page)
- AbacatePay merchant account set up (API key in env vars)
- AbacatePay webhook endpoint configured in AbacatePay dashboard to point at `https://your-domain.com/api/webhooks/abacatepay`

## Step-by-step

### 3.1 — AbacatePay client

**`src/lib/abacatepay.ts`**

```typescript
const ABACATEPAY_API = "https://api.abacatepay.com/v1";
const API_KEY = process.env.ABACATEPAY_API_KEY!;

interface AbacatePayCheckoutResponse {
  id: string;
  url: string;
  status: string;
}

export async function createCheckout(params: {
  amountCents: number;
  customerEmail: string;
  customerName?: string;
  returnUrl: string;
  completionUrl: string;
  metadata?: Record<string, string>;
}): Promise<AbacatePayCheckoutResponse> {
  const response = await fetch(`${ABACATEPAY_API}/checkout/create`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amountCents,
      currency: "BRL",
      customer: {
        email: params.customerEmail,
        name: params.customerName,
      },
      return_url: params.returnUrl,
      completion_url: params.completionUrl,
      metadata: params.metadata,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AbacatePay error: ${error}`);
  }

  return response.json();
}

export function verifyWebhookSignature(
  body: string,
  signature: string,
): boolean {
  const crypto = require("crypto");
  const expected = crypto
    .createHmac("sha256", API_KEY)
    .update(body)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

### 3.2 — Fee calculation

**`src/lib/pricing.ts`**

```typescript
import { PLATFORM_FEE_PERCENT, PLATFORM_FEE_FIXED_CENTS } from "./constants";

export function calculateFees(subtotalCents: number) {
  const platformFeeCents = Math.round(subtotalCents * PLATFORM_FEE_PERCENT) + PLATFORM_FEE_FIXED_CENTS;
  // AbacatePay fees: PIX is free for now; hardcode 0 for MVP
  const abacatepayFeeCents = 0;
  const totalCents = subtotalCents + platformFeeCents + abacatepayFeeCents;

  return {
    subtotalCents,
    platformFeeCents,
    abacatepayFeeCents,
    totalCents,
  };
}
```

### 3.3 — Checkout API route (atomic)

**`src/app/api/checkout/route.ts`** — the core transaction:

```typescript
import { supabase } from "@/lib/supabase";
import { err, ok } from "@/lib/api-utils";
import { createCheckout } from "@/lib/abacatepay";
import { calculateFees } from "@/lib/pricing";
import { z } from "zod";

const checkoutSchema = z.object({
  event_id: z.string().uuid(),
  items: z.array(z.object({
    tier_id: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1),
  attendee_email: z.string().email(),
  attendee_name: z.string().optional(),
  idempotency_key: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return err("validation_error", parsed.error.message, 400);
  }

  const { event_id, items, attendee_email, attendee_name, idempotency_key } = parsed.data;

  // Check for duplicate idempotency key
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id, reference, abacatepay_checkout_url, status")
    .eq("idempotency_key", idempotency_key)
    .maybeSingle();

  if (existingOrder) {
    return ok({
      order: existingOrder,
      checkout_url: existingOrder.abacatepay_checkout_url,
    });
  }

  // Start a Supabase transaction using a stored procedure or raw SQL
  // Supabase JS client doesn't support transactions natively, so we use rpc()
  const { data: txResult, error: txError } = await supabase.rpc("checkout_lock_tiers", {
    p_event_id: event_id,
    p_items: items,
    p_attendee_email: attendee_email,
    p_attendee_name: attendee_name || null,
    p_idempotency_key: idempotency_key,
  });

  if (txError) {
    if (txError.message.includes("insufficient_capacity")) {
      return err("insufficient_capacity", "Not enough tickets available", 409);
    }
    return err("checkout_error", txError.message, 500);
  }

  const order = txResult;

  // Create AbacatePay checkout
  try {
    const checkout = await createCheckout({
      amountCents: order.amount_cents,
      customerEmail: attendee_email,
      customerName: attendee_name,
      returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/events/${event_id}`,
      completionUrl: `${process.env.NEXT_PUBLIC_APP_URL}/orders/${order.reference}`,
      metadata: {
        order_id: order.id,
        event_id,
      },
    });

    // Update order with AbacatePay checkout info
    await supabase
      .from("orders")
      .update({
        abacatepay_billing_id: checkout.id,
        abacatepay_checkout_url: checkout.url,
      })
      .eq("id", order.id);

    return ok({
      order_reference: order.reference,
      checkout_url: checkout.url,
      order,
    }, 201);
  } catch (abacateError: any) {
    // Payment gateway failed - void the order and release capacity
    await supabase.rpc("void_order", { p_order_id: order.id });
    return err("payment_gateway_error", "Failed to initiate payment", 502);
  }
}
```

### 3.4 — PostgreSQL functions for atomic checkout

**`supabase/migrations/00002_checkout_functions.sql`**

```sql
-- Atomic checkout: lock tiers, check capacity, create order + items in one transaction
CREATE OR REPLACE FUNCTION checkout_lock_tiers(
  p_event_id UUID,
  p_items JSONB,
  p_attendee_email TEXT,
  p_attendee_name TEXT,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_reference TEXT;
  v_subtotal INTEGER := 0;
  v_platform_fee INTEGER;
  v_abacatepay_fee INTEGER := 0;
  v_total INTEGER;
  v_item JSONB;
  v_tier_id UUID;
  v_qty INTEGER;
  v_tier RECORD;
  v_organizer_id UUID;
BEGIN
  -- Get event organizer
  SELECT organizer_id INTO v_organizer_id FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  -- Lock and validate each tier
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_tier_id := (v_item->>'tier_id')::UUID;
    v_qty := (v_item->>'quantity')::INTEGER;

    SELECT * INTO v_tier
    FROM tiers
    WHERE id = v_tier_id AND event_id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'tier_not_found';
    END IF;

    IF (v_tier.quantity_total - v_tier.quantity_sold) < v_qty THEN
      RAISE EXCEPTION 'insufficient_capacity';
    END IF;

    -- Increment sold count
    UPDATE tiers SET quantity_sold = quantity_sold + v_qty WHERE id = v_tier_id;

    -- Calculate subtotal
    v_subtotal := v_subtotal + (v_tier.price_cents * v_qty);
  END LOOP;

  -- Generate reference (8-char alphanumeric)
  v_reference := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  -- Calculate fees
  v_platform_fee := round(v_subtotal * 0.05) + 50;

  -- Create order
  INSERT INTO orders (
    event_id, organizer_id, attendee_email, attendee_name,
    amount_cents, fee_cents, abacatepay_fee_cents, currency,
    status, reference, idempotency_key
  ) VALUES (
    p_event_id, v_organizer_id, p_attendee_email, p_attendee_name,
    v_subtotal + v_platform_fee + v_abacatepay_fee,
    v_platform_fee, v_abacatepay_fee, 'BRL',
    'pending', v_reference, p_idempotency_key
  )
  RETURNING id INTO v_order_id;

  -- Create order items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_tier_id := (v_item->>'tier_id')::UUID;
    v_qty := (v_item->>'quantity')::INTEGER;

    INSERT INTO order_items (order_id, tier_id, tier_name, quantity, unit_price_cents)
    SELECT v_order_id, v_tier_id, name, v_qty, price_cents
    FROM tiers WHERE id = v_tier_id;
  END LOOP;

  -- Return the created order
  RETURN (
    SELECT jsonb_build_object(
      'id', id,
      'reference', reference,
      'amount_cents', amount_cents,
      'fee_cents', fee_cents,
      'abacatepay_fee_cents', abacatepay_fee_cents,
      'status', status
    )
    FROM orders WHERE id = v_order_id
  );
END;
$$;

-- Void order: release capacity
CREATE OR REPLACE FUNCTION void_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Decrement tier quantity_sold for each item
  UPDATE tiers t
  SET quantity_sold = quantity_sold - oi.quantity
  FROM order_items oi
  WHERE oi.order_id = p_order_id AND t.id = oi.tier_id;

  -- Mark order as lost
  UPDATE orders SET status = 'lost' WHERE id = p_order_id;
END;
$$;
```

### 3.5 — Webhook endpoint

**`src/app/api/webhooks/abacatepay/route.ts`**

```typescript
import { supabase } from "@/lib/supabase";
import { verifyWebhookSignature } from "@/lib/abacatepay";
import { err, ok } from "@/lib/api-utils";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-abacatepay-signature") || "";

  if (!verifyWebhookSignature(body, signature)) {
    return err("invalid_signature", "Webhook signature verification failed", 401);
  }

  const payload = JSON.parse(body);

  // Idempotency: check if we already processed this billing_id
  const { data: existing } = await supabase
    .from("orders")
    .select("id, status")
    .eq("abacatepay_billing_id", payload.id)
    .maybeSingle();

  if (existing && existing.status !== "pending") {
    return ok({ status: "already_processed" }); // Idempotent
  }

  if (payload.event === "checkout.completed") {
    // Update order to paid
    const { data: order, error } = await supabase
      .from("orders")
      .update({ status: "paid" })
      .eq("abacatepay_billing_id", payload.id)
      .select()
      .single();

    if (error) return err("db_error", "Failed to update order", 500);

    // Enqueue jobs: generate tickets + send email
    await supabase.from("pending_jobs").insert([
      {
        job_type: "generate_tickets",
        payload: { order_id: order.id },
      },
      {
        job_type: "send_confirmation_email",
        payload: { order_id: order.id },
      },
    ]);
  }

  if (payload.event === "checkout.lost") {
    // Release capacity and mark lost
    const { data: order } = await supabase
      .from("orders")
      .select("id")
      .eq("abacatepay_billing_id", payload.id)
      .single();

    if (order) {
      await supabase.rpc("void_order", { p_order_id: order.id });
    }
  }

  return ok({ status: "received" });
}
```

### 3.6 — Pending jobs processor

**`src/app/api/cron/process-jobs/route.ts`** — called by Vercel Cron or a setTimeout loop:

```typescript
import { supabase } from "@/lib/supabase";
import { err, ok } from "@/lib/api-utils";

export async function POST(request: Request) {
  // Simple auth via shared secret
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return err("unauthorized", "Invalid cron secret", 401);
  }

  // Fetch pending jobs (batch of 10)
  const { data: jobs } = await supabase
    .from("pending_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  if (!jobs || jobs.length === 0) return ok({ processed: 0 });

  for (const job of jobs) {
    await supabase
      .from("pending_jobs")
      .update({ status: "processing" })
      .eq("id", job.id);

    try {
      if (job.job_type === "generate_tickets") {
        await handleGenerateTickets(job.payload);
      } else if (job.job_type === "send_confirmation_email") {
        await handleSendEmail(job.payload);
      }

      await supabase
        .from("pending_jobs")
        .update({ status: "done" })
        .eq("id", job.id);
    } catch (e) {
      const retries = job.retries + 1;
      const newStatus = retries >= job.max_retries ? "failed" : "pending";
      await supabase
        .from("pending_jobs")
        .update({ status: newStatus, retries })
        .eq("id", job.id);
    }
  }

  return ok({ processed: jobs.length });
}

async function handleGenerateTickets(payload: any) {
  const { order_id } = payload;

  const { data: order } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", order_id)
    .single();

  if (!order) throw new Error("Order not found");

  const tickets = [];
  for (const item of order.order_items) {
    for (let i = 0; i < item.quantity; i++) {
      tickets.push({
        order_id: order.id,
        event_id: order.event_id,
        tier_id: item.tier_id,
        organizer_id: order.organizer_id,
        holder_name: order.attendee_name || order.attendee_email,
        holder_email: order.attendee_email,
      });
    }
  }

  if (tickets.length > 0) {
    const { error } = await supabase.from("tickets").insert(tickets);
    if (error) throw error;
  }
}

async function handleSendEmail(payload: any) {
  // Placeholder — actual email sending is in M4
  console.log("Email job queued for order", payload.order_id);
}
```

### 3.7 — Tests

**`tests/api/checkout.test.ts`**

```typescript
import { describe, it, expect } from "vitest";

describe("POST /api/checkout", () => {
  it("rejects invalid input");
  it("returns existing order on duplicate idempotency_key");
  it("creates order and returns checkout_url for valid request");
  it("returns 409 when insufficient capacity");
  it("prevents overselling under concurrent requests");
});

describe("POST /api/webhooks/abacatepay", () => {
  it("rejects invalid HMAC signature");
  it("processes checkout.completed webhook");
  it("processes checkout.lost webhook");
  it("is idempotent for duplicate webhooks");
});
```

## Env vars to add

```
ABACATEPAY_API_KEY=abacatepay_api_key_here
CRON_SECRET=random_generated_secret
```

## Files to create

| File | Type |
|---|---|
| `src/lib/abacatepay.ts` | create |
| `src/lib/pricing.ts` | create |
| `src/app/api/checkout/route.ts` | create |
| `src/app/api/webhooks/abacatepay/route.ts` | create |
| `src/app/api/cron/process-jobs/route.ts` | create |
| `supabase/migrations/00002_checkout_functions.sql` | create |
| `tests/api/checkout.test.ts` | create |

## Verification checklist

- [ ] Checkout creates order with correct fee calculation
- [ ] Duplicate idempotency_key returns existing order (not duplicate charge)
- [ ] Insufficient capacity returns 409 with clear message
- [ ] Two concurrent purchases of last ticket: one succeeds, one gets 409
- [ ] AbacatePay checkout URL is returned and redirects correctly
- [ ] Webhook with invalid signature is rejected (401)
- [ ] `checkout.completed` webhook marks order as paid + enqueues jobs
- [ ] `checkout.lost` webhook voids order and releases capacity
- [ ] Order with `lost` status has quantity_sold decremented correctly
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
