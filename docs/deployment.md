# Deployment Guide

This project is a monorepo with two deploy targets:

| Target | Directory | Service | How |
|--------|-----------|---------|-----|
| **App** | `ticket-app/` | Vercel | `vercel --prod` (or git push) |
| **Database** | `ticket-database/` | Supabase | `supabase db query --linked --file <migration.sql>` |

> ⚠️ **Security:** The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely. It is set server-side only (never `NEXT_PUBLIC_`). Any `NEXT_PUBLIC_` env var is sent to the browser and visible to anyone. Never commit secret keys to the repo — `.env*local` is gitignored.

You deploy them separately — same commit, two commands.

---

## ✅ Pre-flight checklist

Before starting, verify your CLI tools are authenticated:

```bash
# GitHub — should show your username
git config user.name
git config user.email
git remote -v

# Vercel — should show your username
npx vercel whoami

# Supabase login (opens browser for GitHub OAuth)
supabase login
```

**Known state (as of 2026-07-01):**

| Tool | Status |
|------|--------|
| GitHub | ✅ Authenticated (`olavostauros`, remote `github.com/olavostauros/ticket`) |
| Vercel | ✅ Authenticated (`olavostauros`), no Vercel project created yet |
| Supabase CLI | ✅ Authenticated after `supabase login` |
| Supabase cloud | ❌ No project created yet — Step 1 creates one |

---

## Before you start

You need accounts with:

- **GitHub** — repo is already there: `github.com/olavostauros/ticket`
- **Vercel** — log in at vercel.com (use GitHub OAuth)
- **Supabase** — log in at supabase.com (use GitHub OAuth)

> 🤖 **Agent:** The human should already have these accounts. If not, ask them to create them before proceeding.

---

## Step 1: Create a Supabase project

> 🤖 **Agent:** Run the CLI commands below. The flow is:
> 1. List orgs to find the org ID (use the personal org)
> 2. Generate a database password
> 3. Create the project
> 4. Link the CLI to the project
> 5. Fetch API keys
> 6. Write them to `.env.local`

### 1a. Find your organization ID

```bash
cd /home/stauros-ticket/ticket/ticket-database
supabase orgs list
```

Pick your personal org's ID (e.g., `cool-green-pqdr0qc`). If you only have one org, that's the one.

### 1b. Generate a database password

```bash
# Linux (openssl is available)
pw=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)
echo "$pw"  # Save this somewhere safe
```

### 1c. Create the project

```bash
cd /home/stauros-ticket/ticket/ticket-database
supabase projects create ticket \
  --org-id "<your-org-id>" \
  --db-password "$pw" \
  --region sa-east-1
```

This takes about 2–3 minutes. On success it prints the **project ref** (the slug after `/project/` in the dashboard URL, e.g. `abcdefghijklmnopqrst`). Save it.

### 1d. Link the CLI

```bash
cd /home/stauros-ticket/ticket/ticket-database
supabase link --project-ref "<your-project-ref>"
```

### 1e. Fetch API keys

These keys are needed in your `.env.local` and Vercel environment variables. Use `--reveal` to see the full secret values:

```bash
supabase projects api-keys --project-ref "<your-project-ref>" --reveal --output json
```

The output looks like:
```json
[
  {"name": "anon", "api_key": "eyJhbGciOiJIUzI1NiIs..."},
  {"name": "service_role", "api_key": "eyJhbGciOiJIUzI1NiIs..."}
]
```

### 1f. Save to `.env.local`

```bash
cd /home/stauros-ticket/ticket/ticket-app
cp -n .env.local.example .env.local 2>/dev/null || true
```

Edit `.env.local` and set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon api_key from step 1e>
SUPABASE_SERVICE_ROLE_KEY=<service_role api_key from step 1e>
```

> 🤖 **Agent:** The project URL format is `https://<project-ref>.supabase.co`. Confirm this in the API keys output or dashboard.

---

## Step 2: Apply migrations to Supabase

