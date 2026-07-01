-- ====================================================================
-- Ticket Platform — Atomic RPC Functions
-- ====================================================================
-- These functions are used by the application code to perform
-- critical operations atomically (within a single transaction).
-- They prevent race conditions on overselling and double-processing.
-- ====================================================================

-- -------------------------------------------------------------------
-- create_order_atomic
-- Creates an order with items, checking capacity with row-level locks.
-- Returns the created order with items.
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_order_atomic(
  p_event_id          UUID,
  p_organizer_id      UUID,
  p_attendee_email    TEXT,
  p_attendee_name     TEXT,
  p_amount_cents      INTEGER,
  p_fee_cents         INTEGER,
  p_abacatepay_fee_cents INTEGER,
  p_reference         TEXT,
  p_idempotency_key   TEXT,
  p_abacatepay_billing_id   TEXT,
  p_abacatepay_checkout_url TEXT,
  p_items             JSONB  -- [{ "tier_id": UUID, "quantity": int }]
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_tier     RECORD;
  v_item     JSONB;
BEGIN
  -- Lock the tiers and verify capacity
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_tier
    FROM tiers
    WHERE id = (v_item->>'tier_id')::UUID
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'TIER_NOT_FOUND: %', v_item->>'tier_id';
    END IF;

    IF v_tier.event_id != p_event_id THEN
      RAISE EXCEPTION 'TIER_MISMATCH: tier % does not belong to event %', v_item->>'tier_id', p_event_id;
    END IF;

    IF v_tier.quantity_sold + (v_item->>'quantity')::INTEGER > v_tier.quantity_total THEN
      RAISE EXCEPTION 'INSUFFICIENT_CAPACITY: tier % has only % remaining', v_tier.name, v_tier.quantity_total - v_tier.quantity_sold;
    END IF;
  END LOOP;

  -- Create the order
  INSERT INTO orders (
    event_id, organizer_id, attendee_email, attendee_name,
    amount_cents, fee_cents, abacatepay_fee_cents,
    reference, idempotency_key,
    abacatepay_billing_id, abacatepay_checkout_url
  ) VALUES (
    p_event_id, p_organizer_id, p_attendee_email, p_attendee_name,
    p_amount_cents, p_fee_cents, p_abacatepay_fee_cents,
    p_reference, p_idempotency_key,
    p_abacatepay_billing_id, p_abacatepay_checkout_url
  )
  RETURNING id INTO v_order_id;

  -- Insert order items and increment quantity_sold
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (order_id, tier_id, tier_name, quantity, unit_price_cents)
    SELECT v_order_id, t.id, t.name, (v_item->>'quantity')::INTEGER, t.price_cents
    FROM tiers t WHERE t.id = (v_item->>'tier_id')::UUID;

    UPDATE tiers
    SET quantity_sold = quantity_sold + (v_item->>'quantity')::INTEGER
    WHERE id = (v_item->>'tier_id')::UUID;
  END LOOP;

  -- Return the full order with items
  RETURN (
    SELECT jsonb_build_object(
      'order', row_to_json(o)::jsonb,
      'items', (SELECT jsonb_agg(row_to_json(oi)::jsonb) FROM order_items oi WHERE oi.order_id = o.id)
    )
    FROM orders o WHERE o.id = v_order_id
  );
END;
$$;

-- -------------------------------------------------------------------
-- process_paid_order_atomic
-- Marks an order as paid, generates tickets, increments quantity_sold.
-- Returns the generated tickets.
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_paid_order_atomic(
  p_reference           TEXT,
  p_abacatepay_billing_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_order   RECORD;
  v_ticket  RECORD;
  v_tickets JSONB := '[]'::JSONB;
  v_item    RECORD;
  v_i       INTEGER;
BEGIN
  -- Lock the order row
  SELECT * INTO v_order
  FROM orders
  WHERE reference = p_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: %', p_reference;
  END IF;

  -- Idempotency: already paid
  IF v_order.status = 'paid' THEN
    RETURN (SELECT jsonb_build_object('order', row_to_json(o)::jsonb, 'tickets', (SELECT jsonb_agg(jsonb_build_object('unique_code', t.unique_code)) FROM tickets t WHERE t.order_id = o.id)) FROM orders o WHERE o.id = v_order.id);
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'ORDER_NOT_PENDING: % is %', p_reference, v_order.status;
  END IF;

  -- Update order
  UPDATE orders
  SET status = 'paid', abacatepay_billing_id = p_abacatepay_billing_id
  WHERE id = v_order.id;

  -- Generate tickets from order items
  FOR v_item IN SELECT * FROM order_items WHERE order_id = v_order.id
  LOOP
    FOR v_i IN 1..v_item.quantity
    LOOP
      INSERT INTO tickets (order_id, event_id, tier_id, organizer_id, holder_name, holder_email)
      VALUES (v_order.id, v_order.event_id, v_item.tier_id, v_order.organizer_id, COALESCE(v_order.attendee_name, v_order.attendee_email), v_order.attendee_email)
      RETURNING id, unique_code INTO v_ticket;

      v_tickets := v_tickets || jsonb_build_object(
        'id', v_ticket.id,
        'unique_code', v_ticket.unique_code
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'reference', p_reference,
    'tickets', v_tickets
  );
END;
$$;

-- -------------------------------------------------------------------
-- void_order_atomic
-- Marks an order as lost/expired and releases capacity.
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION void_order_atomic(
  p_reference TEXT,
  p_new_status order_status DEFAULT 'lost'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
  v_item  RECORD;
BEGIN
  SELECT * INTO v_order
  FROM orders
  WHERE reference = p_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: %', p_reference;
  END IF;

  -- Idempotency: already voided
  IF v_order.status IN ('lost', 'expired') THEN
    RETURN jsonb_build_object('order_id', v_order.id, 'reference', p_reference, 'status', v_order.status);
  END IF;

  IF v_order.status != 'pending' THEN
    RAISE EXCEPTION 'ORDER_NOT_PENDING: % is %', p_reference, v_order.status;
  END IF;

  -- Decrement quantity_sold for each tier
  FOR v_item IN SELECT * FROM order_items WHERE order_id = v_order.id
  LOOP
    UPDATE tiers
    SET quantity_sold = GREATEST(0, quantity_sold - v_item.quantity)
    WHERE id = v_item.tier_id;
  END LOOP;

  UPDATE orders SET status = p_new_status WHERE id = v_order.id;

  RETURN jsonb_build_object('order_id', v_order.id, 'reference', p_reference, 'status', p_new_status);
END;
$$;

-- -------------------------------------------------------------------
-- checkin_ticket
-- Records a check-in for a ticket. Returns the check-in result.
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION checkin_ticket(
  p_ticket_code  UUID,
  p_checked_by   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket   RECORD;
  v_checkin  RECORD;
  v_is_reentry BOOLEAN;
BEGIN
  SELECT t.*, e.title AS event_title, e.organizer_id AS event_organizer_id
  INTO v_ticket
  FROM tickets t
  JOIN events e ON t.event_id = e.id
  WHERE t.unique_code = p_ticket_code
  FOR UPDATE OF t;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND';
  END IF;

  v_is_reentry := v_ticket.checked_in_at IS NOT NULL;

  IF v_is_reentry THEN
    INSERT INTO check_ins (ticket_id, event_id, checked_in_by, type)
    VALUES (v_ticket.id, v_ticket.event_id, p_checked_by, 'reentry');
  ELSE
    UPDATE tickets SET checked_in_at = now() WHERE id = v_ticket.id;
    INSERT INTO check_ins (ticket_id, event_id, checked_in_by, type)
    VALUES (v_ticket.id, v_ticket.event_id, p_checked_by, 'entry');
  END IF;

  RETURN jsonb_build_object(
    'ticket_id', v_ticket.id,
    'unique_code', v_ticket.unique_code,
    'holder_name', v_ticket.holder_name,
    'holder_email', v_ticket.holder_email,
    'already_checked_in', v_is_reentry,
    'checked_in_at', CASE WHEN v_is_reentry THEN v_ticket.checked_in_at ELSE now() END
  );
END;
$$;

-- -------------------------------------------------------------------
-- fetch_pending_jobs
-- Atomically claim the next batch of pending jobs using SKIP LOCKED.
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fetch_pending_jobs(
  p_limit INTEGER DEFAULT 10,
  p_max_retries INTEGER DEFAULT 3
)
RETURNS SETOF pending_jobs
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE pending_jobs
  SET status = 'processing', updated_at = now()
  WHERE id IN (
    SELECT id FROM pending_jobs
    WHERE status = 'pending' AND retries < p_max_retries
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- -------------------------------------------------------------------
-- expire_stale_orders
-- Marks pending orders older than the given interval as expired
-- and releases their tier capacity.
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION expire_stale_orders(
  p_cutoff_interval INTERVAL DEFAULT '30 minutes'
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER := 0;
  v_order RECORD;
BEGIN
  FOR v_order IN
    SELECT id, reference FROM orders
    WHERE status = 'pending' AND created_at < now() - p_cutoff_interval
    FOR UPDATE
  LOOP
    PERFORM void_order_atomic(v_order.reference, 'expired');
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
