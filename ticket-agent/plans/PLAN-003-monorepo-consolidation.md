# PLAN-003: Consolidate Three Repos into a Single Monorepo

**Status:** Draft  
**Author:** Agent (grill session output)  
**Date:** 2026-07-01  

---

## 1. Motivation

Currently `ticket/` is already a monorepo *on disk* — all three directories sit under one root — but each has its own `.git/`, its own remote, and its own commit history:

| Directory | Remote | Purpose |
|---|---|---|
| `ticket-app/` | `github.com/olavostauros/ticket-app` | Next.js app → Vercel |
| `ticket-database/` | `github.com/olavostauros/ticket-database` | Supabase migrations |
| `ticket-agent/` | `github.com/olavostauros/ticket-agent` | Docs, plans, specs |

**Problem:** Coordinated changes (add a DB column + update the app code) require two git pushes, two PRs, and the deploy order matters. Push code before the migration → deployed app crashes. Push migration before code → works but history is fragmented.

**Goal:** One `git` repo, one remote, atomic commits for cross-cutting changes, while preserving Vercel-deploys-from-`ticket-app/` and Supabase-CLI-links-from-`ticket-database/`.

---

## 2. Proposed Structure

```
ticket/                          ← root of the single git repo
├── .git/
├── AGENTS.md                    ← stays at root (moved from ticket/ root)
├── .agents/                     ← pi agent config (stays)
├── skills-lock.json             ← stays at root
├── ticket-app/                  ← Next.js app (Vercel rootDirectory)
│   ├── package.json
│   ├── vercel.json
│   └── ...
├── ticket-database/             ← Supabase CLI config
│   ├── supabase/
│   │   ├── config.toml
│   │   ├── migrations/
│   │   └── .temp/               ← excluded via .gitignore
│   └── scripts/
└── ticket-agent/                ← Docs, specs, plans
    ├── MISSION.md
    ├── SPECIFICATIONS.md
    └── plans/
```

No changes to directory layout — it's already correct. Only the `.git/` directory and remote change.

---

## 3. Migration Steps

### Step 1: Clean working trees

Ensure all three repos have zero uncommitted changes.

```bash
cd /home/stauros-ticket/ticket

# Check each repo
for d in ticket-app ticket-database ticket-agent; do
  echo "=== $d ==="
  cd "$d"
  git status --short
  cd ..
done
```

If anything is dirty, commit or stash it.

### Step 2: Create a new root git repo with one remote

Create a new GitHub repository called `ticket` (or `ticket-platform`) under the `olavostauros` account, then:

```bash
cd /home/stauros-ticket/ticket

# Remove the three .git directories
rm -rf ticket-app/.git ticket-database/.git ticket-agent/.git

# Initialize a fresh repo at the root
git init
git add .
git commit -m "[root]: Initial monorepo commit — consolidate ticket-app, ticket-database, ticket-agent"

# Add the new remote
git remote add origin git@github.com:olavostauros/ticket.git

# Push
git branch -M main
git push -u origin main
```

> ⚠️ **Historical commits are lost.** There is no merge of histories — this is a fresh commit. If preserving history matters, use `git filter-repo` to transplant each sub-repo's history into subdirectories (much more complex). For an MVP project with few commits, a fresh start is acceptable.

### Step 3: Configure Vercel to build from `ticket-app/`

The Vercel project is already created and linked to `ticket-app`. After the monorepo change, tell Vercel where to find the Next.js app:

**Option A — CLI (recommended):**

```bash
cd /home/stauros-ticket/ticket/ticket-app
npx vercel project settings --root-directory ticket-app
```

**Option B — Vercel Dashboard:**

