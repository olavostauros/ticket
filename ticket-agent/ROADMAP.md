# 🗺️ Roadmap — Ticket MVP Launch

> **Target:** Ship a working end-to-end ticketing platform where a brand-new organizer can sign up, create an event, publish it, and an attendee can buy a ticket and receive a scannable QR code — all without manual intervention.
>
> **Status:** Pre-launch · 11 milestones complete (M0–M7) · 193 tests passing · Core architecture solid

---

## 📍 Where We Are

The platform is **80% built**. All backend routes, database schemas, RPC functions, and auth flows exist. The critical remaining work is:

| Area | Status | Remaining |
|------|--------|-----------|
| 🏗️ App shell (pages, routing) | ✅ Complete | — |
| 🔐 Auth (signup, login, profile) | ✅ Complete | — |
| 📅 Event CRUD + tiers | ✅ Complete | — |
| 💳 Checkout API + AbacatePay | ✅ Complete | — |
| 🎫 Ticket generation + QR codes | ✅ Complete | — |
| 📧 Emails (welcome, confirmation) | ✅ Complete | — |
| ✅ Check-in (QR scan + manual) | ✅ Complete | — |
| 📊 Dashboard (overview, sales, edit) | ✅ Complete | — |
| 🛡️ Security (RLS policies) | ✅ Migration written | Apply to Supabase prod |
| 🧪 Tests (validation, API, utils) | ✅ 193 passing | See gaps below |
| ❌ **Purchase UI flow** | ❌ **Missing** | No "Buy" button on event page |
| ❌ **Order success page** | ❌ **Missing** | No `/order/[ref]/success` |
| ❌ **E2E testing** | ❌ **Not started** | Critical for launch |
| ❌ **DB RPC testing** | ❌ **Not started** | Core integrity tests |
| ❌ **Frontend page tests** | ❌ **Not started** | UI regression safety |
| 🔄 Cron jobs (email queue) | 🔄 Partial | Reverted to sync on Hobby plan |

---

## 🎯 Pre-Launch Checklist (P0 — Launch Blockers)

These items **must** be complete before the MVP gate can pass.

### 1. 🔗 Wire Up the Purchase Flow

The biggest gap: the public event page (`/events/[slug]`) displays ticket tiers but has **no way to buy them**. The checkout API exists (`POST /api/checkout`) but there's no UI to call it.

**What's needed:**

| Task | File | Effort |
|------|------|--------|
| Add "Comprar" button + quantity selector on event page | `app/events/[slug]/page.tsx` | ½ day |
| Build a checkout page (email, attendee name, tier summary, fee breakdown) | `app/checkout/page.tsx` + checkout form component | 1 day |
| Build an order success page (`/order/[ref]/success`) showing the order reference and instructions | `app/order/[ref]/success/page.tsx` | ½ day |
| Redirect from AbacatePay back to success page | Update `completionUrl` in checkout route if needed | ¼ day |

**Flow:** Event page → Select tier/qty → "Comprar" → Checkout form (email + name) → POST `/api/checkout` → Redirect to AbacatePay → AbacatePay redirects back to `/order/[ref]/success` → Webhook fires → Email sent with QR link.

### 2. 🧪 End-to-End Test (Happy Path)

A single automated test that validates the **complete lifecycle**:

```
Signup → Create event → Add tier → Publish →
Simulate checkout → Simulate webhook callback →
Verify order paid → Verify tickets created →
Verify email queued/sent → Verify check-in works
```

| Tool | Approach | Effort |
|------|----------|--------|
| **Supertest** (HTTP-level) | Hit API routes in sequence, mock AbacatePay | 1 day |
| **Playwright** (browser) | Full browser flow including AbacatePay redirect | 2 days |

**Start with Supertest.** This validates the MVP gate criteria. Playwright can follow post-launch.

### 3. 🧪 Overselling Concurrency Test

The highest-risk failure mode. Must verify that `SELECT ... FOR UPDATE` works under load.

```
Setup: tier with 5 tickets
Send 10 concurrent checkout requests for 1 ticket each
→ Exactly 5 succeed, 5 fail
→ quantity_sold = 5 in DB
```

| Approach | Effort |
|----------|--------|
| Custom Node script + direct DB assertions | ½ day |

### 4. 🧪 Database RPC Tests

The RPC functions (`create_order_atomic`, `process_paid_order_atomic`, `void_order_atomic`, `checkin_ticket`) are the spine of the system. They must be tested against a real PostgreSQL instance.

