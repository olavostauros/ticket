# Milestone 7: E2E Validation & Launch Prep

**Goal:** The MVP gate criteria from MISSION.md are met — a brand-new organizer can sign up, create an event, publish it, and an attendee can buy a ticket and receive a scannable QR code in email — all without manual intervention.

## Dependencies

- Milestones 0–6 complete

## Step-by-step

### 7.1 — Full E2E manual walkthrough

Run through this flow end-to-end in production-like environment:

```
1. Create a Supabase project in sa-east-1 (São Paulo)
2. Deploy to Vercel (or run locally pointing at prod Supabase)
3. Sign up as organizer at /signup
4. Create event at /dashboard/events/new
   - Fill in title, slug, venue, date, timezone
   - Upload cover image
5. Add ticket tiers (e.g., General Admission - R$ 25,00)
6. Publish the event
7. Open the public event page at /events/:slug
8. Select ticket quantity, enter email, proceed to checkout
9. Complete payment on AbacatePay hosted page (use PIX)
10. Wait for webhook -> tickets generated -> email sent
11. Check email inbox for confirmation with ticket link
12. Open ticket page, verify QR code renders
13. Open /my-tickets, search by email + order reference
14. Log in as organizer, navigate to check-in page
15. Enter the ticket code manually (or scan QR)
16. Verify the attendee is checked in
17. Try to check in again -> 409 error
```

Record any issues found and fix before moving on.

### 7.2 — Test suite final pass

```bash
npm test
```

Ensure all test files have filled-in implementations (not just stubs). Key test scenarios:

- **Auth:** signup, login, profile update, duplicate email, invalid credentials
- **Events:** create, publish, edit (draft only), cancel, tier management
- **Checkout:** atomic capacity check, idempotency, concurrent overselling prevention
- **Webhooks:** HMAC verification, completed/lost handling, idempotency
- **Tickets:** generation, QR URL format, lookup by email+reference
- **Check-in:** success, duplicate (409), wrong event (400), invalid code (404)
- **Jobs:** email sending, ticket generation via pending_jobs

### 7.3 — Privacy policy page (LGPD)

**`src/app/privacy/page.tsx`**

```typescript
export default function PrivacyPage() {
  return (
    <main>
      <h1>Privacy Policy</h1>
      <p><em>Last updated: {new Date().toLocaleDateString("pt-BR")}</em></p>
      <h2>Data We Collect</h2>
      <ul>
        <li>Organizer accounts: name, email, PIX key</li>
        <li>Attendee purchases: name, email</li>
        <li>Event data: title, description, venue, dates, cover images</li>
        <li>Check-in records: timestamp</li>
      </ul>
      <h2>How We Use Data</h2>
      <ul>
        <li>Ticket sales and event management</li>
        <li>Payment processing (delegated to AbacatePay)</li>
        <li>Sending confirmation emails (delegated to Resend)</li>
      </ul>
      <h2>Data Deletion</h2>
      <p>Contact us at privacy@ticket.app to request deletion of your personal data. We will process deletion within 30 days.</p>
      <h2>Data Storage</h2>
      <p>Data is stored in Brazil (AWS sa-east-1) via Supabase. Payment data is processed by AbacatePay and never stored by Ticket.</p>
    </main>
  );
}
```

### 7.4 — Data deletion endpoint

**`src/app/api/admin/delete-attendee-data/route.ts`** — admin-only endpoint for LGPD deletion requests:

```typescript
import { supabase } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-middleware";
import { err, ok } from "@/lib/api-utils";
import { z } from "zod";

const deleteSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return err("unauthorized", "Not authenticated", 401);

  // Verify the requester is an organizer (any organizer can request deletion)
  const { data: organizer } = await supabase
    .from("organizers")
    .select("id")
    .eq("id", user.id)
    .single();

  if (!organizer) return err("forbidden", "Only organizers can request data deletion", 403);

  const body = await request.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return err("validation_error", parsed.error.message, 400);

  const { email } = parsed.data;

  // Anonymize orders: remove attendee name, scramble email
  const { error: orderError } = await supabase
    .from("orders")
    .update({
      attendee_name: null,
      attendee_email: `deleted-${Date.now()}@ticket.app`,
    })
    .eq("attendee_email", email);

  if (orderError) return err("db_error", "Failed to delete attendee data", 500);

  // Anonymize tickets
  const { error: ticketError } = await supabase
    .from("tickets")
    .update({
      holder_name: "Deleted",
      holder_email: `deleted-${Date.now()}@ticket.app`,
    })
    .eq("holder_email", email);

  if (ticketError) return err("db_error", "Failed to delete ticket data", 500);

  return ok({ deleted: true });
}
```

