-- Atomic order creation with overselling prevention.
-- Handles idempotency inside the transaction to avoid TOCTOU races.
-- Called by the checkout API route.

CREATE OR REPLACE FUNCTION create_order_atomic(
  p_event_id UUID,
  p_organizer_id UUID,
  p_attendee_email TEXT,
  p_attendee_name TEXT,
  p_amount_cents INTEGER,
  p_fee_cents INTEGER,
  p_abacatepay_fee_cents INTEGER,
  p_reference TEXT,
  p_idempotency_key TEXT,
  p_items JSONB,
  p_billing_id TEXT DEFAULT NULL,
  p_checkout_url TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_item JSONB;
  v_tier RECORD;
  v_requested_qty INTEGER;
  v_existing_order JSONB;
BEGIN
  -- 0. Lock the event row and verify it's published (TOCTOU prevention)
  PERFORM 1 FROM events WHERE id = p_event_id AND status = 'published' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found or not available';
  END IF;

  -- 1. Check idempotency FIRST — inside the transaction
  SELECT row_to_json(o) INTO v_existing_order
  FROM orders o
  WHERE o.idempotency_key = p_idempotency_key;

  IF v_existing_order IS NOT NULL THEN
    -- Return existing order with an idempotent flag
    RETURN jsonb_set(v_existing_order::jsonb, '{_idempotent}', 'true');
  END IF;

  -- 2. Lock all tier rows in consistent order (by tier_id) to prevent deadlocks
  -- Note: jsonb_array_elements() returns rows with a single column named "value"
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) ORDER BY (value->>'tier_id') LOOP
    PERFORM 1
    FROM tiers
    WHERE id = (v_item->>'tier_id')::UUID
    FOR UPDATE;
  END LOOP;

  -- 3. Check capacity and verify tiers belong to the event
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_requested_qty := (v_item->>'quantity')::INTEGER;

    SELECT * INTO v_tier
    FROM tiers
    WHERE id = (v_item->>'tier_id')::UUID
    AND event_id = p_event_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tier not found for this event: %', (v_item->>'tier_id');
    END IF;

    IF (v_tier.quantity_total - v_tier.quantity_sold) < v_requested_qty THEN
      RAISE EXCEPTION 'Insufficient capacity for tier: % (available: %, requested: %)',
        v_tier.name,
        (v_tier.quantity_total - v_tier.quantity_sold),
        v_requested_qty;
    END IF;

    -- Atomically increment quantity_sold
    UPDATE tiers
    SET quantity_sold = quantity_sold + v_requested_qty,
        updated_at = now()
    WHERE id = v_tier.id;
  END LOOP;

  -- 4. Insert the order (idempotency_key UNIQUE constraint is our safety net)
  INSERT INTO orders (
    event_id, organizer_id, attendee_email, attendee_name,
    amount_cents, fee_cents, abacatepay_fee_cents, currency,
    status, reference, idempotency_key,
    abacatepay_billing_id, abacatepay_checkout_url
  ) VALUES (
    p_event_id, p_organizer_id, p_attendee_email, p_attendee_name,
    p_amount_cents, p_fee_cents, p_abacatepay_fee_cents, 'BRL',
    'pending', p_reference, p_idempotency_key,
    p_billing_id, p_checkout_url
  )
  RETURNING id INTO v_order_id;

  -- 5. Insert order items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO order_items (order_id, tier_id, tier_name, quantity, unit_price_cents)
    VALUES (
      v_order_id,
      (v_item->>'tier_id')::UUID,
      v_item->>'tier_name',
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price_cents')::INTEGER
    );
  END LOOP;

  -- 6. Return the created order as JSON
  RETURN (
    SELECT row_to_json(o)::jsonb || '{"_idempotent": false}'::jsonb
    FROM orders o WHERE o.id = v_order_id
  );
END;
$$;

