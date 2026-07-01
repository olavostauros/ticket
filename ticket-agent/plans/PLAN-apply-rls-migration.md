# Plan: Apply RLS Security Migration

> **Roadmap:** [#5 — Apply RLS Security Migration](../ROADMAP.md#5-📦-apply-rls-security-migration)
> **Priority:** P0 — Launch Blocker
> **Effort:** ¼ day (including verification)

---

## Goal

Enable Row-Level Security (RLS) on all public tables with DENY-ALL policies for `anon` and `authenticated` roles. This closes a critical security gap where the Supabase REST API (PostgREST) is accessible to anyone with the anon key embedded in client-side JS.

---

## The Problem

Currently, the Supabase REST API at `https://<project>.supabase.co/rest/v1/` is wide open:

```text
Anyone who opens DevTools in their browser can find the anon key
in the JS bundle, then:

GET https://<project>.supabase.co/rest/v1/organizers
  → Gets ALL organizer data (names, emails, PIX keys) 👎

DELETE https://<project>.supabase.co/rest/v1/events/{id}
  → Deletes any event 👎

POST https://<project>.supabase.co/rest/v1/orders
  → Creates fake orders 👎
```

The application code is safe — it uses `SUPABASE_SERVICE_ROLE_KEY` on the server and enforces authorization in handler code. But the direct REST API is unprotected.

---

## The Fix

The migration at `ticket-database/supabase/migrations/20260630232833_rls_security_policies.sql` already exists. It:

1. Enables RLS on all 8 public tables (`organizers`, `events`, `tiers`, `orders`, `order_items`, `tickets`, `check_ins`, `pending_jobs`)
2. Creates `DENY-ALL` policies — `USING (false) WITH CHECK (false)` — for `anon` and `authenticated` roles
3. Leaves `service_role` unaffected (it bypasses RLS by default)

---

## Implementation Steps

### Step 1: Verify the Migration Exists

```bash
# Check the migration file
cat /home/stauros-ticket/ticket/ticket-database/supabase/migrations/20260630232833_rls_security_policies.sql
```

Expected: 8 ALTER TABLE statements + 8 CREATE POLICY statements.

### Step 2: Apply to Production Supabase

```bash
cd /home/stauros-ticket/ticket/ticket-database
supabase db push --linked
```

This pushes all pending migrations to the linked Supabase project. If the previous 3 migrations (00001, 00002, 00003) are already applied, only the RLS migration will run.

### Step 3: Verify RLS is Active

Run the following queries to confirm RLS is enabled:

```bash
supabase db query --linked "
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
"
```

Expected: `rowsecurity = true` for all 8 tables.

### Step 4: Verify Policies Exist

```bash
supabase db query --linked "
SELECT tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;
"
```

Expected: 8 policies, each named `{table}_deny_all`, targeting `{anon,authenticated}` roles, with `cmd = ALL`.

### Step 5: Verify Service Role Still Works

The application's server-side code uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS. Verify by querying via the app:

```bash
# Make a request to a public endpoint that queries the DB
curl https://ticket-app-beta-silk.vercel.app/api/events/some-slug
# Should still return event data normally
```

### Step 6: Verify REST API Is Blocked

```bash
# Extract the anon key from a deployed page or .env.local
ANON_KEY="<NEXT_PUBLIC_SUPABASE_ANON_KEY>"
SUPABASE_URL="https://<project>.supabase.co"

# Try to access organizers directly — should fail
curl -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  "$SUPABASE_URL/rest/v1/organizers"

# Expected: { "code": "42501", "message": "permission denied for table organizers" }
```

---

## Rollback Plan

If the RLS migration breaks the application (e.g., a client-side query relies on direct PostgREST access that we missed), rollback immediately:

```bash
# Re-run the previous migration to remove the DENY-ALL policies
supabase db query --linked "
DO \$\$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN 
    SELECT tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND policyname LIKE '%_deny_all'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', rec.policyname, 'public', rec.tablename);
  END LOOP;
END;
\$\$;
"
```

This drops all DENY-ALL policies but leaves RLS enabled (no policies = default DENY in PostgreSQL, so effective result is the same). To fully revert, also disable RLS:

```sql
ALTER TABLE public.organizers DISABLE ROW LEVEL SECURITY;
-- repeat for all 8 tables
```

---

## Files to Verify (No Changes Needed)

| File | Purpose |
|------|---------|
| `ticket-database/supabase/migrations/20260630232833_rls_security_policies.sql` | Migration file — **exists, no changes needed** |
| `ticket-app/lib/supabase/server.ts` | Uses `service_role` — bypasses RLS, no changes needed |
| `ticket-app/lib/supabase/client.ts` | Used for auth only (signInWithPassword), no data queries — safe |

---

## Success Criteria

| Check | Expected |
|-------|----------|
| RLS enabled on all 8 public tables | `rowsecurity = true` |
| DENY-ALL policies exist for all 8 tables | 8 policies, `anon` + `authenticated` roles, `USING (false)` |
| Application still works end-to-end | Event pages, checkout, dashboard all function normally |
| Direct REST API calls with anon key return 403 | `permission denied for table` |
| Service role key still works (server-side code) | All API routes respond normally |