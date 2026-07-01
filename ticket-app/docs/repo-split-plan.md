# Repo Split Plan: Two Private Repositories

## Current State

Everything lives in one repo: `github.com/olavostauros/ticket`

```
ticket/                    ← single repo
├── app/                   Next.js pages + API routes
├── lib/                   Shared code (supabase client, payments, email, fees, etc.)
├── components/            React components
├── tests/                 Test suite
├── public/                Static assets
├── supabase/migrations/   SQL migration files (3 files)
├── docs/                  Documentation
├── middleware.ts, next.config.ts, tsconfig.json, package.json, vitest.config.ts
├── .env.local.example, .gitignore
└── AGENTS.md, README.md (to be created)
```

Additionally, `ticket-agent/` is a **separate sibling git repo** (already gitignored here).

---

## Target: Two Private Repos

### Repo A: `ticket-app` (GitHub → Vercel)

**Purpose:** The Next.js application — frontend pages, API routes, shared libraries, tests, CI/CD, and Vercel deployment config.

**GitHub:** `github.com/olavostauros/ticket-app` (private)

**Deploys to:** Vercel

**Contents:**

```
ticket-app/
├── .github/workflows/ci.yml    ← CI pipeline
├── app/                        ← All Next.js pages + API routes
├── components/                 ← Reusable React components
├── lib/                        ← All shared code (supabase client, abacatepay, email, etc.)
├── public/                     ← Static assets
├── tests/                      ← Vitest test suite
├── docs/                       ← Documentation
│   ├── development.md
│   ├── testing.md
│   ├── deployment-organization.md
│   ├── plans/                  ← Per-milestone implementation plans
│   └── repo-split-plan.md      ← This file
├── middleware.ts                ← Next.js middleware (auth, rate limit)
├── next.config.ts               ← Next.js configuration
├── package.json                 ← Dependencies + scripts
├── tsconfig.json                ← TypeScript config
├── vitest.config.ts             ← Test runner config
├── vercel.json                  ← Vercel regions + cron (CREATE)
├── .env.local.example           ← Documented env vars
├── .gitignore                   ← Ignore rules
├── README.md                    ← Project overview (CREATE)
├── AGENTS.md                    ← Workspace entry point
└── ticket-agent/                ← Sibling git repo (already separate, remains as-is)
```

**Does NOT include:**
- `supabase/migrations/` — those go in the database repo
- `ticket-agent/.git/` — separate repo

**Environment variables needed at deploy time (set in Vercel Dashboard):**

| Variable | Source |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project |
| `ABACATEPAY_API_KEY` | AbacatePay |
| `ABACATEPAY_WEBHOOK_SECRET` | AbacatePay |
| `RESEND_API_KEY` | Resend |
| `NEXT_PUBLIC_APP_URL` | Self (e.g. `https://ticket.vercel.app`) |
| `JOB_PROCESSOR_SECRET` | Self (random UUID) |

---

### Repo B: `ticket-database` (GitHub → Supabase)

**Purpose:** The database schema definitions — SQL migrations, seed data, Supabase project configuration, and setup instructions. This repo is the source of truth for the database state.

**GitHub:** `github.com/olavostauros/ticket-database` (private)

**Deploys to:** Supabase (applied via Supabase CLI or SQL Editor)

**Contents:**

```
ticket-database/
├── supabase/
│   └── migrations/
│       ├── 00001_initial_schema.sql     ← Tables, indexes
│       ├── 00002_functions.sql          ← PostgreSQL functions
│       └── 00003_atomic_checkout.sql    ← Atomic checkout logic
├── scripts/
│   └── apply-migrations.sh              ← Script to apply all migrations via Supabase CLI
├── README.md                            ← Setup instructions for the database
└── .gitignore
```

**Does NOT include:**
- Any application code (`app/`, `lib/`, `components/`, `tests/`)
- Any Next.js configuration
- `ticket-agent/`

---

## Rationale for the Split

| Concern | Why Separate |
|---------|-------------|
| **Deployment boundaries** | Vercel deploys the app from GitHub; Supabase manages the DB independently. Two repos means different deploy triggers, different access controls. |
| **Migration independence** | DB schema changes don't need app deploys and vice versa. A developer can evolve the schema without touching the app code. |
| **Responsibility separation** | The app repo includes secrets that are only relevant at runtime (API keys). The DB repo has none. |
| **Reusability** | The database schema could be used by a future mobile app (Expo/React Native) without pulling in the whole Next.js codebase. |

## Drawbacks & Mitigations

| Drawback | Mitigation |
|----------|-----------|
| **Schema drift** — app code and migrations can get out of sync | The `supabase/` dir was historically in the app repo. After the split, keep a symlink or a docs note in the app repo pointing to the DB repo. CI in the app repo can clone the DB repo and verify migrations against a test Supabase instance. |
| **Two repos to manage** | Both are small and rarely change independently. The DB repo will have infrequent commits (only when schema changes). |
| **Onboarding friction** | A new developer needs to clone two repos instead of one. Mitigated by clear README instructions in both repos. |

---

## Migration Procedure

### Step 1: Create the repos on GitHub

```bash
# Create two private repos via GitHub CLI or web UI:
# - olavostauros/ticket-app
# - olavostauros/ticket-database
```

### Step 2: Push to `ticket-app` (the new primary repo)