### 7.5 — README.md

**`README.md`** — at project root:

```markdown
# Ticket — Event Ticketing SaaS

A multi-tenant SaaS platform for selling tickets to events.

## Tech Stack

- **Frontend:** Next.js (React), TypeScript, deployed to Vercel
- **Backend:** Next.js API routes (co-located)
- **Database:** PostgreSQL via Supabase
- **Auth:** Supabase Auth (email/password)
- **Payments:** AbacatePay
- **Email:** Resend
- **Storage:** Supabase Storage

## Getting Started

1. Clone the repo
2. Copy `.env.example` to `.env.local` and fill in the values
3. Run migrations against your Supabase project
4. `npm install && npm run dev`
5. Open http://localhost:3000

## Environment Variables

See `.env.example` for all required variables.

## Running Tests

```bash
npm test
```

## Deployment

Deploy to Vercel:
```bash
npx vercel --prod
```

## License

MIT
```

### 7.6 — Vercel deployment configuration

**`vercel.json`**

```json
{
  "framework": "nextjs",
  "regions": ["gru1"],  // São Paulo edge region
  "crons": [
    {
      "path": "/api/cron/process-jobs",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

This configures:
- São Paulo edge region (`gru1`) for low-latency to Brazilian users
- A Vercel Cron Job that calls `/api/cron/process-jobs` every minute to drain the `pending_jobs` queue

### 7.7 — GitHub Actions CI

**`.github/workflows/ci.yml`**

```yaml
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - run: npm test
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          ABACATEPAY_API_KEY: ${{ secrets.ABACATEPAY_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          NEXT_PUBLIC_APP_URL: ${{ secrets.NEXT_PUBLIC_APP_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
```

### 7.8 — Supabase project setup checklist

- [ ] Supabase project created in **southamerica-east1** (São Paulo)
- [ ] Email/password auth provider enabled
- [ ] `event-covers` Storage bucket created (public)
- [ ] SQL migrations applied (`00001_initial_schema.sql`, `00002_checkout_functions.sql`, `00003_checkin_functions.sql`)
- [ ] API keys copied to `.env.local`

### 7.9 — Pre-launch checklist

- [ ] E2E flow works end-to-end without developer intervention
- [ ] All tests pass on CI
- [ ] Privacy policy page is live at `/privacy`
- [ ] Data deletion endpoint works (tested)
- [ ] Environment variables configured in Vercel
- [ ] Vercel Cron Job configured (`/api/cron/process-jobs` every 1 min)
- [ ] AbacatePay webhook configured to point at `https://your-domain.com/api/webhooks/abacatepay`
- [ ] Resend domain verified (SPF/DKIM)
- [ ] `.env.example` is up to date
- [ ] README has correct setup instructions
- [ ] GitHub Secrets configured for CI
- [ ] Domain configured (or using vercel.app domain for MVP)

## Files to create

| File | Type |
|---|---|
| `src/app/privacy/page.tsx` | create |
| `src/app/api/admin/delete-attendee-data/route.ts` | create |
| `README.md` | create |
| `vercel.json` | create |
| `.github/workflows/ci.yml` | create |

## Verification checklist

- [ ] Full E2E walkthrough passes (signup -> create event -> publish -> buy -> email -> check-in)
- [ ] `npm test` passes with all tests implemented (not stubs)
- [ ] Privacy policy is accessible at `/privacy`
- [ ] Data deletion anonymizes attendee data correctly
- [ ] Vercel deployment succeeds (`npx vercel --prod`)
- [ ] CI passes on GitHub (push to main)
- [ ] AbacatePay webhook receives and processes completed payments
- [ ] Email delivery works (Resend configured, SPF/DKIM set up)
- [ ] PIX payment from test account completes and triggers ticket generation
- [ ] MVP gate criteria are met (MISSION.md)
