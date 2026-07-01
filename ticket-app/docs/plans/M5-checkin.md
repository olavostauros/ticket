# Milestone 5: Check-in

**Goal:** Organizer can check in attendees by scanning their QR code or searching by name/email. Check-in state syncs across organizer sessions via polling.

## Status: ✅ Complete (8/8 tasks done)

---

## Dependencies

- Milestone 4 complete (tickets generated, QR codes viewable)
- `check_ins` table exists in schema (✅ `00001_initial_schema.sql`)
- `checkin_ticket` RPC exists in migrations (✅ `00002_functions.sql`)

---

## What's already built ✅

### 5.1 — Check-in API route ✅

**File:** `app/api/checkin/route.ts`

- `POST /api/checkin` — organizer-authenticated check-in by ticket `unique_code`
- Validates body with `checkinSchema` from `lib/validation.ts`:
  ```ts
  export const checkinSchema = z.object({
    ticket_code: z.string().uuid("Invalid ticket code"),
  });
  ```
- Verifies the organizer exists in the `organizers` table
- Looks up the ticket by `unique_code` with joined `event(title, organizer_id)`
- Verifies the organizer owns the event (`event.organizer_id === user.id`)
- Fast-path check: returns 409 if `ticket.checked_in_at` is already set
- Calls `checkin_ticket` RPC for atomic check-in (inserts `check_ins` record + updates ticket)
- Returns on success:
  ```json
  { "ticket_id": "...", "holder_name": "...", "event_name": "...", "checked_in_at": "..." }
  ```
- Error codes: 401 (unauthenticated), 403 (not their event), 404 (ticket not found), 409 (already checked in), 500 (RPC failure)

### 5.2 — PostgreSQL check-in function ✅

**File:** `supabase/migrations/00002_functions.sql` — `checkin_ticket` function

```sql
CREATE OR REPLACE FUNCTION checkin_ticket(
  p_ticket_id UUID,
  p_event_id UUID,
  p_checked_in_by UUID,
  p_type TEXT DEFAULT 'entry'
) RETURNS JSONB
```

- Takes `p_ticket_id` (UUID primary key, not `unique_code`) — the API route does the code→id lookup
- `SELECT ... FOR UPDATE` locks the ticket row to prevent race conditions
- Raises `"Ticket already checked in"` if `checked_in_at IS NOT NULL`
- Atomically inserts `check_ins` record and updates `tickets.checked_in_at` in one transaction
- Supports `p_type` parameter (`entry` / `reentry`) via check constraint on `check_ins.type`

### 5.3 — Ticket verification API ✅

**File:** `app/api/tickets/[unique_code]/route.ts` — `GET`

- Public endpoint (no auth — the `unique_code` itself is the access token)
- Fetches ticket with joined `event(title, start_at, venue_name)` and `tier(name)`
- Returns:
  ```json
  {
    "id": "...",
    "holder_name": "...",
    "holder_email": "...",
    "checked_in": true/false,
    "checked_in_at": "...",
    "event": { "title": "...", "start_at": "...", "venue_name": "..." },
    "tier": { "name": "..." }
  }
  ```

### Schema ✅

**File:** `supabase/migrations/00001_initial_schema.sql`

```sql
CREATE TABLE check_ins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     UUID NOT NULL REFERENCES tickets(id),
  event_id      UUID NOT NULL REFERENCES events(id),
  checked_in_by UUID NOT NULL REFERENCES organizers(id),
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now(),
  type          TEXT NOT NULL DEFAULT 'entry'
                  CHECK (type IN ('entry', 'reentry'))
);
CREATE INDEX idx_check_ins_event ON check_ins(event_id);
```

---

## What still needs building 🚧

### 5.4 — Check-in polling endpoint ✅

**File:** `app/api/events/[slug]/checkins/route.ts`

```
GET /api/events/:slug/checkins
```

- Authenticated (organizer only)
- Fetches tickets by `event_id` derived from `slug` (owner check)
- Returns filtered ticket data: `id`, `unique_code`, `holder_name`, `holder_email`, `checked_in_at`

### 5.5 — Check-in dashboard page (SSR) ✅

**File:** `app/dashboard/events/[slug]/checkin/page.tsx`

Server component that:
- Authenticates the organizer
- Looks up event by slug (404 if missing, redirect if not owner)
- Fetches initial ticket list
- Renders the `<CheckInClient>` component

### 5.6 — Check-in client component ✅

**File:** `app/dashboard/events/[slug]/checkin/checkin-client.tsx`

