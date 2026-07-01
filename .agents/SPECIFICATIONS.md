# SPECIFICATIONS.md — Ticket SaaS Platform (MVP)

## 1. Overview

Ticket is a multi-tenant SaaS platform for creating, publishing, and selling tickets to events. Attendees check out as guests (email only) — no account needed.

Financial model: Ticket charges a platform fee (5% + R$ 0,50 per transaction) added to the attendee's total. AbacatePay processing fees are passed through. Payouts to organizers are manual (PIX transfer on request) in MVP. All amounts in BRL centavos.

Core entities:
- **Organizer** — account that creates and manages events
- **Event** — a happening with date, venue, and ticket inventory
- **Ticket Tier** — a ticket type (e.g., General Admission, VIP) with price and quantity cap
- **Order** — a purchase transaction containing one or more tickets (supports guest checkout)
- **Check-in** — record that an attendee entered the event

**Currency:** Brazilian Real (BRL). All monetary values in centavos (R$ 25,00 = `2500`).

## 2. User Stories (MVP)

**Organizer:**
1. Sign up and create an organizer account.
2. Create events (name, date/time, venue, description, cover image).
3. Define multiple ticket tiers (name, price, quantity, sale start/end).
4. Publish events to make them visible to attendees.
5. View public event page with details and buy button.
6. See sales dashboard (total sold, revenue, remaining capacity).
7. Check in attendees by QR scan or name/email search.

**Attendee:**
1. View event detail page with description, date, venue, and tiers.
2. Select ticket quantity and purchase via AbacatePay hosted checkout (PIX, Boleto, CC).
3. Receive confirmation email with order details and ticket QR code.
4. Access tickets via "My Tickets" lookup page by email + order reference.

## 3. Functional Requirements

### 3.1 Authentication & Accounts
- Sign-up: email + password (bcrypt hashed, JWT sessions). Welcome email sent synchronously (Resend).
- Login: email + password verification, JWT issued. Password reset via token.
- Profile: name, email, avatar, PIX key.

### 3.2 Event Management
- Create: name, date/time, timezone, venue, description, cover image.
- Ticket tiers: name, price, quantity, sale start/end per tier.
- Status lifecycle: Draft → Published → Canceled. Edits allowed only in Draft.

### 3.3 Ticketing & Sales
- Public event page shows available tiers.
- Checkout: email (required), optional name. Creates AbacatePay hosted checkout.
- Overselling prevention: PostgreSQL `SELECT ... FOR UPDATE` (see §3.5).
- AbacatePay webhooks: `checkout.completed` → paid + generate tickets; `checkout.lost` → void + release capacity.
- Tickets: UUID unique code. QR code is URL encoding that UUID (no PNG storage).
- "My Tickets" page: email + order reference lookup.
- Fee display itemized at checkout.

### 3.4 Check-in
- Dashboard lists attendees with check-in status.
- QR scan via `getUserMedia`, manual search by name/email.
- Data polled every 5s (no WebSockets in MVP).

### 3.5 Checkout Atomicity & Overselling Prevention
Overselling is the highest-risk failure mode. The following strategy prevents it:

1. **Row-level lock** — When a checkout request arrives, open a transaction and lock the relevant `tiers` rows with `SELECT ... FOR UPDATE`. Conflicting transactions wait in queue rather than retrying.
2. **Capacity check** — Inside the transaction, verify `(quantity_total - quantity_sold) >= requested`. If insufficient, roll back and fail.
3. **Atomic decrement** — On success, increment `quantity_sold`, insert the order (status `pending`) and order_items rows.
4. **AbacatePay Checkout** created *after* the transaction commits (order exists as `pending` before payment).
5. **Webhook handling** — `checkout.completed` flips order to `paid` and generates tickets. `checkout.lost` voids the order and decrements `quantity_sold`. Both use atomic RPCs (`process_paid_order_atomic`, `void_order_atomic`).

| Webhook Event | Action |
|---|---|
| `checkout.completed` | Flip order to `paid`, generate tickets, enqueue confirmation email |
| `checkout.lost` | Void order, decrement `quantity_sold` |

