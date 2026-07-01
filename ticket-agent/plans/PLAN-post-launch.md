# Plan: Post-Launch Features

> **Roadmap:** [Post-Launch — MVP+1 (First Month)](../ROADMAP.md#-post-launch-mvp1--first-month)
> **Priority:** After MVP Gate
> **Effort:** ~9 days total (short-term) + ~9 days (growth) + ~7.5 days (technical debt)

---

## Goal

Once the MVP gate is passed, iterate on feedback, add polish, and unlock growth. This plan covers the first month post-launch.

---

## Week 1–2: Short-Term Wins

### 1.1 Order Confirmation Page Polish (½ day)

**Now:** The success page is a static message with a link to `/my-tickets`.

**Improvement:** Make the success page dynamic — poll the order status and display ticket download links when ready.

**Changes:**
| File | Change |
|------|--------|
| `ticket-app/app/order/[ref]/success/page.tsx` | Add polling for order status every 3s |
| | When order is paid, show ticket links with QR codes |
| | When order is still pending, show spinner with "Processando pagamento..." |

### 1.2 Email Resend Feature (½ day)

**Problem:** Attendees who lose their confirmation email have no way to re-receive it.

**Solution:** Add a "Reenviar email" button on the ticket page and/or the My Tickets results.

**Changes:**
| File | Change |
|------|--------|
| `ticket-app/app/api/tickets/[code]/resend-email/route.ts` | **New** — API endpoint to resend confirmation email |
| `ticket-app/app/tickets/[code]/page.tsx` | Add "Reenviar email" button |
| `ticket-app/app/my-tickets/page.tsx` | Add "Reenviar" link next to each ticket |

### 1.3 Organizer Payout Request Page (1 day)

**Now:** Payouts are manual — organizer contacts the developer, developer sends PIX.

**Improvement:** Build a self-service payout request page where organizers can request a payout and see their balance.

**Changes:**
| File | Change |
|------|--------|
| `ticket-app/app/dashboard/payouts/page.tsx` | **New** — Payout request page |
| `ticket-app/app/dashboard/layout.tsx` | Add "Saques" to sidebar navigation |
| `ticket-app/app/api/payouts/route.ts` | **New** — List payout history |
| `ticket-app/app/api/payouts/request/route.ts` | **New** — Request a payout |
| `ticket-database/supabase/migrations/00005_payouts.sql` | **New** — `payouts` table (id, organizer_id, amount_cents, status, requested_at, paid_at) |

**Data model:**
```sql
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES organizers(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'rejected')),
  pix_key TEXT,
  pix_key_type TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  notes TEXT
);
```

### 1.4 Event Page SEO (½ day)

**Now:** Event pages have no meta tags or OG image.

**Improvement:** Add dynamic meta tags + Open Graph image for social sharing.

**Changes:**
| File | Change |
|------|--------|
| `ticket-app/app/events/[slug]/page.tsx` | Add `generateMetadata()` — title, description, OG image from cover_image_url |
| `ticket-app/app/layout.tsx` | Add default OG metadata |

```typescript
// app/events/[slug]/page.tsx
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await fetchEvent(slug);
  return {
    title: `${event.title} — Ticket`,
    description: event.description?.slice(0, 160),
    openGraph: {
      title: event.title,
      description: event.description,
      images: event.cover_image_url ? [{ url: event.cover_image_url }] : [],
    },
  };
}
```

### 1.5 Admin Panel for GDPR Deletions (1 day)

**Now:** GDPR data deletion is API-only (`POST /api/admin/delete-attendee-data`). No UI.

**Improvement:** Build an admin panel page where the developer can enter an email and trigger deletion.

**Changes:**
| File | Change |
|------|--------|
| `ticket-app/app/admin/layout.tsx` | **New** — Admin layout with secret key auth |
| `ticket-app/app/admin/gdpr/page.tsx` | **New** — Form: email input + "Excluir dados" button |
| `ticket-app/app/api/admin/delete-attendee-data/route.ts` | Already exists — verify secret key matches env var |

---

## Week 3–4: Growth Features

### 2.1 Discount / Promo Codes (2 days)

**Data model:**
```sql
CREATE TABLE promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id),
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  max_uses INTEGER NOT NULL DEFAULT 0,
  current_uses INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Changes:**
| File | Change |
|------|--------|
| `ticket-database/supabase/migrations/00006_promo_codes.sql` | **New** |
| `ticket-app/app/api/events/[slug]/promo-codes/route.ts` | **New** — CRUD for promo codes |
| `ticket-app/app/api/checkout/route.ts` | Modify — accept optional `promo_code`, validate + apply discount |
| `ticket-app/lib/fees.ts` | Modify — accept discount param |
| `ticket-app/app/dashboard/events/[slug]/page.tsx` | Add promo code management UI |
| `ticket-app/app/checkout/page.tsx` | Add promo code input field |

### 2.2 Multiple Organizer Support (2 days)

**Problem:** Events often have multiple organizers (co-hosts, production team).

**Solution:** Allow organizers to invite others as collaborators with view/edit permissions.

**Data model:**
```sql
CREATE TABLE event_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  organizer_id UUID NOT NULL REFERENCES organizers(id),
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('viewer', 'editor', 'admin')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, organizer_id)
);
```

**Changes:**
| File | Change |
|------|--------|
| `ticket-database/supabase/migrations/00007_collaborators.sql` | **New** |
| `ticket-app/app/api/events/[slug]/collaborators/route.ts` | **New** — CRUD for collaborators |
| `ticket-app/app/dashboard/events/[slug]/page.tsx` | Add collab management UI |
| Multiple route handlers | Update auth checks: allow collaborators to access event |

### 2.3 Event Series / Recurring Events (2 days)

**Problem:** Organizers running workshops, courses, or weekly events need to create the same event multiple times.

**Solution:** Add a "repeat" option to event creation — daily, weekly, monthly — that creates multiple events at once.

**Changes:**
| File | Change |
|------|--------|
| `ticket-app/app/dashboard/events/new/page.tsx` | Add repeat options (frequency, count, end date) |
| `ticket-app/app/api/events/route.ts` | Handle `repeat` param — create N events in a transaction |
| `ticket-app/lib/validation.ts` | Add repeat schema |

### 2.4 Sales Notifications (1 day)

**Now:** Organizers only know about sales when they check the dashboard.

**Improvement:** Send a notification (email or WhatsApp) to the organizer each time a ticket is sold.

**Changes:**
| File | Change |
|------|--------|
| `ticket-app/app/api/cron/process-jobs/route.ts` | Add `SEND_SALE_NOTIFICATION` job type |
| `ticket-app/lib/email-templates.ts` | Add `buildSaleNotification()` template |
| `ticket-app/lib/constants.ts` | Add `SEND_SALE_NOTIFICATION` constant |
| `ticket-database/supabase/migrations/00002_functions.sql` | Modify `process_paid_order_atomic` to enqueue sale notification |

### 2.5 Basic Analytics (2 days)

**Problem:** Organizers want to see sales trends over time.

**Solution:** Add a simple chart showing daily ticket sales.

**Changes:**
| File | Change |
|------|--------|
| `ticket-app/app/dashboard/events/[slug]/dashboard/page.tsx` | Add sales chart (daily line chart) |
| `ticket-app/app/api/events/[slug]/sales-data/route.ts` | **New** — Return daily sales data for chart |
| `ticket-app/package.json` | Add chart library (e.g., `recharts` or lightweight SVG) |
| `ticket-app/components/sales-chart.tsx` | **New** — Chart component |

---

## Technical Debt (Ongoing)

### 3.1 Upgrade to Vercel Pro (—)

**Why:** Hobby plan limits cron to 1/day minimum. Pro allows sub-daily cron, which means email queue processing can happen every 10 minutes instead of inline during webhook handling.

**Action:** Upgrade in Vercel Dashboard → Settings → Plan.

### 3.2 Separate Supabase Staging Project (½ day)

**Why:** Currently all environments share the same Supabase database. A staging project prevents accidental data corruption during development.

**Action:**
```bash
# Create a new Supabase project
supabase projects create ticket-staging --org your-org