Test scenarios (see TESTING_PLAN.md §4.2 for full matrix):
- Single/multi-tier order creation
- Insufficient capacity rolls back
- Concurrent requests don't oversell
- Idempotent replay returns existing order
- Paid order generates tickets
- Voided order decrements capacity
- Already-checked-in ticket rejects

| Effort |
|--------|
| 2 days |

### 5. 📦 Apply RLS Security Migration

The migration at `ticket-database/supabase/migrations/20260630232833_rls_security_policies.sql` enables RLS with DENY-ALL policies on all tables. It needs to be applied to the production Supabase project.

```bash
cd /home/stauros-ticket/ticket/ticket-database
supabase db push --linked
```

| Effort |
|--------|
| ¼ day (+ verification) |

---

## 🛡️ Pre-Launch Checklist (P1 — Should Have)

These items reduce risk and improve quality but won't block the initial launch.

### 6. Route Handler Edge Cases

Add tests for edge cases currently missing (see TESTING_PLAN.md §5.2):

| Route | Missing Edge Case | Effort |
|-------|-------------------|--------|
| `GET /api/events/[slug]` | Draft events should 404 publicly | ¼ day |
| `POST /api/checkin` | Manual check-in by name/email (not just UUID) | ¼ day |
| `POST /api/auth/login` | Route handler test (not just schema) | ¼ day |
| `POST /api/auth/signup` | Route handler test | ¼ day |
| `POST /api/events/[slug]/publish` | Success case test | ¼ day |
| `POST /api/events/[slug]/cancel` | Success case test | ¼ day |
| `POST /api/webhooks/abacatepay` | Replay attack, tampered HMAC, unknown event | ½ day |
| `POST /api/admin/delete-attendee-data` | GDPR deletion — no tests at all | ½ day |

**Total: ~2 days**

### 7. Webhook Idempotency Verification

The checkout flow depends on idempotent webhook handling. Verify:
- Duplicate `checkout.completed` webhooks don't double-create tickets
- Duplicate `checkout.lost` webhooks don't double-void
- Race between `checkout.completed` and `checkout.lost` (unlikely but possible) — one wins

| Effort |
|--------|
| ½ day |

### 8. Frontend Page Smoke Tests

At minimum, verify that all pages render without crashing when given mock data:

| Page | Key Assertion | Effort |
|------|---------------|--------|
| Landing page (`/`) | CTAs render, links work | ¼ day |
| Event page (`/events/[slug]`) | Tier prices display, buy button shows | ¼ day |
| My Tickets (`/my-tickets`) | Lookup form renders | ¼ day |
| Ticket detail (`/tickets/[code]`) | QR code renders, check-in status shown | ¼ day |
| Dashboard (`/dashboard`) | Event list renders | ¼ day |
| Create event form | All fields present, slug auto-generates | ¼ day |
| Check-in page | Search + scan UI renders | ¼ day |
| Privacy page | Content renders | ¼ day |

**Total: ~1.5 days** (using `@testing-library/react` + jsdom)

---

## 🚀 Launch Checklist (P2 — Go/No-Go)

Before pressing the big button:

### 9. Production Readiness Checks

| Check | Detail | Verified? |
|-------|--------|-----------|
| Environment variables set in Vercel | `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ABACATEPAY_API_KEY`, `ABACATEPAY_WEBHOOK_SECRET` | ☐ |
| Supabase project is southamerica-east1 | Latency for Brazilian users | ☐ |
| Migrations applied | All 4 migrations run on production | ☐ |
| RLS policies in effect | DENY-ALL for anon/authenticated | ☐ |
| Custom domain configured | e.g., `ticket.app.br` or Vercel subdomain | ☐ |
| SSL/HTTPS working | Vercel provides by default | ☐ |
| AbacatePay webhook URL configured | Points to `/api/webhooks/abacatepay` | ☐ |
| AbacatePay webhook secret rotated | HMAC verification key set | ☐ |
| Resend domain verified | Sending domain authenticated (SPF, DKIM) | ☐ |
| `vercel.json` cron removed | Hobby plan has 1-day minimum — emails sent sync | ✅ Done |
| Privacy policy published | `/privacy` page exists | ✅ Done |
| GDPR deletion endpoint ready | `POST /api/admin/delete-attendee-data` | ✅ Done |
| Rate limiting active | In-memory on auth + checkout | ✅ Done |