> 🤖 **Agent:** After linking (Step 1d), you can apply migrations directly. No access token needed — `supabase login` + linking handles authentication.

Apply all migrations in order:

```bash
cd /home/stauros-ticket/ticket/ticket-database
./scripts/apply-migrations.sh
```

Or manually:

```bash
cd /home/stauros-ticket/ticket/ticket-database
for f in supabase/migrations/*.sql; do
  echo "Applying $(basename "$f")..."
  supabase db query --linked --file "$f"
done
```

> **Data API:** After applying migrations, check **Supabase Dashboard → Integrations → Data API → Settings** to confirm tables are exposed. By default, new tables may not be accessible via the REST API. If needed, grant access to `anon` and `authenticated` roles (with RLS enabled on every table).

> **Verify:** Check the Supabase dashboard → Table Editor. You should see tables: `organizers`, `events`, `tiers`, `orders`, `tickets`, `check_ins`, `pending_jobs`.

---

## Step 3: Set up Supabase Auth

> 🤖 **Agent:** There is no Supabase CLI command for Auth provider settings. This step requires the dashboard.

In the Supabase dashboard:

1. Go to **Authentication → Providers**
2. Make sure **Email** is enabled
3. **Disable "Confirm email"** (the app manages its own confirmation flow)
4. Go to **Authentication → Settings**
5. Under **Site URL**, set `https://<your-app>.vercel.app` (you'll fill this after Step 4)

> ⚠️ **Auth security notes:**
> - Never use `raw_user_meta_data` for authorization decisions — it is user-editable. Use `app_metadata` instead.
> - Deleting a user does not invalidate existing tokens — sign out or revoke sessions first.
> - RLS policies should use `TO authenticated` with an ownership predicate (`auth.uid() = user_id`), never `auth.role()` which is deprecated.
> - Every table exposed via the Data API must have RLS enabled with appropriate policies.

---

## Step 4: Deploy the app to Vercel

### Option A: Vercel Dashboard (recommended for first time)

1. Go to [vercel.com](https://vercel.com) and log in
2. Click **Add New → Project**
3. Import `github.com/olavostauros/ticket`
4. Vercel will auto-detect:
   - **Root Directory:** `ticket-app` (from `vercel.json`)
   - **Framework:** Next.js
   - **Build Command:** `next build`
5. Click **Deploy** — it will fail on the first attempt (env vars missing), that's expected
6. Go to **Project Settings → Environment Variables**
7. Add these:

| Name | Value | Environment |
|------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<your-project>.supabase.co` | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon public` key from Step 1 | All |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key from Step 1 | All |
| `ABACATEPAY_API_KEY` | Your AbacatePay API key | All |
| `ABACATEPAY_WEBHOOK_SECRET` | Your AbacatePay webhook secret | All |
| `RESEND_API_KEY` | Your Resend API key | All |
| `NEXT_PUBLIC_APP_URL` | `https://<your-app>.vercel.app` | All |
| `JOB_PROCESSOR_SECRET` | Generate a random UUID (`uuidgen` on macOS/Linux) | All |

> 🤖 **Agent:** If the human doesn't have AbacatePay or Resend API keys, ask them to sign up at abacatepay.com and resend.com and generate the keys.

> ⚠️ **Do NOT set `SUPABASE_ACCESS_TOKEN` in Vercel.** That token is only needed for the CLI to authenticate API calls (login, project creation, migrations) — never at runtime. Keep it in your password manager.

> 🤖 **Agent:** You won't know `NEXT_PUBLIC_APP_URL` yet — the Vercel URL is assigned during the first deploy. After the CLI creates the project and outputs the URL, ask the human to set `NEXT_PUBLIC_APP_URL` in the Vercel Dashboard env vars, then redeploy.

8. Go to **Deployments**, find the failed deployment, click **Redeploy**
9. Wait for the build — should succeed this time

### Option B: Vercel CLI

```bash
cd /home/stauros-ticket/ticket/ticket-app

# First deploy — creates the project
npx vercel --prod

# Vercel will ask you to:
#   1. Log in (if not already)
#   2. Link to an existing project or create new
#   3. Set environment variables interactively

# Subsequent deploys (after Vercel project exists):
npx vercel --prod
```

> 🤖 **Agent:** After the first deploy, note the production URL (e.g., `ticket-app-xxx.vercel.app`). Ask the human to set `NEXT_PUBLIC_APP_URL` to this value in the Vercel Dashboard env vars, then redeploy. Also ask the human to set this URL as the **Site URL** in **Supabase → Authentication → Settings**.

---

## Step 5: Verify the deployment

```bash
curl https://<your-app>.vercel.app/api/events
# Should return {"data":[]} or a JSON response (no auth required for listing)
```

```bash
curl https://<your-app>.vercel.app/
# Should return the homepage HTML
```

---

## Update workflow (after the first deploy)

Whenever you make changes, follow this sequence:

### If you changed the database schema

Before generating a migration file, iterate on schema changes directly using `supabase db query --linked`:

```bash
cd ~/ticket/ticket-database
supabase db query --linked "CREATE TABLE ..."
```

This does not write migration history, so you can iterate freely. When ready to commit:

1. **Run advisors** → `supabase db advisors` (v2.81.3+) to check for issues
2. **Review the RLS/Auth security checklist** (see Step 3 above)
3. **Generate the migration** → `supabase db pull <descriptive-name>`
4. **Verify** → `supabase migration list`

Then deploy:

```bash
# 1. Apply migration to production first
cd ~/ticket/ticket-database
supabase db query --linked --file supabase/migrations/<new_migration>.sql

# 2. Then deploy the app (which now depends on that migration)
cd ~/ticket/ticket-app
npx vercel --prod
```

> **Why migration first:** If the new app code references a column that doesn't exist yet, it will crash. Apply the schema change before deploying the code that depends on it.

> **⚠️ Production schema changes carry risk.** If the database has real data, consider taking a backup first (Supabase Dashboard → Database → Backups → Create backup) before running ad-hoc DDL. There is no undo.

> ⚠️ **Never use `SUPABASE_ACCESS_TOKEN` in `NEXT_PUBLIC_` env vars.** It is a CLI credential, not a runtime secret. Keep it stored securely (e.g., password manager, 1Password).

### If you only changed the app code

```bash
cd ~/ticket/ticket-app
npx vercel --prod
```

Or just push to `main` — Vercel auto-deploys on push if you set it up that way in the import step.

---

## Environment cheat sheet

| Where you are | `NEXT_PUBLIC_SUPABASE_URL` points to |
|---|---|
| **Local dev** (`localhost:3000`) | Local Docker Supabase (`http://127.0.0.1:54321`) |
| **Vercel Preview** (per-branch URL) | Production Supabase (same as production — be careful) |
| **Vercel Production** | Production Supabase |

> ⚠️ Preview deployments share the production database. Don't accidentally test destructive operations on preview branches.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| Build fails with `Missing required environment variables` | Env vars not set in Vercel Dashboard |
| Build fails with `should NOT have additional property rootDirectory` | You're deploying from inside `ticket-app/` but `vercel.json` has `rootDirectory: "ticket-app"`. Run `npx vercel --prod` from the repo root instead, or temporarily remove `rootDirectory` from `vercel.json`. |
| API routes return 500 | `SUPABASE_SERVICE_ROLE_KEY` is wrong or missing |
| Auth doesn't work | Site URL in Supabase Auth settings doesn't match the deployed app URL |
| Pages are blank | `NEXT_PUBLIC_SUPABASE_ANON_KEY` is wrong |
| `supabase db execute` fails | Use `supabase db query --linked --file` instead (CLI v2.79.0+) |
| Tables not accessible via API | Check Data API settings — new tables may need explicit role grants |
| RLS updates silently do nothing | UPDATE requires a SELECT policy too; add one |
| 404 on API routes | Root directory misconfigured — check `vercel.json` or project settings |