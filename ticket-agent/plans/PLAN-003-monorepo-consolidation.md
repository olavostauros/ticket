# PLAN-003: Consolidate Three Repos into a Single Monorepo

**Status:** ✅ Done  
**Author:** Agent (grill session output)  
**Date:** 2026-07-01  
**Execution date:** 2026-07-01  

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
├── AGENTS.md                    ← stays at root
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

## 3. Migration Steps Executed

### Step 1: Commit pending work

All three repos had uncommitted changes. They were committed to their respective repos first (to preserve history):

- **ticket-app:** `[ticket-app]: Improve login form UX — client-side validation, password toggle, Portuguese error messages, rate-limit handling`
- **ticket-database:** `[ticket-database]: Enable RLS with DENY-ALL policies on all public tables`
- **ticket-agent:** `[ticket-agent]: Add PLAN-003 — monorepo consolidation`

Also fixed: `.env.vercel` and `supabase/.temp/` were accidentally committed — removed from commit and added to `.gitignore`.

### Step 2: Create new root git repo

```bash
cd /home/stauros-ticket/ticket

# Remove the three .git directories
rm -rf ticket-app/.git ticket-database/.git ticket-agent/.git

# Initialize a fresh repo at the root
git init
git branch -m main
git add -A
git commit -m "[root]: Initial monorepo commit — consolidate ticket-app, ticket-database, ticket-agent"

# Add the new remote and push
git remote add origin https://github.com/olavostauros/ticket-platform.git
git push -u origin main
```

Note: `ticket` was already archived on GitHub, so `ticket-platform` was used instead. Created via `gh repo create olavostauros/ticket-platform --private --push --source=.`

### Step 3: Configure Vercel rootDirectory

Added to `ticket-app/vercel.json`:
```json
{
  "rootDirectory": "ticket-app",
  "framework": "nextjs",
  "regions": ["gru1"]
}
```

### Step 4: Update `.gitignore`

- Created root `ticket/.gitignore` covering all subdirectories (node_modules, .next, .env.*, supabase/.temp/, .vercel, etc.)
- Removed `ticket-app/.gitignore` (which had stale exclusions for `ticket-agent/` and `supabase/migrations/`)

### Step 5: Update AGENTS.md

Updated to reflect single repo:
- Git Workflow section: "one git repo" instead of "three separate repos"
- CLI Workflows: deploy command uses `git push && npx vercel --prod --cwd ticket-app`
- Workflow section: `git add` paths prefixed by subdirectory, no more `cd ticket-app`
- CLI Tools table: git description updated

### Step 6: Verify everything works

```bash
# Tests pass (301/301)
cd /home/stauros-ticket/ticket/ticket-app && npm test

# Supabase CLI still linked
cd /home/stauros-ticket/ticket/ticket-database
supabase db query --linked "SELECT 1"
```

---

## 4. Result

| Item | Value |
|---|---|
| Remote | `github.com/olavostauros/ticket-platform` |
| Initial commit | `80043f1` — 148 files, 33,574 insertions |
| Tests | 301/301 passing (17 test files) |
| Supabase link | ✅ Still linked to production |
| Vercel rootDirectory | Set to `ticket-app/` in `vercel.json` |

---

## 5. What you still need to do

1. **Verify Vercel rootDirectory** in the dashboard:
   - Go to [vercel.com/olavostauros/ticket-app/settings](https://vercel.com/olavostauros/ticket-app/settings)
   - Check **Root Directory** is set to `ticket-app/`
   - If blank, set it

2. **First deploy from monorepo:**
   ```bash
   npx vercel --prod --cwd ticket-app
   ```

---

## 6. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Vercel deploy fails because `rootDirectory` isn't picked up | Low | Already set in `vercel.json`. Verify in dashboard. |
| Lost commit history causes regret | Low for MVP | Old remotes still exist with all commits at `github.com/olavostauros/ticket-app`, `ticket-database`, `ticket-agent`. |
| `supabase link` breaks because `.temp/` was removed by `.gitignore` | Low | Re-run `supabase link --project-ref giwwovodjdfdwilbssim` from `ticket-database/`. |
| CI/CD references old repo paths | Low | No CI/CD is set up yet. When setting it up, point it at the new monorepo. |

---

## 7. Rollback

If the monorepo causes problems:
1. The old remotes still exist with all commits — nothing is deleted
2. Restore a sub-repo: `git clone https://github.com/olavostauros/ticket-app.git`
3. Keep the monorepo, just push from subdirectories separately