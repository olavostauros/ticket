-- Ticket platform — initial schema
-- Matches SPECIFICATIONS.md §4.3

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Organizer accounts
CREATE TABLE organizers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  avatar_url    TEXT,
  pix_key       TEXT,
  pix_key_type  TEXT CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Events
CREATE TABLE events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id    UUID NOT NULL REFERENCES organizers(id),
  title           TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  description     TEXT,
  venue_name      TEXT,
  venue_address   TEXT,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  timezone        TEXT NOT NULL,
  cover_image_url TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'canceled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Ticket tiers
CREATE TABLE tiers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT,
  price_cents         INTEGER NOT NULL CHECK (price_cents > 0),
  quantity_total      INTEGER NOT NULL CHECK (quantity_total > 0),
  quantity_sold       INTEGER NOT NULL DEFAULT 0
                         CHECK (quantity_sold <= quantity_total),
  sale_start_at       TIMESTAMPTZ,
  sale_end_at         TIMESTAMPTZ,
  abacatepay_product_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Orders
CREATE TABLE orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID NOT NULL REFERENCES events(id),
  organizer_id          UUID NOT NULL REFERENCES organizers(id),
  attendee_email        TEXT NOT NULL,
  attendee_name         TEXT,
  abacatepay_billing_id TEXT,
  abacatepay_checkout_url TEXT,
  amount_cents          INTEGER NOT NULL,
  fee_cents             INTEGER NOT NULL DEFAULT 0,
  abacatepay_fee_cents  INTEGER NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL DEFAULT 'BRL',
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'paid', 'expired', 'lost')),
  reference             TEXT UNIQUE NOT NULL,
  idempotency_key       TEXT UNIQUE NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Order items (line items)
CREATE TABLE order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tier_id           UUID NOT NULL REFERENCES tiers(id),
  tier_name         TEXT NOT NULL,
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents  INTEGER NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Tickets (one per unit purchased)
CREATE TABLE tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id),
  event_id        UUID NOT NULL REFERENCES events(id),
  tier_id         UUID NOT NULL REFERENCES tiers(id),
  organizer_id    UUID NOT NULL REFERENCES organizers(id),
  holder_name     TEXT NOT NULL,
  holder_email    TEXT NOT NULL,
  unique_code     UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  checked_in_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Check-in records
CREATE TABLE check_ins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     UUID NOT NULL REFERENCES tickets(id),
  event_id      UUID NOT NULL REFERENCES events(id),
  checked_in_by UUID NOT NULL REFERENCES organizers(id),
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now(),
  type          TEXT NOT NULL DEFAULT 'entry'
                  CHECK (type IN ('entry', 'reentry'))
);

-- 9. Background job queue
CREATE TABLE pending_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type    TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  retries     INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Indexes
CREATE INDEX idx_events_organizer ON events(organizer_id);
CREATE INDEX idx_events_status ON events(status) WHERE status = 'published';
CREATE INDEX idx_tiers_event ON tiers(event_id);
CREATE INDEX idx_orders_organizer ON orders(organizer_id);
CREATE INDEX idx_orders_event ON orders(event_id);
CREATE INDEX idx_orders_attendee ON orders(attendee_email);
CREATE INDEX idx_tickets_unique_code ON tickets(unique_code);
CREATE INDEX idx_tickets_event ON tickets(event_id);
CREATE INDEX idx_check_ins_event ON check_ins(event_id);
CREATE INDEX idx_pending_jobs_status ON pending_jobs(status) WHERE status = 'pending';