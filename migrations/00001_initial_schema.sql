-- Initial schema for Ticket — Event Ticketing SaaS
-- PostgreSQL 16+
-- Run: psql $DATABASE_URL -f migrations/00001_initial_schema.sql

-- Enums
CREATE TYPE event_status AS ENUM ('draft', 'published', 'canceled');
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'expired', 'lost');
CREATE TYPE check_in_type AS ENUM ('entry', 'reentry');
CREATE TYPE pix_key_type AS ENUM ('cpf', 'cnpj', 'email', 'phone', 'random');
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'done', 'failed');

-- Organizers
CREATE TABLE organizers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_url TEXT,
  pix_key TEXT,
  pix_key_type pix_key_type,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_organizers_email ON organizers (email);

-- Events
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  venue_name TEXT DEFAULT '',
  venue_address TEXT DEFAULT '',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  cover_image_url TEXT,
  status event_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_organizer ON events (organizer_id);
CREATE INDEX idx_events_slug ON events (slug);
CREATE INDEX idx_events_status ON events (status);

-- Tiers
CREATE TABLE tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  quantity_total INTEGER NOT NULL CHECK (quantity_total > 0),
  quantity_sold INTEGER NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
  sale_start_at TIMESTAMPTZ,
  sale_end_at TIMESTAMPTZ,
  abacatepay_product_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tiers_event ON tiers (event_id);

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id),
  organizer_id UUID NOT NULL REFERENCES organizers(id),
  attendee_email TEXT NOT NULL,
  attendee_name TEXT,
  abacatepay_billing_id TEXT,
  abacatepay_checkout_url TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  fee_cents INTEGER NOT NULL DEFAULT 0,
  abacatepay_fee_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status order_status NOT NULL DEFAULT 'pending',
  reference TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_event ON orders (event_id);
CREATE INDEX idx_orders_organizer ON orders (organizer_id);
CREATE INDEX idx_orders_reference ON orders (reference);
CREATE INDEX idx_orders_email ON orders (attendee_email);

-- Order Items
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tier_id UUID NOT NULL REFERENCES tiers(id),
  tier_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order ON order_items (order_id);

-- Tickets
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  event_id UUID NOT NULL REFERENCES events(id),
  tier_id UUID NOT NULL REFERENCES tiers(id),
  organizer_id UUID NOT NULL REFERENCES organizers(id),
  holder_name TEXT NOT NULL,
  holder_email TEXT NOT NULL,
  unique_code UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  checked_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tickets_event ON tickets (event_id);
CREATE INDEX idx_tickets_order ON tickets (order_id);
CREATE INDEX idx_tickets_code ON tickets (unique_code);
CREATE INDEX idx_tickets_email ON tickets (holder_email);

-- Check-ins
CREATE TABLE check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id),
  event_id UUID NOT NULL REFERENCES events(id),
  checked_in_by UUID NOT NULL REFERENCES organizers(id),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  type check_in_type NOT NULL DEFAULT 'entry'
);

CREATE INDEX idx_check_ins_event ON check_ins (event_id);
CREATE INDEX idx_check_ins_ticket ON check_ins (ticket_id);

-- Pending Jobs Queue
CREATE TABLE pending_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status job_status NOT NULL DEFAULT 'pending',
  retries INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pending_jobs_status ON pending_jobs (status);
CREATE INDEX idx_pending_jobs_type ON pending_jobs (job_type);