6. **Idempotency** — `UNIQUE` constraint on `idempotency_key`. Duplicate inserts return the existing order. Webhooks check `abacatepay_billing_id` to avoid double-processing.

### 3.6 Payment & Money Flow
Ticket uses **AbacatePay** as the payment gateway:
- Organizer provides a PIX key during sign-up for payouts.
- Checkout total = ticket price + platform fee (5% + R$ 0,50) + AbacatePay processing fee (all itemized).
- Attendee redirected to AbacatePay's hosted page; returns to `completionUrl` after payment.
- AbacatePay sends webhook (`checkout.completed` or `checkout.lost`) — see §3.5 for handling.
- Payouts in MVP are manual: developer sends PIX to organizer on request. Automated payouts are future scope.
- Fee display at checkout:
  ```
  Ticket Price:              R$ 25,00
  Platform Fee (5%):         R$ 1,25
  AbacatePay Fee (PIX):      R$ 0,00
  ──────────────────────────────────
  Total:                     R$ 26,25
  ```

## 4. Technical Requirements

### 4.1 Architecture
- **Stack:** Astro Build (TypeScript, Tailwind CSS) + PostgreSQL (local Docker container).
- **Runtime:** Bun (Node.js-compatible, used as the package manager and runtime). Tests run via `bun test` (Vitest-compatible).
- **Auth:** Custom JWT-based auth (bcrypt + jsonwebtoken). Sessions stored in `organizers` table `session_token` column.
- **Deployment:** Local Docker Compose (Astro app + PostgreSQL). No cloud hosting for MVP. Astro runs with the `@astrojs/node` SSR adapter for API route support.
- **Payments:** AbacatePay Checkout API + webhooks with HMAC-SHA256 verification.
- **Emails:** Resend. Welcome email sent synchronously during signup; confirmation emails queued via `pending_jobs`.
- **Jobs queue:** `pending_jobs` table with atomic RPCs (`fetch_pending_jobs` with `FOR UPDATE SKIP LOCKED`). Processed by `/api/cron/process-jobs` (polled by docker-hosted cron or manual trigger). Webhooks return 200 immediately and defer heavy work.
- **File storage:** Local filesystem (`public/uploads/`) for event cover images only. QR codes are URL-encoded UUIDs rendered client-side — no storage needed.
- **CI/CD:** GitHub Actions (test on push only). No automatic deploy.
- **Styling:** Tailwind CSS for all UI components. Utility-first approach — no CSS modules or styled-components.
- **Frontend components:** Astro islands (`.astro` components) for static content, with optional framework components (`.tsx`) for interactive client-side widgets (checkout flow, QR scanner, dashboard).

### 4.2 API Design (MVP Only)
All endpoints return JSON. Auth-protected endpoints use `Authorization: Bearer <jwt>`. Organizer-only endpoints return 403 for non-owners.

API routes live in `src/pages/api/` as `.ts` files. Astro's file-based routing maps each file to a URL path. Dynamic segments use `[param]` brackets in the filename (e.g., `src/pages/api/events/[slug].ts` exports `{ GET, POST }` handlers).

```
# Public
GET    /api/events/[slug]              — Event details + available tiers
POST   /api/checkout                   — Create order + initiate AbacatePay checkout
GET    /api/tickets/[unique_code]      — Ticket details + check-in validity
POST   /api/webhooks/abacatepay        — Payment webhooks (HMAC verified)
GET    /api/orders/lookup              — Lookup order by email + reference

# Organizer (requires auth)
POST   /api/events                     — Create event
POST   /api/events/[id]/tiers          — Add ticket tier
POST   /api/events/[slug]/publish      — Publish event
POST   /api/events/[slug]/cancel       — Cancel event
GET    /api/events/[slug]/dashboard    — Sales dashboard
GET    /api/events/[slug]/checkins     — Check-in list
POST   /api/checkin                    — Check in attendee
POST   /api/upload                     — Upload cover image

# Authentication (public)
POST   /api/auth/signup                — Create organizer account
POST   /api/auth/login                 — Sign in
GET    /api/auth/me                    — Current user info

# Internal (protected by secret token)
POST   /api/cron/process-jobs          — Drain pending_jobs queue (cron or manual trigger)
```