# Link the staging project locally
cd ticket-database
supabase link --project-ref <staging-ref>

# Apply migrations
supabase db push
```

### 3.3 Coverage Thresholds (1 day)

**Why:** Catch test regressions automatically.

**Action:** Add coverage configuration to `vitest.config.ts`:

```typescript
test: {
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json-summary', 'html'],
    thresholds: {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80,
    },
  },
}
```

Add to CI pipeline to fail on below-threshold coverage.

### 3.4 Full Frontend Page Tests (3 days)

**Why:** The smoke tests from [PLAN-frontend-smoke-tests](../plans/PLAN-frontend-smoke-tests.md) are a start. Full coverage means testing all states: loading, empty, error, edge cases.

### 3.5 Playwright Browser E2E (2 days)

**Why:** The Supertest-based E2E test validates the API but doesn't test the browser UI. Playwright adds real browser testing including QR code rendering, navigation, and form interactions.

**Setup:**
```bash
npm install --save-dev @playwright/test
npx playwright install
```

**Tests:**
- Full purchase flow in browser
- QR rendering on ticket page
- Check-in via camera (simulated)
- Responsive layout at 375px and 768px

### 3.6 Performance Benchmarks (1 day)

**Why:** Establish baseline metrics to track performance regressions.

**Tools:** `k6` or `autocannon`

**Baselines:**
| Endpoint | Target (p95) |
|----------|-------------|
| `GET /events/[slug]` | < 200ms |
| `POST /api/checkout` | < 500ms |
| `POST /api/webhooks/abacatepay` | < 1s |
| Static assets (JS, CSS) | < 100ms (CDN cache) |