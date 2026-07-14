-- ====================================================================
-- Ticket Platform — Initial Schema (Free MVP)
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
  CREATE DOMAIN registration_status AS TEXT CHECK (VALUE IN ('confirmed', 'canceled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE DOMAIN checkin_type AS TEXT CHECK (VALUE IN ('entry', 'reentry'));
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
-- TIERS (free registration types)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT DEFAULT '',
  quantity_total  INTEGER NOT NULL CHECK (quantity_total > 0),
  quantity_sold   INTEGER NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
  sale_start_at   TIMESTAMPTZ,
  sale_end_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tiers_capacity_check CHECK (quantity_sold <= quantity_total)
);

CREATE INDEX IF NOT EXISTS idx_tiers_event ON tiers(event_id);

-- -------------------------------------------------------------------
-- REGISTRATIONS (replaces orders in free MVP)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id),
  organizer_id    UUID NOT NULL REFERENCES organizers(id),
  tier_id         UUID REFERENCES tiers(id) ON DELETE SET NULL,
  attendee_email  TEXT NOT NULL,
  attendee_name   TEXT,
  status          registration_status NOT NULL DEFAULT 'confirmed',
  reference       TEXT NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registrations_event ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_organizer ON registrations(organizer_id);
CREATE INDEX IF NOT EXISTS idx_registrations_attendee_email ON registrations(attendee_email);
CREATE INDEX IF NOT EXISTS idx_registrations_reference ON registrations(reference);

-- -------------------------------------------------------------------
-- TICKETS
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_tickets_registration ON tickets(registration_id);
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
  CREATE TRIGGER trg_registrations_updated_at BEFORE UPDATE ON registrations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_tickets_updated_at BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;