# Plan: Production Readiness & Manual QA

> **Roadmap:** [#9 — Production Readiness Checks](../ROADMAP.md#9-production-readiness-checks) + [#10 — Manual QA Script](../ROADMAP.md#10-manual-qa-script)
> **Priority:** P2 — Go/No-Go Gate
> **Effort:** 1 day

---

## Goal

Run through all production readiness checks and execute the manual QA script to confirm the MVP is shippable. This is the **final gate** before launch.

---

## Step 1: Environment Variables (Vercel)

Verify that all required environment variables are set in the Vercel production environment:

```bash
cd /home/stauros-ticket/ticket/ticket-app
npx vercel env ls
```

**Required variables:**

| Variable | Source | Notes |
|----------|--------|-------|
| `NEXT_PUBLIC_APP_URL` | Your domain | No trailing slash. Used for checkout completion URLs, webhook notifications |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard | Project URL → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard | Project API anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard | ⚠️ Keep secret — never in client bundles |
| `RESEND_API_KEY` | Resend dashboard | For sending transactional emails |
| `RESEND_FROM_EMAIL` | Your verified domain | e.g., `ticket@seudominio.com.br` |
| `ABACATEPAY_API_KEY` | AbacatePay dashboard | For creating checkouts |
| `ABACATEPAY_WEBHOOK_SECRET` | AbacatePay dashboard | For HMAC signature verification |
| `ADMIN_SECRET` | Create manually | For GDPR deletion endpoint (`POST /api/admin/delete-attendee-data`) |

**Verify each is set and non-empty:**

```bash
# Check without revealing values
npx vercel env ls production | grep -E "NEXT_PUBLIC|SUPABASE|RESEND|ABACATEPAY|ADMIN"
```

---

## Step 2: Supabase Configuration

### Region

```bash
supabase projects list
# Expected: southamerica-east1 (São Paulo, Brazil)
```

### Migrations Applied

```bash
cd /home/stauros-ticket/ticket/ticket-database
supabase db push --linked --dry-run
# Expected: "No new migrations to apply" (all 4 applied)

# Verify migration count
supabase db query --linked "
SELECT version, name FROM _migrations ORDER BY version;
"
# Expected: 4 rows — 00001, 00002, 00003, 20260630232833
```

### RLS Verified

```bash
supabase db query --linked "
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename NOT LIKE '_%'
ORDER BY tablename;
"
# Expected: rowsecurity = true for all tables
```

### RLS Policies Verified

```bash
supabase db query --linked "
SELECT tablename, policyname, roles FROM pg_policies
WHERE schemaname = 'public' ORDER BY tablename;
"
# Expected: 8 DENY-ALL policies
```

### Verify Direct REST API is Blocked

```bash
# Extract anon key from local env
ANON_KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2)
SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2)

# Try to access organizers (should fail)
curl -s -w "\nHTTP %{http_code}" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  "$SUPABASE_URL/rest/v1/organizers" | tail -1
# Expected: HTTP 401 or 403
```

---

## Step 3: AbacatePay Configuration

### Webhook URL

Log into AbacatePay dashboard → Webhooks.

**Expected:** A webhook configured pointing to:
```
https://ticket-app-beta-silk.vercel.app/api/webhooks/abacatepay
```
(or your custom domain)

### Webhook Secret

- The webhook secret in AbacatePay dashboard must match `ABACATEPAY_WEBHOOK_SECRET` in Vercel env vars
- Verify the HMAC signature verification works by testing with a known payload

### Test Transaction

Run a test payment through AbacatePay's sandbox/test mode:

```bash
# 1. Create a checkout via the API
curl -X POST https://ticket-app-beta-silk.vercel.app/api/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "YOUR_EVENT_ID",
    "items": [{ "tier_id": "YOUR_TIER_ID", "quantity": 1 }],
    "attendee_email": "test@example.com",
    "attendee_name": "Test User",
    "idempotency_key": "test-key-1"
  }'
# → Should return checkout_url

# 2. Open checkout_url in browser → complete payment in sandbox

# 3. Verify webhook was received
# Check server logs or query the order status
```

---

## Step 4: Resend Configuration

### Domain Verification

Log into Resend dashboard → Domains. Verify:
- Domain status: **Verified**
- SPF record: ✅
- DKIM record: ✅
- DMARC record: ✅ (optional but recommended)

### Sender Name

Ensure `RESEND_FROM_EMAIL` matches a verified sending domain.

---

## Step 5: Custom Domain / SSL

If using a custom domain (recommended for production):

```bash
# Verify in Vercel dashboard
npx vercel domains ls

# Expected: domain listed, verified, SSL active
```

If using the Vercel subdomain (`ticket-app-beta-silk.vercel.app`), SSL is automatically provided.

---

## Step 6: Manual QA Script

Run through **every step** in a real browser. Do not skip steps.

```text
□  1. Open landing page (/) in incognito
     → See "Venda ingressos para seus eventos" hero
     → See "Sou organizador" and "Sou participante" cards
     → See "Entrar" link in header

□  2. Click "Criar conta grátis"
     → Redirected to /signup
     → See name, email, password fields
     → See minimum 8-character password hint

□  3. Fill signup form:
     Name: "Organizador Teste"
     Email: "org-test-{timestamp}@exemplo.com.br"
     Password: "senha12345"
     → Click "Criar conta"
     → Redirected to /dashboard
     → See "Bem-vindo, Organizador Teste!"

□  4. Check welcome email
     → Open email inbox (Resend test email or actual inbox)
     → Email received from ticket@... with subject "Bem-vindo ao Ticket"
     → Contains organizer name, quick-start links

□  5. Click "Criar Evento"
     → See event creation form
     → All fields present: title, slug, description, venue, dates, timezone, cover image

□  6. Fill event form:
     Title: "Evento de Teste"
     Slug: auto-generated → "evento-de-teste"
     Description: "Descrição do evento de teste"
     Venue: "Espaço de Eventos Teste"
     Address: "Rua Teste, 123, São Paulo, SP"
     Start: tomorrow at 20:00
     End: tomorrow at 23:59
     Timezone: America/Sao_Paulo
     → Click "Criar Evento"
     → Redirected to edit page

□  7. Add a ticket tier:
     Name: "Pista"
     Description: "Acesso à pista"
     Price: "50,00"
     Quantity: "100"
     → Click "Adicionar Lote"
     → See "Pista" in the table with R$ 50,00, 0/100 sold

□  8. Add another tier:
     Name: "VIP"
     Price: "150,00"
     Quantity: "50"
     → Click "Adicionar Lote"
     → See both tiers in table

□  9. Click "Publicar Evento"
     → See confirmation toast/message
     → Status changes to "Publicado"
     → "Publicar" button replaced with "Dashboard de Vendas"

□ 10. Open new incognito tab → navigate to /events/evento-de-teste
     → See event title, description, venue, dates
     → See "Pista" tier with R$ 50,00, "100 disponíveis"
     → See "VIP" tier with R$ 150,00, "50 disponíveis"
     → See "Comprar" button on each tier

□ 11. Click "Comprar" on Pista tier
     → Redirected to /checkout?event=evento-de-teste&tier={tier-id}
     → See checkout form with:
       • Event name
       • Tier name + price
       • Email field (required)
       • Name field (optional)
       • Quantity selector (default 1)
       • Fee breakdown
       • Total price

□ 12. Fill checkout:
     Email: "participante-teste@exemplo.com.br"
     Name: "Maria Silva"
     Quantity: 2
     → Click "Comprar"
     → Redirected to AbacatePay hosted checkout page

□ 13. Complete payment via AbacatePay sandbox:
     → Use PIX (simulated or real)
     → After payment → redirected back to /order/TCK-{reference}/success
     → See "Pagamento Confirmado!" message
     → See order reference
     → See link to /my-tickets

□ 14. Check confirmation email:
     → Open inbox for participante-teste@exemplo.com.br
     → Email received with subject "Confirmação de Pedido — Evento de Teste"
     → Contains order reference
     → Contains links to tickets (2 links, one per ticket for qty=2)

□ 15. Click first ticket link
     → Opens /tickets/{unique_code}
     → See event name, date, venue, tier (Pista), holder name (Maria Silva)
     → See QR code rendered
     → No check-in status

□ 16. Open second ticket link
     → Same info, different code

□ 17. Go to /my-tickets in incognito
     → Email: participante-teste@exemplo.com.br
     → Reference: the order reference from step 13
     → Click "Buscar ingressos"
     → See 2 tickets listed
     → Click "Ver ingresso" → goes to ticket page

□ 18. Log in as organizer (org-test-...@exemplo.com.br)
     → Go to /dashboard
     → See "Evento de Teste" in event list with "Publicado" badge
     → Click "Dashboard" → see sales dashboard
     → See: 2 sold / 150 total, R$ 100,00 revenue, fees, 0 check-ins

□ 19. Go to /dashboard/events/evento-de-teste/checkin
     → See check-in interface
     → Search by name: "Maria" → see Maria Silva's ticket
     → Click "Check-in" → attendee checked in ✅
     → See "Check-in realizado" message

□ 20. Go back to sales dashboard
     → See check-in count: 1 / 2

□ 21. Re-open ticket page (from step 15)
     → Refresh → see "✅ Check-in realizado em ..."

□ 22. Visit /privacy
     → See privacy policy in Portuguese
     → See data collection, usage, deletion contact

□ 23. Try to access /dashboard while logged out
     → Open new incognito tab
     → Go to /dashboard
     → Redirected to /login

□ 24. Test error states:
     → Go to /events/non-existent-slug → 404 page
     → Login with wrong password → error message
     → Try to checkout with sold-out tier → error message

□ 25. Final check: RLS security
     → Attempt direct Supabase REST API call with anon key (step 2 above)
     → Should return 403
```

---

## Step 7: Launch

If all 25 QA steps pass and all production checks are green:

### 1. Deploy

```bash
cd /home/stauros-ticket/ticket/ticket-app
git add -A && git commit -m "🚀 MVP launch"
git push
npx vercel --prod
```

### 2. Verify Deployment

```bash
# Wait for deployment to complete
npx vercel --list
# Open the production URL
curl -I https://ticket-app-beta-silk.vercel.app/
# Expected: 200 OK with Next.js headers
```

### 3. Run Quick Smoke Test

Rerun QA steps 1, 10, 11, 12, 17, 18, 22, 23 on the newly deployed production URL.

### 4. Monitor

Monitor the first 24 hours for:
- Vercel Function errors (Vercel Dashboard → Analytics)
- AbacatePay webhook delivery (AbacatePay Dashboard → Webhooks → Logs)
- Email delivery (Resend Dashboard → Logs)
- Supabase database errors (Supabase Dashboard → Logs)

---

## Launch Checklist Summary

```
☐ Environment variables set in Vercel (9 required)
☐ Supabase region = southamerica-east1
☐ All 4 migrations applied to production
☐ RLS enabled on all 8 public tables
☐ RLS DENY-ALL policies active
☐ Direct REST API blocked (403)
☐ AbacatePay webhook URL configured
☐ AbacatePay webhook secret matches env var
☐ AbacatePay test transaction successful
☐ Resend domain verified (SPF + DKIM)
☐ Privacy policy published at /privacy
☐ GDPR deletion endpoint tested
☐ Custom domain configured (if applicable)
☐ SSL/HTTPS working
☐ 25-step Manual QA — all passed
☐ Deployed to production
☐ Post-deployment smoke test passed
```