1. Go to [vercel.com/olavostauros/ticket-app/settings](https://vercel.com/olavostauros/ticket-app/settings)
2. Under **Root Directory**, set it to `ticket-app/`
3. Under **Build Command**, verify it's `next build` (default)
4. Under **Output Directory**, verify it's `.next` (default)

**Option C — vercel.json (at repo root):**

```json
{
  "rootDirectory": "ticket-app",
  "framework": "nextjs",
  "regions": ["gru1"]
}
```

> Note: Vercel's `rootDirectory` tells Vercel which subdirectory to `cd` into before running the build. Currently `vercel.json` lives inside `ticket-app/`, which works because the whole repo *was* `ticket-app/`. After the monorepo change, Vercel needs the root directory to be set explicitly so it finds `ticket-app/package.json`.

### Step 4: Update `.gitignore` rules

The current `ticket-app/.gitignore` has lines that were correct when `ticket-app/` was its own repo but are now harmful:

```gitignore
# Remove these — they are part of the monorepo now
ticket-agent/
supabase/migrations/
supabase/seed.sql
```

The root `.gitignore` should live at `ticket/.gitignore` and cover the whole repo:

```gitignore
# dependencies
node_modules/
.pnp
.pnp.js

# testing
coverage/

# next.js
.next/
out/

# production
build/

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# pi agent sessions & config
.pi/

# local env files
.env
.env*.local
.env.*.local

# supabase temp files (per-machine state)
**/supabase/.temp/

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
```

After changing the gitignore, update the root commit:

```bash
cd /home/stauros-ticket/ticket
# Remove old .gitignore in ticket-app/
rm ticket-app/.gitignore

# Create new root .gitignore with content above
git add -A
git commit -m "[root]: Update .gitignore for monorepo layout"
git push
```

### Step 5: Update AGENTS.md

The AGENTS.md at the repo root currently describes three repos. Update:

- **Git Workflow section:** Replace "Each subdirectory (...) is its own git repo" with "The whole repository is one git repo. Use `git` from the root `ticket/` directory."
- **CLI Workflows:** Update paths — remove `cd ticket-app` from `npm test` (still needed for running from root), update deploy command to `git push && npx vercel --prod --cwd ticket-app`.

### Step 6: Verify everything works

```bash
# 1. Tests pass from the app directory
cd /home/stauros-ticket/ticket/ticket-app && npm test

# 2. Supabase CLI still links
cd /home/stauros-ticket/ticket/ticket-database
supabase db query --linked "SELECT 1"

# 3. Vercel detects the monorepo correctly
cd /home/stauros-ticket/ticket/ticket-app
npx vercel --prod
```

---

## 4. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Vercel deploy fails because `rootDirectory` isn't set | Medium | Set it *before* pushing the monorepo commit, or during a maintenance window |
| Lost commit history causes regret | Low for MVP | The project has ~10 commits total across all three repos. A fresh start is fine. If history matters later, the old remotes still exist. |
| `supabase link` breaks because `.temp/` was in `.gitignore` and the linked project ref is lost | Low | The linked project ref is in `supabase/.temp/linked-project.json` which is already gitignored. Rerun `supabase link --project-ref giwwovodjdfdwilbssim` from `ticket-database/`. |
| CI/CD (GitHub Actions) references the old repo paths | Low | No CI/CD is set up yet per SPECIFICATIONS.md §4.1 ("GitHub Actions — test on push, deploy to Vercel on main"). When setting it up, point it at the new monorepo. |

---

## 5. Coordination Dependencies

This plan has **no external dependencies**. All changes are local:
- New GitHub repo needs to be created (user action)
- Vercel root directory setting (user action via CLI or dashboard)
- Everything else is file edits

---

## 6. Rollback

If the monorepo causes problems:
1. The old remotes still exist with all commits — nothing is deleted
2. Restore a sub-repo: `git clone git@github.com:olavostauros/ticket-app.git`
3. Keep the monorepo, just push from subdirectories separately

---

## 7. Alternative: Keep Separate Repos

If the coordination pain is tolerable for a solo MVP, keeping three repos is also valid. The cost is:
- ~30 seconds overhead per cross-cutting change (two pushes, two commits)
- Cannot atomically land a DB+code PR

For a solo developer making 1-2 cross-cutting changes per week, this is ~1-2 minutes/week overhead. The monorepo is worth doing if you anticipate more frequent coordinated changes or adding a second developer.