```bash
cd /home/stauros-ticket/ticket

# First, remove supabase/ from the tracked content
# (but keep the files — we're pushing to a new remote)
git rm -r --cached supabase/

# Commit the removal
git commit -m "chore: remove supabase/migrations to separate DB repo"

# Add the new remote
git remote remove origin
git remote add origin https://github.com/olavostauros/ticket-app.git

# Push existing branch
git push -u origin main
```

### Step 3: Push `supabase/` to `ticket-database`

```bash
# Outside the app repo — create a fresh clone
cd /tmp
git init ticket-database
cd ticket-database

# Copy the migrations
cp -r /home/stauros-ticket/ticket/supabase .

# Create README.md
cat > README.md << 'EOF'
# Ticket Database

PostgreSQL schema for the Ticket event ticketing platform.

## Setup

1. Create a Supabase project in `southamerica-east1` (São Paulo)
2. Enable email/password auth provider
3. Run migrations in order via Supabase CLI:

```bash
supabase migration up
```

Or apply each `.sql` file manually in the Supabase SQL Editor.

## Migrations

| File | What |
|------|------|
| `00001_initial_schema.sql` | Tables (organizers, events, tiers, orders, tickets, check_ins, pending_jobs) + indexes |
| `00002_functions.sql` | PostgreSQL functions for job processing |
| `00003_atomic_checkout.sql` | Atomic checkout logic with row-level locking |
EOF

# Create apply script
mkdir -p scripts
cat > scripts/apply-migrations.sh << 'SCRIPT'
#!/bin/bash
# Apply all migrations in order using Supabase CLI
set -euo pipefail

DIR="$(cd "$(dirname "$0")/../supabase/migrations" && pwd)"

echo "Applying migrations from $DIR..."
for f in "$DIR"/*.sql; do
  echo "  Applying $(basename "$f")..."
  supabase db execute --file "$f"
done
echo "Done."
SCRIPT
chmod +x scripts/apply-migrations.sh

# Create .gitignore
cat > .gitignore << 'EOF'
# No secrets in this repo
.env
.env.local
*.pem
EOF

# Initialize git and push
git add -A
git commit -m "feat: initial database schema (3 migrations)"
git remote add origin https://github.com/olavostauros/ticket-database.git
git push -u origin main
```

### Step 4: Create missing files in `ticket-app`

After the split, these files still need to be created per the M7 plan:

- `vercel.json` — Vercel config with São Paulo region + cron job
- `.github/workflows/ci.yml` — CI pipeline
- `README.md` — Project overview
- `app/privacy/page.tsx` — LGPD privacy policy
- `app/api/admin/delete-attendee-data/route.ts` — LGPD data deletion

### Step 5: Clean up

```bash
cd /home/stauros-ticket/ticket
rm -rf supabase/  # Now managed in ticket-database repo
```

Optionally, add a `.gitkeep` or a README note in the app repo about where the DB schema lives:

```bash
mkdir -p supabase
cat > supabase/README.md << 'EOF'
# Database

The database schema and migrations are maintained in a separate repository:

**https://github.com/olavostauros/ticket-database**

See that repo for:
- Migration SQL files
- Supabase setup instructions
- Schema documentation
EOF
```

**Add to `supabase/` in `.gitignore` (except the README):**

```gitignore
supabase/migrations/
supabase/seed.sql
```

Or use `git add -f supabase/README.md` to track just the pointer file.

---

## Post-Split Directory Layout

### `ticket-app` (this directory)

```
/home/stauros-ticket/ticket/
├── .github/workflows/ci.yml
├── app/
├── components/
├── lib/
├── public/
├── tests/
├── docs/
├── supabase/
│   └── README.md              ← points to ticket-database repo
├── middleware.ts
├── next.config.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── vercel.json
├── .env.local.example
├── .gitignore
├── README.md
├── AGENTS.md
└── ticket-agent/               ← separate git repo (sibling, unchanged)
```

### `ticket-database` (separate directory on disk or just on GitHub)

```
ticket-database/
├── supabase/migrations/
│   ├── 00001_initial_schema.sql
│   ├── 00002_functions.sql
│   └── 00003_atomic_checkout.sql
├── scripts/
│   └── apply-migrations.sh
├── README.md
└── .gitignore
```

---

## Gitignore Updates

### `ticket-app/.gitignore` — add:

```gitignore
# Database schema — managed in separate repo (ticket-database)
supabase/migrations/
supabase/seed.sql
```

This keeps the pointer `supabase/README.md` tracked while ignoring the actual migration files.

---

## CI Considerations (Post-Split)

### `ticket-app` CI (`.github/workflows/ci.yml`)

Tests that depend on the database schema (integration tests) will need to either:
1. Use a test helper that creates tables in a temporary schema, or
2. Point CI at a shared Supabase test project

For now, the test suite uses mocks for external services — so no DB dependency in CI. This is fine.

### `ticket-database` CI (optional, add later)

Could add a CI workflow that:
1. Starts a temporary PostgreSQL instance
2. Applies all migrations
3. Runs schema validation (e.g., `pgTAP` tests)
4. Checks for backward-incompatible changes

Not needed for MVP — add when schema evolves beyond 3 files.

---

## Key Links After Split

| Resource | URL |
|----------|-----|
| App repo | `github.com/olavostauros/ticket-app` |
| DB repo | `github.com/olavostauros/ticket-database` |
| Vercel project | `https://vercel.com/olavostauros/ticket-app` |
| Supabase project | `https://supabase.com/dashboard/project/<id>` |