-- Migration: Make checkout URL atomic with order creation
-- 
-- Problem: Between create_order_atomic committing the order and the UPDATE
-- that sets abacatepay_checkout_url, a crash leaves the order dangling
-- (pending, no checkout URL, no retry job).
--
-- Solution: Accept optional p_billing_id and p_checkout_url in create_order_atomic
-- so the checkout URL is set inside the same transaction.

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
  --    Includes billing_id and checkout_url if provided (from AbacatePay)
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