Client component with:
- **Search bar** — filters attendees by name or email (client-side)
- **Attendee table** — shows name, email, status (checked in / not checked in), action button
- **Manual entry** — paste a ticket UUID and check in
- **Polling** — polls `/api/events/:slug/checkins` every 5s to sync state across sessions
- **Success/error feedback** — toast-style banner after each check-in attempt
- **QR scanner placeholder** — camera scanning deferred to later milestone; manual entry is the MVP approach
- The check-in button calls `POST /api/checkin` with `{ ticket_code }`, then optimistically updates the local ticket list

### 5.7 — Check-in link in event edit page ✅

**File:** `app/dashboard/events/[slug]/page.tsx`

Added a "Check-in" navigation link (visible for published events) that links to `/dashboard/events/:slug/checkin`.

### 5.8 — Tests ✅

**File:** `tests/api/checkin.test.ts` (new file — moved 3 existing tests from `auth.routes.test.ts` + added 9 new)

| Test | Expected | Status |
|------|----------|--------|
| Rejects unauthenticated requests | 401 | ✅ |
| Rejects invalid ticket code (not a UUID) | 400 | ✅ |
| Returns 403 when user is not an organizer | 403 | ✅ |
| Returns 404 for unknown ticket | 404 | ✅ |
| Returns 409 for already checked-in ticket | 409 | ✅ |
| Returns 403 for ticket from event the organizer doesn't own | 403 | ✅ |
| Successfully checks in a valid ticket | 200 + check-in data | ✅ |
| Returns 500 when RPC fails | 500 | ✅ |
| Polling endpoint rejects unauthenticated | 401 | ✅ |
| Polling endpoint rejects non-owner | 403 | ✅ |
| Polling endpoint returns 404 for missing event | 404 | ✅ |
| Polling endpoint returns ticket state | 200 + ticket array | ✅ |
| Polling endpoint returns empty array when no tickets | 200 + [] | ✅ |
| Ticket verification returns 404 for unknown code | 404 | ✅ |
| Ticket verification returns ticket details | 200 | ✅ |
| Ticket verification shows checked_in: true | 200 | ✅ |

**File:** `tests/api/auth.routes.test.ts` — removed 3 check-in tests (moved to `checkin.test.ts`)

---

## Key differences from original plan

| Original plan | Actual | Why |
|---|---|---|
| RPC `check_in_attendee(p_ticket_code UUID, ...)` | RPC `checkin_ticket(p_ticket_id UUID, ...)` | PK lookup is more reliable; route does the code→id mapping |
| RPC takes `p_event_id` and verifies `event_id` match | Route verifies event ownership before calling RPC | Cleaner separation — route handles auth, RPC handles atomicity |
| RPC returns `{ check_in_id, ticket_id, holder_name, checked_in_at }` | Route returns `{ ticket_id, holder_name, event_name, checked_in_at }` | Simplified response for the client |
| `checkinSchema` defined inline with `event_id` field | `checkinSchema` defined in `lib/validation.ts` with only `ticket_code` | Event ownership verified via the ticket's event join, not client input |
| Separate migration file `00003_checkin_functions.sql` | Function lives in `00002_functions.sql` | All checkout/checkin functions grouped together |
| QR scanner with video element | Camera scanning deferred | MVP uses manual entry + name/email search |

---

## Files to create/update

| File | Action |
|---|---|
| `app/api/events/[slug]/checkins/route.ts` | **Create** — polling endpoint |
| `app/dashboard/events/[slug]/checkin/page.tsx` | **Create** — SSR page |
| `app/dashboard/events/[slug]/checkin/checkin-client.tsx` | **Create** — client component |
| `app/dashboard/events/[slug]/page.tsx` | **Update** — add check-in link (visible for published events) |
| `tests/api/checkin.test.ts` | **Create** — move existing 3 tests from `auth.routes.test.ts` + add remaining 6 |
| `tests/api/auth.routes.test.ts` | **Update** — remove the 3 check-in tests moved to `checkin.test.ts` |

## Verification checklist

- [x] `npm test` passes (182 tests)
- [x] `npm run build` succeeds (zero TS errors)
- [x] Organizer can see a "Check-in" link on the event edit page (published events)
- [x] `/dashboard/events/:slug/checkin` loads with correct event title
- [x] Non-owner gets redirected away from check-in page
- [x] Searching by attendee name filters the list
- [x] Searching by attendee email filters the list
- [x] Clicking "Check In" on an attendee row marks them as checked in
- [x] Already checked-in attendee shows check-in time (button disabled)
- [x] Duplicate check-in (via API) returns 409
- [x] Polling updates check-in state without page reload
- [x] Two browser tabs show the same check-in state within 5 seconds
- [x] Manual code entry pastes and checks in a ticket by UUID
- [x] `/api/tickets/:code` returns 404 for invalid code