# Deployment Guide

This project is a monorepo with two deploy targets:

| Target | Directory | Service | How |
|--------|-----------|---------|-----|
| **App** | `ticket-app/` | Vercel | `npx vercel --prod --cwd ticket-app` |
| **Database** | `ticket-database/` | Supabase | `supabase db query --linked --file <migration.sql>` |

> ⚠️ **`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS.** Set it server-side only (never `NEXT_PUBLIC_`). Never commit secret keys to the repo — `.env*local` is gitignored.

---

## Pre-flight

```bash
# Check auth
git config user.name && git remote -v      # GitHub
npx vercel whoami                           # Vercel
supabase login                              # Supabase (browser OAuth, or --token in CI)
```

---

## Step 1: Create a Supabase project

```bash
cd ticket-database

# 1a. List orgs — pick your personal org ID
supabase orgs list

# 1b. Generate DB password
pw=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)

# 1c. Create project (~2 min)
supabase projects create ticket \
  --org-id "<your-org-id>" \
  --db-password "$pw" \
  --region sa-east-1
# Save the project ref from output (e.g. wzxmdzdtvxhgitcuwbxc)

# 1d. Link CLI
supabase link --project-ref "<your-project-ref>"

# 1e. Fetch API keys
supabase projects api-keys --project-ref "<your-project-ref>" --reveal --output json

# 1f. Update .env.local
cd ../ticket-app && cp -n .env.local.example .env.local 2>/dev/null || true
# Edit: set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

---

## Step 2: Apply migrations

```bash
cd ticket-database
./scripts/apply-migrations.sh
# Verify: supabase db query --linked "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"
# Expected: organizers, events, tiers, orders, order_items, tickets, check_ins, pending_jobs
```

---

## Step 3: Set up Supabase Auth (Dashboard)

1. **Authentication → Providers** → Email **enabled**, "Confirm email" **disabled**
2. **Authentication → Settings** → **Site URL** = `https://<your-app>.vercel.app` (fill after Step 4)

---

## Step 4: Deploy app to Vercel

```bash
cd /home/stauros-ticket/ticket   # repo root

# First deploy (creates project)
npx vercel --prod --cwd ticket-app
# Note the aliased production URL (e.g. ticket-app-rust.vercel.app)
```

The first deploy will fail (missing env vars). Set them via CLI:

```bash
cd ticket-app
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add ABACATEPAY_API_KEY production
npx vercel env add ABACATEPAY_WEBHOOK_SECRET production
npx vercel env add RESEND_API_KEY production
npx vercel env add JOB_PROCESSOR_SECRET production    # e.g. `node -e "console.log(require('crypto').randomUUID())"`
npx vercel env add NEXT_PUBLIC_APP_URL production
```

Then redeploy:

```bash
cd /home/stauros-ticket/ticket
npx vercel --prod --cwd ticket-app
```

> ⚠️ **Do NOT set `SUPABASE_ACCESS_TOKEN` in Vercel.** It's a CLI credential, not a runtime secret.

---

## Step 5: Verify

```bash
curl https://<your-app>.vercel.app/                             # → 200, HTML
curl https://<your-app>.vercel.app/login                        # → 200
curl https://<your-app>.vercel.app/api/auth/signup -X POST \    # → user created
  -H "Content-Type: application/json" \
  -d '{"email":"test@e.com","password":"Test123!","name":"Test"}'
curl https://<your-app>.vercel.app/api/auth/login -X POST \     # → organizer profile
  -H "Content-Type: application/json" \
  -d '{"email":"test@e.com","password":"Test123!"}'
```

Then go back to **Step 3** and set the **Site URL** in Supabase Auth to your Vercel production URL.

---

## Update workflow

### Database change (apply migration before deploying code)

```bash
cd ticket-database
# Iterate directly: supabase db query --linked "ALTER TABLE ..."
# When ready:
supabase db advisors                              # check for issues
supabase db pull <descriptive-name>               # generate migration file
supabase db query --linked --file supabase/migrations/<file>.sql  # apply to prod
cd /home/stauros-ticket/ticket
npx vercel --prod --cwd ticket-app                # then deploy app
```

### App-only change

```bash
cd /home/stauros-ticket/ticket
npx vercel --prod --cwd ticket-app
```

---

## Environment cheat sheet

| Where you are | `NEXT_PUBLIC_SUPABASE_URL` points to |
|---|---|
| **Local dev** | Local Docker Supabase (`http://127.0.0.1:54321`) |
| **Vercel Preview** | Production Supabase — be careful |
| **Vercel Production** | Production Supabase |

---

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| Build fails: `Missing required environment variables` | Env vars not set in Vercel |
| Build fails: `should NOT have additional property rootDirectory` | Remove `rootDirectory` from `vercel.json` — deploy with `--cwd ticket-app` from repo root instead |
| API routes return 500 | `SUPABASE_SERVICE_ROLE_KEY` is wrong or missing |
| Auth doesn't work | Site URL in Supabase Auth settings doesn't match the deployed app URL |
| Pages are blank | `NEXT_PUBLIC_SUPABASE_ANON_KEY` is wrong |
| Tables not accessible via API | Data API settings need role grants for new tables |