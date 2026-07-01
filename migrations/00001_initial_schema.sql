-- ====================================================================
-- Ticket Platform — Initial Schema
-- ====================================================================
-- This script is executed by PostgreSQL on first container start
-- (automounted at /docker-entrypoint-initdb.d/).
-- Idempotent: uses IF NOT EXISTS throughout.
-- ====================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -------------------------------------------------------------------
-- ENUMs (as domain types for data integrity)
-- -------------------------------------------------------------------
DO $$ BEGIN
  CREATE DOMAIN event_status AS TEXT CHECK (VALUE IN ('draft', 'published', 'canceled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE DOMAIN order_status AS TEXT CHECK (VALUE IN ('pending', 'paid', 'expired', 'lost'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE DOMAIN checkin_type AS TEXT CHECK (VALUE IN ('entry', 'reentry'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE DOMAIN pix_key_type AS TEXT CHECK (VALUE IN ('cpf', 'cnpj', 'email', 'phone', 'random'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE DOMAIN job_status AS TEXT CHECK (VALUE IN ('pending', 'processing', 'done', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -------------------------------------------------------------------
-- ORGANIZERS
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_url    TEXT,
  pix_key       TEXT,
  pix_key_type  pix_key_type,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------------
-- EVENTS
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id    UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  description     TEXT DEFAULT '',
  venue_name      TEXT DEFAULT '',
  venue_address   TEXT DEFAULT '',
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  timezone        TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  cover_image_url TEXT,
  status          event_status NOT NULL DEFAULT 'draft',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

-- -------------------------------------------------------------------
-- TIERS
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tiers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  description           TEXT DEFAULT '',
  price_cents           INTEGER NOT NULL CHECK (price_cents > 0),
  quantity_total        INTEGER NOT NULL CHECK (quantity_total > 0),
  quantity_sold         INTEGER NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
  sale_start_at         TIMESTAMPTZ,
  sale_end_at           TIMESTAMPTZ,
  abacatepay_product_id TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tiers_capacity_check CHECK (quantity_sold <= quantity_total)
);

CREATE INDEX IF NOT EXISTS idx_tiers_event ON tiers(event_id);

-- -------------------------------------------------------------------
-- ORDERS
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                UUID NOT NULL REFERENCES events(id),
  organizer_id            UUID NOT NULL REFERENCES organizers(id),
  attendee_email          TEXT NOT NULL,
  attendee_name           TEXT,
  abacatepay_billing_id   TEXT,
  abacatepay_checkout_url TEXT,
  amount_cents            INTEGER NOT NULL CHECK (amount_cents >= 0),
  fee_cents               INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  abacatepay_fee_cents    INTEGER NOT NULL DEFAULT 0 CHECK (abacatepay_fee_cents >= 0),
  currency                TEXT NOT NULL DEFAULT 'BRL',
  status                  order_status NOT NULL DEFAULT 'pending',
  reference               TEXT NOT NULL UNIQUE,
  idempotency_key         TEXT NOT NULL UNIQUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_event ON orders(event_id);
CREATE INDEX IF NOT EXISTS idx_orders_organizer ON orders(organizer_id);
CREATE INDEX IF NOT EXISTS idx_orders_attendee_email ON orders(attendee_email);
CREATE INDEX IF NOT EXISTS idx_orders_reference ON orders(reference);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency ON orders(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_abacatepay_billing ON orders(abacatepay_billing_id);

-- -------------------------------------------------------------------
-- ORDER ITEMS
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tier_id          UUID REFERENCES tiers(id) ON DELETE SET NULL,
  tier_name        TEXT NOT NULL,
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_tier ON order_items(tier_id);

-- -------------------------------------------------------------------
-- TICKETS
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES events(id),
  tier_id       UUID REFERENCES tiers(id) ON DELETE SET NULL,
  organizer_id  UUID NOT NULL REFERENCES organizers(id),
  holder_name   TEXT NOT NULL,
  holder_email  TEXT NOT NULL,
  unique_code   UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  checked_in_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_unique_code ON tickets(unique_code);
CREATE INDEX IF NOT EXISTS idx_tickets_holder_email ON tickets(holder_email);
CREATE INDEX IF NOT EXISTS idx_tickets_checked_in ON tickets(checked_in_at) WHERE checked_in_at IS NULL;

-- -------------------------------------------------------------------
-- CHECK-INS
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS check_ins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES events(id),
  checked_in_by UUID NOT NULL REFERENCES organizers(id),
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now(),
  type          checkin_type NOT NULL DEFAULT 'entry'
);

CREATE INDEX IF NOT EXISTS idx_check_ins_ticket ON check_ins(ticket_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_event ON check_ins(event_id);

-- -------------------------------------------------------------------
-- PENDING JOBS (async job queue)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type    TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  status      job_status NOT NULL DEFAULT 'pending',
  retries     INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_jobs_status ON pending_jobs(status, created_at) WHERE status = 'pending';

-- -------------------------------------------------------------------
-- AUTO-UPDATE updated_at TRIGGER
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_organizers_updated_at BEFORE UPDATE ON organizers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_tiers_updated_at BEFORE UPDATE ON tiers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_tickets_updated_at BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_pending_jobs_updated_at BEFORE UPDATE ON pending_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
