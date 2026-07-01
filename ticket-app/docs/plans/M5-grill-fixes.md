# Grill Fixes — Code Review Action Items

Priority-ordered list of fixes from the M5 codebase grill session.

---

## P0 — Fix Now (data loss / incorrect behavior)

### 1. Fix `create_order_atomic` RPC to store billing info

**Problem:** The checkout route passes `p_billing_id` and `p_checkout_url` to the `create_order_atomic` RPC, but the RPC signature doesn't accept these params. The billing ID and checkout URL are silently discarded — orders are created with NULL `abacatepay_billing_id` and `abacatepay_checkout_url`.

**Fix:** Update the RPC to accept and store both fields. Update the route to match.

**Files:**
- `supabase/migrations/00002_functions.sql` — add `p_billing_id TEXT DEFAULT NULL`, `p_checkout_url TEXT DEFAULT NULL` params to `create_order_atomic`, store them in the `INSERT INTO orders` statement
- `app/api/checkout/route.ts` — no changes needed (already passes them)

### 2. Remove duplicate email sending in job processor

**Problem:** `handleProcessPaidOrder` both enqueues a `SEND_CONFIRMATION_EMAIL` job AND calls `sendConfirmationEmail()` inline. If the inline call succeeds, the queued job sends a duplicate email. If it fails, the job retries — but the failure is logged as a warning, not an error.

**Fix:** Remove the inline `sendConfirmationEmail()` call. Only enqueue the job. The cron processor will handle it.

**File:** `app/api/cron/process-jobs/route.ts`

### 3. Move job enqueue inside the RPC (or add dedup key)

**Problem:** The webhook handler inserts a `pending_jobs` record **outside** the `process_paid_order_atomic` RPC. If the RPC succeeds but the job insert fails, the email is lost. On webhook retry, the RPC returns `_idempotent: true` and the job insert is skipped.

**Fix (option A):** Move the job enqueue into the RPC itself (add a `pending_jobs` insert inside `process_paid_order_atomic`).

**Fix (option B):** Add a unique constraint on `pending_jobs(payload->>'billing_id')` and use `INSERT ... ON CONFLICT DO NOTHING` so retries don't fail.

**Files:**
- `supabase/migrations/00002_functions.sql` — add job insert to `process_paid_order_atomic`
- `app/api/webhooks/abacatepay/route.ts` — remove the job insert (now handled by RPC)

---

## P1 — Fix Soon (security / correctness)

### 4. Replace in-memory rate limiter

**Problem:** `lib/rate-limit.ts` uses a plain `Map<string, Window>` in memory. On Vercel's serverless architecture, each invocation runs in a separate container. Rate limiting is per-instance, not global. An attacker can exhaust one instance then hit another.

**Fix (MVP):** Document the limitation in the file header. Add a `@todo` comment linking to this issue.

**Fix (production):** Replace with Vercel KV (Redis) or a Supabase-based rate limiter.

**File:** `lib/rate-limit.ts`

### 5. Fix magic byte validation in upload route

**Problem:** `hasImageMagicBytes` checks only the first 4 bytes. A renamed `.exe` with a JPEG header prepended passes. The `IMAGE_MAGIC_BYTES` constant is defined but never used — the function re-declares the same arrays inline.

**Fix:** Remove the dead `IMAGE_MAGIC_BYTES` constant. For MVP, add a comment that this is basic content-type validation, not a security boundary. For production, use `sharp` to actually decode the image.

**File:** `app/api/upload/route.ts`

### 6. Remove TOCTOU tier pre-check in checkout

**Problem:** The checkout route fetches tiers with `.in("id", uniqueTierIds)` **before** the RPC call. Between this read and the RPC, another concurrent checkout could sell the last tickets. The RPC's `FOR UPDATE` lock catches this, but the pre-check is misleading.

**Fix:** Remove the pre-check entirely. The RPC handles all capacity validation atomically. The pre-check adds complexity and a false sense of security.

**File:** `app/api/checkout/route.ts`

---

## P2 — Nice to Have (UX / robustness)

### 7. Add rate limiting to check-in and order lookup endpoints

**Problem:** `POST /api/checkin` and `GET /api/orders/lookup` have no rate limiting. Check-in could exhaust the DB connection pool. Order lookup is public and could be enumerated.

**Fix:** Apply the existing `checkRateLimit` helper to both endpoints.

**Files:**
- `app/api/checkin/route.ts`
- `app/api/orders/lookup/route.ts`

### 8. Add pagination to check-in polling endpoint

**Problem:** `GET /api/events/:slug/checkins` returns all tickets in one response. For events with thousands of tickets, this is a large payload.

**Fix:** Add `?offset=` and `?limit=` query params. Default to 100 per page. Add a `total` count to the response.

**File:** `app/api/events/[slug]/checkins/route.ts`

### 9. Add error state to check-in client polling

**Problem:** Polling errors are silently ignored. If the network is down, the UI shows stale data with no indication.

**Fix:** Track polling error state. Show a subtle "Connection lost — retrying..." banner when polling fails.

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

### 10. Remove `organizer_id` from public event response

**Problem:** The public `GET /api/events/:slug` endpoint returns `organizer_id`. This is a minor information leak.

**Fix:** Strip `organizer_id` from the public response. Use a pick/omit helper or restructure the query.

**File:** `app/api/events/[slug]/route.ts`

---

## P3 — Cleanup (code quality)

### 11. Remove dead `IMAGE_MAGIC_BYTES` constant

**File:** `app/api/upload/route.ts`

### 12. Extract polling interval to a constant

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

### 13. Add `@todo` comments for documented limitations

- Rate limiter not distributed (`lib/rate-limit.ts`)
- Magic byte validation is basic (`app/api/upload/route.ts`)
- No pagination on check-in polling (`app/api/events/[slug]/checkins/route.ts`)