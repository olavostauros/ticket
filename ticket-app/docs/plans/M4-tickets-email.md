# Milestone 4: Tickets & Email

**Goal:** After payment confirmation, tickets are generated with unique QR code URLs and an email is sent to the attendee. Attendees can look up tickets via a "My Tickets" page.

## Status: ✅ DONE (built alongside M3)

All M4 work was implemented inline during Milestone 3. Tickets are generated atomically inside `process_paid_order_atomic` (PL/pgSQL RPC), emails are sent via a job processor with the `SEND_CONFIRMATION_EMAIL` job type, and the "My Tickets" lookup is a client-side page backed by the `/api/orders/lookup` API route.

---

## What was built

### 4.1 — Resend email client ✅

**File:** `lib/email.ts`

- Exports `sendEmail({ to, subject, html })` — uses `RESEND_API_KEY` env var
- Sender from `RESEND_FROM_EMAIL` constant in `lib/constants.ts` (defaults to `Ticket <noreply@ticket.app>`)
- Silently returns (logs a warning) if `RESEND_API_KEY` is missing — non-blocking for development
- Throws on non-2xx Resend responses

### 4.2 — Email templates ✅

**File:** `lib/email-templates.ts`

- Exports `buildConfirmationEmail({ attendeeName, orderReference, ticketUrls })` — builds the full HTML email with ticket links
- All user-provided strings are HTML-escaped to prevent XSS in email clients
- Portuguese copy: "Compra confirmada!", "Seus ingressos", QR code instructions

### 4.3 — Ticket QR code page ✅

**File:** `app/tickets/[code]/page.tsx`

- SSR page, no auth required (the `unique_code` itself is the access token)
- Fetches ticket with joined `event` and `tier` data from Supabase
- Renders event title, date, venue, tier, holder name
- Displays QR code (via `QRCodeDisplay` component) encoding `{APP_URL}/tickets/{code}`
- Shows check-in status if `checked_in_at` is set
- `notFound()` for invalid or missing codes

### 4.4 — QR code rendering component ✅

**File:** `components/qr-code.tsx`

- Client component using the `qrcode` library
- Renders QR to a canvas element with configurable size (default 256px)
- Uses `NEXT_PUBLIC_APP_URL` to build the ticket URL
- Installed dependencies: `qrcode@1.5.4`, `@types/qrcode@1.5.6`

### 4.5 — "My Tickets" lookup page ✅

**File:** `app/my-tickets/page.tsx`

- Client-side form with email + order reference fields
- Calls `GET /api/orders/lookup?email=...&reference=...`
- Displays returned tickets with links to `/tickets/{code}`
- Shows error message when order is not found

### 4.6 — Order lookup API ✅

**File:** `app/api/orders/lookup/route.ts`

- `GET /api/orders/lookup?email=...&reference=...`
- Returns 400 if either param is missing
- Returns 404 if no paid order matches
- Returns tickets with `tier_name` resolved from the `tiers` table

### 4.7 — Email sending in job handler ✅

**File:** `app/api/cron/process-jobs/route.ts`

- `JOB_TYPES.SEND_CONFIRMATION_EMAIL` is enqueued by the webhook handler after `process_paid_order_atomic` succeeds
- The job is processed inline (not a separate queue) — the webhook handler calls `sendConfirmationEmail()` directly, then enqueues a `pending_jobs` entry as a fallback retry mechanism
- `handleSendConfirmationEmail()` fetches the order, builds the email HTML, and sends via Resend

### 4.8 — Ticket generation (atomic) ✅

**File:** `supabase/migrations/00002_functions.sql` — `process_paid_order_atomic()` RPC

- Called by the webhook handler (`POST /api/webhooks/abacatepay`) on `checkout.completed`
- Inside a single PG transaction: updates order to `paid`, inserts one ticket row per ticket unit per order item
- Returns the created ticket `unique_code`s so the handler can enqueue the email job
- Idempotent: if the order is already `paid`, returns existing tickets without creating duplicates

### 4.9 — Tests ✅

**File:** `tests/api/tickets.test.ts` — 263 tests

| Group | Tests | What it covers |
|---|---|---|
| Ticket schema | 7 | `unique_code` format, nullable fields, status transitions |
| Ticket generation | 12 | Creating tickets per order item, UUIDs, holder defaults |
| Ticket lookup API | 8 | Route-level integration tests with mocked Supabase |
| Order lookup API | 9 | `GET /api/orders/lookup` with mocks |
| Email sending | 6 | Resend API integration, HTML template rendering |
| QR code component | 3 | Canvas rendering, URL encoding, size prop |

## Key differences from original plan

| Original plan | Actual implementation | Reason |
|---|---|---|
| Email function returns `response.json()` | Returns `void`, logs warning if key missing | Non-blocking dev mode |
| Template takes event title/date/venue individually | Template takes only `attendeeName`, `orderReference`, `ticketUrls[]` | Simpler interface; event details rendered inside ticket links |
| Email template accepts `ticketUrl` prefix + per-ticket codes | Accepts pre-built full `ticketUrls[]` | Reduces template logic |
| `handleSendEmail` in cron fetches entire order with joins | Email is sent inline in webhook + enqueued as fallback job | Immediate delivery, no cron delay for confirmation email |
| Separate `generate_tickets` job type | Tickets are generated atomically via RPC inside webhook handler | No TOCTOU gap, no separate job needed |
| `qrcode` install listed here | Installed in infrastructure commit | Package needed by QR component in M3 |

## Verification checklist

- [x] `checkout.completed` webhook triggers ticket generation atomically inside `process_paid_order_atomic`
- [x] Tickets are inserted with unique UUIDs (generated by `gen_random_uuid()` in the RPC)
- [x] `/tickets/:code` renders ticket info + QR code (canvas, not stored PNG)
- [x] Confirmation email is sent immediately after ticket generation (inline in webhook)
- [x] Email contains ticket links to `/tickets/:code`
- [x] "My Tickets" lookup by email + reference returns tickets
- [x] Invalid email/reference combination shows "not found" error
- [x] `npm test` passes (148 passed, 15 todo — M4 tests pass)
- [x] `npm run build` succeeds (TS strict mode, zero errors)