### 10. Manual QA Script

Run through this manually once before launch:

```
1.  Visit landing page → see hero + CTA cards
2.  Click "Criar conta grátis" → see signup form
3.  Fill signup → submit → redirected to dashboard
4.  Check email → welcome email received
5.  Click "Criar Evento" → fill form → submit → redirected to event edit
6.  Add ticket tier (name, price, qty) → see it in table
7.  Click "Publicar Evento" → event published
8.  Visit `/events/[slug]` in incognito → see event details + tiers
9.  Click "Comprar" → fill email → submit → redirected to AbacatePay
10. Complete payment (use PIX simulator) → redirected to success page
11. Check email → confirmation email with QR link received
12. Open ticket link → see QR code + event info
13. Log in as organizer → go to check-in page
14. Scan QR code → attendee checked in ✅
15. See check-in reflected on dashboard
16. Visit `/my-tickets` with email + reference → see tickets
17. Visit `/privacy` → see privacy policy
18. Try accessing `/dashboard` without auth → redirected to `/login`
```

---

## 📈 Post-Launch (MVP+1 — First Month)

Once the MVP gate is passed, these features add polish and unlock growth.

### Short-Term Wins (Weeks 1–2)

| Feature | Value | Effort |
|---------|-------|--------|
| Order confirmation page polish | Better UX for attendees post-purchase | ½ day |
| Email resend for expired links | Attendees who lost their email | ½ day |
| Organizer payout request page | Self-service PIX payout instead of manual | 1 day |
| Event page SEO (meta tags, OG images) | Better sharing on social media | ½ day |
| Admin panel for data deletion | UI for GDPR requests (currently API-only) | 1 day |

### Growth Features (Weeks 3–4)

| Feature | Value | Effort |
|---------|-------|--------|
| Discount / promo codes | Drive ticket sales | 2 days |
| Multiple organizer support (team) | Allow co-organizers | 2 days |
| Event series / recurring events | Workshops, courses, multi-date | 2 days |
| Sales notifications (email/WhatsApp) | Organizer notified on each sale | 1 day |
| Basic analytics (top-selling tiers, daily sales chart) | Better organizer insights | 2 days |

### Technical Debt (Ongoing)

| Item | Why | Effort |
|------|-----|--------|
| Upgrade to Vercel Pro plan | Sub-daily cron jobs (process jobs queue properly) | — |
| Separate Supabase project for preview/staging | Avoid prod data in dev | ½ day |
| Coverage thresholds (80%+) | Catch regressions | 1 day |
| Frontend page tests (all pages) | Full UI test suite | 3 days |
| E2E with Playwright (browser) | True end-to-end including QR scan | 2 days |
| Performance benchmarks | Baseline metrics | 1 day |

---

## 📊 Summary Timeline

```
Week      Focus                            Milestone
────────────────────────────────────────────────────────────────
Now       🔗 Purchase UI flow              Launch-blocker #1
          🧪 E2E happy path test           Launch-blocker #2
          🧪 Overselling concurrency test   Launch-blocker #3
          🧪 DB RPC tests                  Launch-blocker #4
          📦 Apply RLS migration            Launch-blocker #5

Week 1    🛡️ Route handler edge cases       Pre-launch P1
          🧪 Webhook idempotency tests       Pre-launch P1
          🧪 Frontend page smoke tests       Pre-launch P1
          ✅ Manual QA                       Go/No-Go
          🚀 LAUNCH                          MVP Gate

Week 2    🐛 Bug fixes from launch           Post-launch
          📧 Email polish (resend, templates)
          💰 Payout request page

Week 3-4  🏷️ Discount codes                 Growth
          👥 Team / co-organizers
          🔁 Event series
          📊 Analytics
          🔧 Technical debt
```

---

## 🧭 How to Use This Roadmap

**For agents:** This is your guide to what needs building next. Always check `MISSION.md` (why), `SPECIFICATIONS.md` (what), and `UX.md` (how it should look) before implementing any item here.

**For humans:** This is your project board. Start at the top of the Pre-Launch Checklist and work down. When you hit "Go/No-Go," run the Manual QA Script. If it passes, you're ready to ship.

**Priority key:**
| Label | Meaning |
|-------|---------|
| P0 — Launch Blocker | MVP cannot ship without this |
| P1 — Should Have | Reduces risk, improves quality |
| P2 — Go/No-Go | Decision gate before launch |
| Post-Launch | After MVP gate is passed |