-- Atomic void/lost-order: update order status + decrement tier capacity inside a single
-- transaction with row-level locking. Prevents the race condition in handleProcessLostOrder
-- where two concurrent jobs could decrement the same tier.
CREATE OR REPLACE FUNCTION void_order_atomic(
  p_reference TEXT,
  p_billing_id TEXT,
  p_new_status TEXT DEFAULT 'lost'
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
BEGIN
  -- 1. Lock the order row
  SELECT * INTO v_order
  FROM orders
  WHERE reference = p_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_reference;
  END IF;

  IF v_order.status = p_new_status THEN
    RETURN (SELECT row_to_json(v_order)::jsonb || '{"_idempotent": true}'::jsonb);
  END IF;

  -- 2. Lock and decrement each tier
  FOR v_item IN
    SELECT oi.tier_id, oi.quantity
    FROM order_items oi
    WHERE oi.order_id = v_order.id
    ORDER BY oi.tier_id
  LOOP
    -- Verify capacity is not negative (sanity check for data consistency)
    IF (SELECT quantity_sold FROM tiers WHERE id = v_item.tier_id FOR UPDATE) < v_item.quantity THEN
      RAISE EXCEPTION 'Inconsistent state: tier % has quantity_sold less than order quantity', v_item.tier_id;
    END IF;

    UPDATE tiers
    SET quantity_sold = quantity_sold - v_item.quantity,
        updated_at = now()
    WHERE id = v_item.tier_id;
  END LOOP;

  -- 3. Update order status
  UPDATE orders
  SET status = p_new_status,
      abacatepay_billing_id = COALESCE(p_billing_id, abacatepay_billing_id),
      updated_at = now()
  WHERE id = v_order.id;

  RETURN (SELECT row_to_json(o)::jsonb || '{"_idempotent": false}'::jsonb
          FROM orders o WHERE o.id = v_order.id);
END;
$$;

-- Atomic check-in: insert check_ins record + update ticket.checked_in_at in one transaction.
-- Prevents orphaned check-in records if the ticket update fails.
CREATE OR REPLACE FUNCTION checkin_ticket(
  p_ticket_id UUID,
  p_event_id UUID,
  p_checked_in_by UUID,
  p_type TEXT DEFAULT 'entry'
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket RECORD;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- 1. Lock the ticket row
  SELECT * INTO v_ticket
  FROM tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found: %', p_ticket_id;
  END IF;

  IF v_ticket.checked_in_at IS NOT NULL THEN
    RAISE EXCEPTION 'Ticket already checked in at %', v_ticket.checked_in_at;
  END IF;

  -- 2. Insert check-in record
  INSERT INTO check_ins (ticket_id, event_id, checked_in_by, timestamp, type)
  VALUES (p_ticket_id, p_event_id, p_checked_in_by, v_now, p_type);

  -- 3. Update ticket
  UPDATE tickets
  SET checked_in_at = v_now,
      updated_at = v_now
  WHERE id = p_ticket_id;

  RETURN jsonb_build_object(
    'ticket_id', p_ticket_id,
    'checked_in_at', v_now,
    'event_id', p_event_id
  );
END;
$$;

-- Atomic paid-order processing: update status + generate tickets + enqueue email inside a single transaction.
-- Prevents duplicate ticket creation when concurrent jobs process the same order.
-- Called by handleProcessPaidOrder in the job processor and the webhook handler.
CREATE OR REPLACE FUNCTION process_paid_order_atomic(
  p_reference TEXT,
  p_billing_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_tickets JSONB := '[]'::JSONB;
BEGIN
  -- 1. Lock the order row
  SELECT * INTO v_order
  FROM orders
  WHERE reference = p_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_reference;
  END IF;

  -- Already paid — idempotent
  IF v_order.status = 'paid' THEN
    -- Fetch existing tickets and return them
    SELECT jsonb_agg(jsonb_build_object('unique_code', unique_code))
    INTO v_tickets
    FROM tickets
    WHERE order_id = v_order.id;

    RETURN jsonb_build_object(
      '_idempotent', true,
      'order_id', v_order.id,
      'ticket_count', COALESCE(jsonb_array_length(v_tickets), 0),
      'tickets', COALESCE(v_tickets, '[]'::JSONB),
      'attendee_email', v_order.attendee_email,
      'attendee_name', v_order.attendee_name
    );
  END IF;

  -- 2. Update order to paid
  UPDATE orders
  SET status = 'paid',
      abacatepay_billing_id = COALESCE(p_billing_id, abacatepay_billing_id),
      updated_at = now()
  WHERE id = v_order.id;

  -- 3. Generate tickets (one per unit per order item)
  FOR v_item IN
    SELECT oi.tier_id, oi.quantity, oi.tier_name
    FROM order_items oi
    WHERE oi.order_id = v_order.id
    ORDER BY oi.tier_id
  LOOP
    FOR i IN 1..v_item.quantity LOOP
      INSERT INTO tickets (
        order_id, event_id, tier_id, organizer_id,
        holder_name, holder_email
      ) VALUES (
        v_order.id, v_order.event_id, v_item.tier_id, v_order.organizer_id,
        COALESCE(v_order.attendee_name, 'Attendee'), v_order.attendee_email
      );
    END LOOP;
  END LOOP;

  -- 4. Fetch created ticket unique_codes
  SELECT jsonb_agg(jsonb_build_object('unique_code', unique_code))
  INTO v_tickets
  FROM tickets
  WHERE order_id = v_order.id;

  -- 5. Enqueue confirmation email inside the same transaction
  -- If this insert fails, the entire transaction rolls back (no tickets, no email lost)
  INSERT INTO pending_jobs (job_type, payload)
  VALUES (
    'send_confirmation_email',
    jsonb_build_object(
      'order_reference', p_reference,
      'attendee_email', v_order.attendee_email,
      'attendee_name', COALESCE(v_order.attendee_name, ''),
      'ticket_codes', (
        SELECT jsonb_agg(jsonb_build_object('unique_code', unique_code))
        FROM tickets
        WHERE order_id = v_order.id
      )
    )
  );

  RETURN jsonb_build_object(
    '_idempotent', false,
    'order_id', v_order.id,
    'ticket_count', COALESCE(jsonb_array_length(v_tickets), 0),
    'tickets', COALESCE(v_tickets, '[]'::JSONB),
    'attendee_email', v_order.attendee_email,
    'attendee_name', v_order.attendee_name
  );
END;
$$;

-- Fetch pending jobs with row-level locking (prevents duplicate processing)
CREATE OR REPLACE FUNCTION fetch_pending_jobs(p_limit INTEGER DEFAULT 10)
RETURNS SETOF pending_jobs
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE pending_jobs
  SET status = 'processing',
      updated_at = now()
  WHERE id IN (
    SELECT id
    FROM pending_jobs
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Expire pending orders older than N minutes to release tier capacity.
-- Abandoned checkouts that never complete payment tie up tickets indefinitely.
-- Called by the cron job processor on each tick.
CREATE OR REPLACE FUNCTION expire_stale_orders(p_max_age_minutes INTEGER DEFAULT 30)
RETURNS TABLE(order_id UUID, reference TEXT, status TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
BEGIN
  FOR v_order IN
    SELECT id, reference
    FROM orders
    WHERE status = 'pending'
      AND created_at < now() - (p_max_age_minutes || ' minutes')::INTERVAL
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    -- Lock and decrement tiers, update order status
    UPDATE orders
    SET status = 'expired',
        updated_at = now()
    WHERE id = v_order.id;

    -- Release tier capacity
    UPDATE tiers
    SET quantity_sold = quantity_sold - oi.quantity,
        updated_at = now()
    FROM order_items oi
    WHERE oi.order_id = v_order.id
      AND tiers.id = oi.tier_id;

    order_id := v_order.id;
    reference := v_order.reference;
    status := 'expired';
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

-- Auto-update updated_at trigg
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply the trigger to all tables with updated_at
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY['organizers', 'events', 'tiers', 'orders', 'tickets', 'pending_jobs'])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW
       EXECUTE FUNCTION update_updated_at()',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- Migration tracking table
CREATE TABLE IF NOT EXISTS _migrations (
  name      TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite index for job queue fetch (avoids sequential scan on status + created_at sort)
-- Used by fetch_pending_jobs() which queries WHERE status = 'pending' ORDER BY created_at ASC
CREATE INDEX IF NOT EXISTS idx_pending_jobs_fetch
  ON pending_jobs(status, created_at)
  WHERE status = 'pending';