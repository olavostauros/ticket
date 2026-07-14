# Prompt: Remove Payment Dead Code for Free MVP

## Mission

Remove all payment-related code from the Ticket codebase to align with the [free MVP scope](../MVP.md). The MVP has **no payments, no financial transactions, no liquidity features**. Everything must be free.

## Files to Delete

These files are entirely payment-related and should be **deleted**:

| File | Reason |
|---|---|
| `src/lib/abacatepay.ts` | AbacatePay API client — payment gateway integration |
| `src/lib/fees.ts` | Fee calculation logic — only relevant for paid transactions |
| `src/pages/api/checkout.ts` | Checkout API route — payment flow |
| `src/pages/api/webhooks/abacatepay.ts` | Webhook handler for payment gateway events |
| `src/pages/api/cron/process-jobs.ts` | Cron job — likely processes pending payments / payouts |
| `src/components/CheckoutForm.tsx` | Checkout UI component — payment form |
| `src/tests/checkout.test.ts` | Tests for the checkout flow |
| `src/tests/webhook.test.ts` | Tests for payment webhooks |
| `src/tests/fees.test.ts` | Tests for fee calculations |

## Files to Edit (Remove Payment-Related Code)

### 1. `src/lib/types.ts`
Remove or comment out types related to:
- `CheckoutSession`, `PaymentIntent`, `PaymentStatus`
- `FeeBreakdown`, `Payout`, `PayoutStatus`
- `AbacatePay`-related types
- Any `price_cents`, `amount_cents`, `currency` fields no longer needed

### 2. `src/lib/constants.ts`
Remove constants like:
- Payment gateway API keys/endpoints
- Fee percentages or fixed fee amounts
- Payment-related status values

### 3. `src/lib/validation.ts`
Remove validation schemas for:
- `checkout`, `payment`, `price`, `amount`
- `abacatepay` webhook payloads

### 4. `src/lib/auth.ts`
Remove any checks or middleware that reference payment status, billing, or subscription tier.

### 5. `src/lib/env.ts`
Remove environment variable declarations for:
- `ABACATEPAY_API_KEY`, `ABACATEPAY_WEBHOOK_SECRET`
- `STRIPE_*` or any other payment gateway keys
- Payment-related feature flags

### 6. `src/components/AddTierForm.tsx`
- Remove `price` / `price_cents` input field
- Remove any payment-related labels or validation (e.g., "Price must be greater than zero")
- Tier creation should not require a price — all tiers are free

### 7. `src/pages/api/events/[slug]/tiers.ts`
- Remove `price_cents` from request validation
- Remove `abacatepay_product_id` from tier creation/update
- Strip payment fields from responses

### 8. `src/pages/api/events/[slug].ts`
- Remove any payment-related fields in event responses
- Remove payout/billing fields

### 9. `src/middleware.ts`
- Remove any payment-related rate limiting, auth checks, or route guards for payment endpoints

### 10. `src/tests/utils.test.ts`, `src/tests/setup.ts`, `src/tests/events.test.ts`, `src/tests/smoke.suite.ts`, `src/tests/fixtures/index.ts`
- Remove test fixtures that create paid tiers or orders with amounts
- Remove any test helpers that set up payment data

## Database Schema Changes (`migrations/`)

### `migrations/00001_initial_schema.sql`

**Tiers table** — remove payment fields:
- Rename `price_cents` to a `price` field? Or remove entirely since everything is free.
- Remove `abacatepay_product_id` column
- Remove `CHECK (price_cents > 0)` constraint — all tiers are free

**Orders table** — heavily tied to payments; reconsider the entire table:
- For a free MVP, "orders" may become "registrations" with no `amount_cents`, `fee_cents`, `abacatepay_fee_cents`, `currency`, `abacatepay_billing_id`, `abacatepay_checkout_url`
- Strip all payment/AbacatePay columns
- `status` enum may be simplified (no more `pending_payment`, `paid`, etc.)

**Order items table** — payment details:
- `unit_price_cents` becomes irrelevant if all tickets are free
- Consider simplifying or merging into a registrations table

### `migrations/00003_pending_jobs_unique_active.sql`
- If `pending_jobs` were used for payment processing (webhook retries, payout jobs), remove or simplify

## Definition of Done

1. No imports of `abacatepay`, `stripe`, or any payment library exist in the codebase
2. No API routes exist for checkout, payment webhooks, or payment processing
3. No UI components collect payment information or display prices
4. The database schema no longer has `price_cents`, `amount_cents`, `abacatepay_*` columns
5. All tests pass after the removal
6. The application builds and runs without referencing any deleted modules
7. A fresh migration can be applied on an empty database

## After Removal

Once payment dead code is removed, the codebase should reflect a pure **free ticketing / registration** platform. The core entities become:
- `events` — unchanged (event details)
- `tiers` — free registration types (name, description, capacity, no price)
- `registrations` — replaces `orders` (attendee email, name, tier, check-in status, QR code)
- `tickets` — QR-coded ticket per registration

Update `MVP.md` and `AGENTS.md` if the entity model changes significantly.