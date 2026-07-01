-- Migration: Enable RLS on all public tables with DENY-ALL policies
--
-- Context: All application data access goes through API routes that use the
-- service_role key (see lib/supabase/server.ts), which bypasses RLS entirely.
-- Authorization is enforced in route handler code.
--
-- However, the public schema is exposed to PostgREST and the anon/authenticated
-- roles have full CRUD grants on all tables. Without RLS, anyone with the anon
-- key (embedded in client-side JS) can read/write all data via the REST API.
--
-- This migration:
-- 1. Enables RLS on every public table
-- 2. Creates DENY-ALL policies for anon and authenticated roles
-- 3. Leaves service_role unaffected (it bypasses RLS)
--
-- ⚠️ Verify before applying: no client-side code relies on direct PostgREST
-- queries with the anon key. All .from() calls in the app use the server client
-- (service_role). The browser client (lib/supabase/client.ts) is only used for
-- auth operations (signInWithPassword), never for data queries.

-- =============================================================================
-- Table: organizers
-- =============================================================================
ALTER TABLE public.organizers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizers_deny_all" ON public.organizers
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- =============================================================================
-- Table: events
-- =============================================================================
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_deny_all" ON public.events
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- =============================================================================
-- Table: tiers
-- =============================================================================
ALTER TABLE public.tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tiers_deny_all" ON public.tiers
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- =============================================================================
-- Table: orders
-- =============================================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_deny_all" ON public.orders
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- =============================================================================
-- Table: order_items
-- =============================================================================
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_items_deny_all" ON public.order_items
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- =============================================================================
-- Table: tickets
-- =============================================================================
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tickets_deny_all" ON public.tickets
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- =============================================================================
-- Table: check_ins
-- =============================================================================
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "check_ins_deny_all" ON public.check_ins
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- =============================================================================
-- Table: pending_jobs
-- =============================================================================
ALTER TABLE public.pending_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_jobs_deny_all" ON public.pending_jobs
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- =============================================================================
-- Table: _migrations (internal tracking, no reason to expose)
-- =============================================================================
ALTER TABLE public._migrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "_migrations_deny_all" ON public._migrations
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
