# Plan: Purchase UI Flow

> **Roadmap:** [#1 — Wire Up the Purchase Flow](../ROADMAP.md#1-🔗-wire-up-the-purchase-flow)
> **Priority:** P0 — Launch Blocker
> **Effort:** 2.25 days total (½ + 1 + ½ + ¼)

---

## Goal

Connect the public event page to the checkout API so attendees can actually buy tickets. Currently the event page shows tiers with prices but has no buy button, and there's no checkout form page or order success page.

## The Missing Flow

```
Event page ──→ Checkout form ──→ AbacatePay ──→ Success page
  (no button)    (doesn't exist)    (API exists)   (doesn't exist)
```

---

## Changes Required

### 1. Add "Comprar" Button + Quantity Selector to Event Page

**File:** `ticket-app/app/events/[slug]/page.tsx`

The page is currently a **Server Component** (async, SSR). Since the buy button needs state (quantity selection, modal or navigation), the simplest MVP approach:

**Option A (recommended — less JS, keeps SSR):** Add a `Comprar` link/button per tier that navigates to a new checkout page with the tier + event as query params. No client interactivity needed on the event page itself.

**Option B (more interactive):** Convert the tier list into a Client Component with quantity selector + add-to-cart. More work, better UX.

**Decision: Option A for MVP speed.** Add a link per tier:

```tsx
{availableTiers.map((tier: any) => (
  <div key={tier.id} style={{ /* existing styles */ }}>
    <div>
      <h3>{tier.name}</h3>
      {/* existing description + availability */}
    </div>
    <div style={{ textAlign: "right" }}>
      <p style={{ /* price style */ }}>{formatPrice(tier.price_cents)}</p>
      <Link
        href={`/checkout?event=${event.slug}&tier=${tier.id}`}
        style={{
          display: "inline-block",
          marginTop: 8,
          padding: "8px 20px",
          background: "#1a73e8",
          color: "#fff",
          borderRadius: 6,
          textDecoration: "none",
          fontWeight: 600,
          fontSize: "0.9rem",
        }}
      >
        Comprar
      </Link>
    </div>
  </div>
))}
```

**Files to modify:**
| File | Change |
|------|--------|
| `ticket-app/app/events/[slug]/page.tsx` | Add "Comprar" link per tier |

### 2. Build Checkout Page (`/checkout`)

**File:** `ticket-app/app/checkout/page.tsx` (new — Client Component)

This is the attendee-facing purchase form. It receives `event` (slug) and `tier` (id) via search params.

**Structure:**
```
Header:  "Finalizar Compra" + event title (from fetch)
Form:
  - Email (required) — "Seu email para receber o ingresso"
  - Nome do titular (optional) — "Nome do participante"
  - Quantity selector (1–n, default 1, limited by available)
  - Fee breakdown table:
      Preço do ingresso:    R$ 25,00
      Taxa da plataforma:   R$ 1,25
      Taxa AbacatePay:      R$ 0,00  (PIX)
      ─────────────────────────────
      Total:                R$ 26,25
  - "Comprar" button → POST /api/checkout
```

**Behavior:**
1. On mount, fetch event + tier details from `/api/events/{slug}` (or pass event data)
   - Actually the event page already has data — simpler: pass tier_id, fetch tier price from the API or embed it in the URL
   - **Simplest approach:** Pass `tier` ID as query param, fetch tier details client-side via a minimal endpoint or embed tier info in checkout URL
   - Wait — we don't have a single-tier fetch endpoint. Use the event API and extract the tier from the response.

2. Generate a unique `idempotency_key` client-side (crypto.randomUUID())
3. On submit: POST to `/api/checkout`
4. On success (201/200): redirect browser to `checkout_url` (AbacatePay hosted page)
5. On error (409 oversold): show "Ingressos esgotados" message
6. On error (502 payment provider): show "Tente novamente" with retry button

**Files to create/modify:**
| File | Change |
|------|--------|
| `ticket-app/app/checkout/page.tsx` | **New** — Client component for checkout form |
| `ticket-app/app/checkout/layout.tsx` | **New** — Basic layout or reuse root |

**Checkout flow steps (detailed):**
```
1. User clicks "Comprar" on event page
   → navigates to /checkout?event=my-event&tier=tier-uuid

2. Checkout page loads, fetches event data:
   GET /api/events/my-event → gets tier list
   Finds the matching tier, renders form

3. User fills email + optional name + qty
   → clicks "Comprar"

4. Client generates idempotency_key = crypto.randomUUID()

5. POST /api/checkout {
     event_id,
     items: [{ tier_id, quantity }],
     attendee_email,
     attendee_name (optional),
     idempotency_key
   }

6. On success (201): window.location.href = response.checkout_url
   On 409: show sold-out error
   On 502: show retry button
```

### 3. Build Order Success Page (`/order/[ref]/success`)

**File:** `ticket-app/app/order/[ref]/success/page.tsx` (new — Server Component)

AbacatePay redirects the browser here after payment completes (or the attendee clicks "Voltar ao site" on AbacatePay's hosted page). **Note:** The actual ticket generation happens asynchronously via webhook, so the page may not have ticket data yet.

**Structure:**
```
Page title: "🎉 Pagamento Confirmado!"
Content:
  - "Seu pedido {reference} foi processado com sucesso."
  - "Você receberá seus ingressos por email em instantes."
  - Link to /my-tickets for lookup
  - Link back to event page
```

Consider showing a spinner or polling state: poll `/api/orders/lookup?email=&reference=` every 3s until paid tickets appear, then show them. **But this adds complexity.** Keep it simple for MVP:

- Show the success message immediately
- Link to `/my-tickets` where they can look up by email + reference
- The email will arrive within seconds via Resend (sent synchronously in webhook handler)

**Files to create:**
| File | Change |
|------|--------|
| `ticket-app/app/order/[ref]/success/page.tsx` | **New** — Server component, static success page |

### 4. Update Checkout Route's `completionUrl`

**File:** `ticket-app/app/api/checkout/route.ts`

The route already constructs a `completionUrl` using `process.env.NEXT_PUBLIC_APP_URL`:

```ts
completionUrl: `${process.env.NEXT_PUBLIC_APP_URL}/order/${reference}/success`,
```

Verify this is correct. It should already be set. **No change needed** unless the URL structure is wrong.

**Files to verify:**
| File | Change |
|------|--------|
| `ticket-app/app/api/checkout/route.ts` | Verify `completionUrl` uses `/order/${reference}/success` |

---

## Dependencies

- `NEXT_PUBLIC_APP_URL` must be set in Vercel env + `.env.local` — already required for webhooks
- AbacatePay's hosted checkout handles payment processing — no new integration
- `crypto.randomUUID()` is available in all modern browsers — no polyfill needed

---

## Files Summary

| Action | File | Type |
|--------|------|------|
| **Modify** | `ticket-app/app/events/[slug]/page.tsx` | Server Component — add "Comprar" link per tier |
| **Create** | `ticket-app/app/checkout/page.tsx` | Client Component — checkout form |
| **Create** | `ticket-app/app/order/[ref]/success/page.tsx` | Server Component — order success page |
| **Verify** | `ticket-app/app/api/checkout/route.ts` | Confirm `completionUrl` is correct |

---

## Test Plan

| Test | What to Verify | Type |
|------|---------------|------|
| Event page renders "Comprar" link for each available tier | Link href contains correct slug + tier ID | Unit/mount |
| "Comprar" link navigates to `/checkout?event=X&tier=Y` | Link component renders correct `href` | Unit/mount |
| Checkout form renders with email, name, qty fields | All inputs present | Mount |
| Checkout form validates required email | Submit with empty email shows validation | Mount |
| Checkout form submits and redirects to AbacatePay | Mock API → verify redirect | Integration |
| Checkout form shows error on 409 (oversold) | Mock 409 → verify error message | Integration |
| Checkout form shows error on 502 (payment down) | Mock 502 → verify retry button | Integration |
| Success page renders with order reference | Server render with mock params | Server/mount |
| Success page links to `/my-tickets` | Link present with correct href | Mount |
| E2E: full flow (event → checkout → API → success page) | Supertest of the flow (see PLAN-e2e-happy-path) | E2E |