**Astro API route example:** Each `[param].ts` file exports named functions (`export const GET`, `export const POST`) that receive `AstroAPIContext` with `params`, `request`, `cookies`, etc.

### 4.3 PostgreSQL Data Model
Full schema lives in `ticket-database/supabase/migrations/`:
- `00001_initial_schema.sql` — all tables + indexes
- `00002_functions.sql` — atomic operations (create_order_atomic, void_order_atomic, process_paid_order_atomic, checkin_ticket, fetch_pending_jobs, expire_stale_orders)
- `00003_atomic_checkout.sql` — checkout logic with row-level locking

**Key tables and their columns:**
- `organizers` — id, email (unique), name, avatar_url, pix_key, pix_key_type, verified_at
- `events` — id, organizer_id (FK), title, slug (unique), description, venue_name/address, start_at, end_at, timezone, cover_image_url, status (draft|published|canceled)
- `tiers` — id, event_id (FK), name, description, price_cents, quantity_total, quantity_sold (≤ total), sale_start_at, sale_end_at
- `orders` — id, event_id (FK), organizer_id (FK), attendee_email/name, abacatepay_billing_id/checkout_url, amount_cents, fee_cents, abacatepay_fee_cents, status (pending|paid|expired|lost), reference (unique), idempotency_key (unique)
- `order_items` — id, order_id (FK), tier_id (FK), tier_name, quantity, unit_price_cents
- `tickets` — id, order_id/event_id/tier_id/organizer_id (FKs), holder_name/email, unique_code (UUID, unique), checked_in_at
- `check_ins` — id, ticket_id/event_id/checked_by (FKs), timestamp, type (entry|reentry)
- `pending_jobs` — id, job_type, payload (JSONB), status (pending|processing|done|failed), retries, max_retries

### 4.4 Security & Compliance
- **Authentication** via custom JWT — passwords hashed with bcrypt, sessions managed in application code.
- **Access control enforced in API route code, not RLS** — all queries use the `service_role` key server-side (bypasses RLS). Authorization logic checks organizer ownership in handler code.
- **Input validation** via Zod on every API route.
- **AbacatePay webhooks** verified by HMAC-SHA256 signature before processing.
- **Rate limiting** on auth and checkout endpoints via Astro middleware (`src/middleware.ts`) or inline checks in each API route handler.
- **SQL injection** prevented by parameterized queries — never concatenate user input into SQL strings.
- **All secrets in `.env.local`** (RESEND_API_KEY, DATABASE_URL, JWT_SECRET, ABACATEPAY_API_KEY, etc.) — never committed to git.

### 4.5 Performance & Reliability
- **Event pages** should render < 200ms. Set `Cache-Control` headers via `Astro.response.headers` on API routes and page-level `headers` export.
- **Checkout atomicity** uses `SELECT ... FOR UPDATE`. Contending transactions block in queue — no retry overhead.
- **Webhook handler** returns 200 immediately after verifying signature and inserting a `pending_jobs` row. All heavy work deferred to the job queue.
- **Connection pooling** via `pgbouncer` sidecar in Docker Compose.
- **Caching** via Astro's built-in static generation: public event pages use `export const prerender = true` for build-time HTML, while dynamic pages (dashboard, checkout) are server-rendered with explicit `Cache-Control` headers.

## 5. Glossary

| Term | Definition |
|---|---|
| Organizer | Account that creates and manages events |
| Attendee | Person who buys a ticket |
| Ticket Tier | Category of ticket with price and availability |
| Order | Purchase transaction containing one or more tickets |
| Check-in | Verifying an attendee's ticket at the venue |
| QR Code | Scannable code on each ticket for check-in |
| Platform Fee | Ticket's fee per transaction (5% + R$ 0,50) |
| AbacatePay | Brazilian payment gateway (PIX, Boleto, Credit Card) |
| PIX | Brazilian instant payment system |
| Boleto | Brazilian bank slip (settles in 1-3 business days) |
| PIX Key | Identifier for receiving PIX transfers |
| Guest Checkout | Purchase without account — email only |
| Idempotency Key | Unique token preventing duplicate charges |