# AGENTS.md — Workspace Routing & Agent Workflow

This file routes agents to the correct project directory and defines the operational loop for working on the Ticket codebase.

## Workspace Structure

```
ticket/
├── ticket-agent/     ← Agent workspace — MISSION, SPECS, UX, docs, plans
├── ticket-app/       ← Next.js web application (frontend + API routes)
└── ticket-database/  ← Database migrations and Supabase config
```

## Where to go

| If you want to… | Go to… |
|---|---|
| Understand the project mission, specs, or conventions | [`ticket-agent/`](./ticket-agent/) |
| Read or edit the web app code (Next.js, components, API routes, tests) | [`ticket-app/`](./ticket-app/) |
| Work on database schema, migrations, or Supabase config | [`ticket-database/`](./ticket-database/) |

## Quick start

1. Read `ticket-agent/MISSION.md` for the project's purpose.
2. Read `ticket-agent/SPECIFICATIONS.md` for detailed functional and technical specs.
3. Dive into `ticket-app/` for implementation.

---

## Environment Architecture: Local ↔ Vercel ↔ Supabase

This project spans three environments that the agent must distinguish when debugging.

| Environment | Where code runs | DB | Client-side anon key exposed? | Notes |
|---|---|---|---|---|
| **Local dev** | `localhost:3000` (Next.js dev server) | `supabase start` (local Docker) or linked cloud project | Yes — used by browser client for public queries | Run `cd ticket-app && npm run dev` |
| **Vercel Preview** | Vercel preview deployment (per-branch) | Supabase cloud project (same as production)[^1] | Yes — same anon key as production | Created on push; URL from Vercel dashboard |
| **Vercel Production** | `ticket-app-beta-silk.vercel.app` | Supabase cloud project (southamerica-east1) | Yes — `NEXT_PUBLIC_SUPABASE_ANON_KEY` is compiled into JS bundles | Deploy: `npx vercel --prod` from `ticket-app/` |

[^1]: Currently all environments share the same Supabase project. A future improvement would add separate preview/staging projects.

### How data flows

```
Browser (anon key)          Vercel Server (service_role key)      Supabase
     │                              │                                │
     ├─ supabase-js ───────────────►│ (server component, API route)  │
     │  (auth, anon queries)        │                                │
     │                              ├─ supabase-js (service_role)───►│
     │                              │   (bypasses RLS, auth checks   │
     │                              │    done in handler code)       │
     │                              │                                │
     ├─ fetch /api/* ──────────────►│                                │
     │                              │                                │
```

### Key consequence: RLS bypass + PostgREST exposure

**Server-side code** uses `SUPABASE_SERVICE_ROLE_KEY` (see `lib/supabase/server.ts`), which bypasses RLS entirely. Authorization is enforced in route handler code — the handler checks `auth.uid()` and compares it against `organizer_id` or `event.organizer_id` before proceeding. This is documented in SPECIFICATIONS.md §4.4.

**HOWEVER**, the public Supabase REST API (PostgREST) is also accessible directly from the browser using the anon key. The following are true for the production DB:

| Fact | Status | Risk |
|---|---|---|
| `public` schema exposed to PostgREST | ✅ Default — all tables in `public` are reachable via REST API | High if RLS is off |
| RLS enabled on `organizers` | ❌ **Disabled** (`rowsecurity = false`) | Anyone with anon key can query all organizers |
| `anon` role has SELECT/INSERT/UPDATE/DELETE on `organizers` | ✅ **Yes — full CRUD** | Any visitor can read/write `organizers` via PostgREST |
| `authenticated` role has full CRUD on `organizers` | ✅ **Yes** | Any logged-in user (including anonymous sign-ins) can read/write all organizers |
| Other tables (events, tiers, orders, tickets) | Same grants — RLS disabled on ALL tables | Full exposure via PostgREST |

**This is a real security issue.** While the app's own API routes are safe (they use `service_role` and enforce ownership checks in handler code), the Supabase REST API is wide open. The `NEXT_PUBLIC_SUPABASE_ANON_KEY` is embedded in client-side JS, so anyone can browse to the app, extract the anon key from the bundle, and hit `https://<project>.supabase.co/rest/v1/organizers` to get the full table.

### What to do about it

When the agent encounters a Supabase table that is:
- In the `public` schema
- Has RLS disabled
- Has `anon` or `authenticated` grants

...the agent should flag this as a security finding and recommend enabling RLS with appropriate policies. The fix pattern is:

```sql
-- 1. Enable RLS
ALTER TABLE public.organizers ENABLE ROW LEVEL SECURITY;

-- 2. Create a policy that prevents all direct public access
--    (server-side code uses service_role key and bypasses RLS)
CREATE POLICY "Organizers are private" ON public.organizers
  FOR ALL
  TO anon, authenticated
  USING (false);

-- 3. Repeat for all other public tables
```

> ⚠️ **Before applying this fix**, verify that no client-side code relies on directly querying these tables via the anon key. Currently the codebase only uses the server client (`service_role`) for all data access, so `USING (false)` policies are safe.

### Investigating deployment issues

When something works locally but not in production (or vice versa):

1. **Check which Supabase project** the environment points to. Run `supabase db query --linked` to confirm the project ref.
2. **Check Vercel env vars**: `cd ticket-app && npx vercel env ls`
3. **Check the DB directly**: `supabase db query --linked "<sql>"`
4. **Check if the issue is PostgREST exposure** (does the bug reproduce when hitting the Supabase REST URL directly with the anon key?)
5. **Check if RLS is the difference** — local Docker may have different RLS state than the cloud project

---

## Agent Environment

- **OS:** WSL2 (Ubuntu on Windows) — kernel 6.18.33.1-microsoft-standard-WSL2
- **Docker Desktop:** ✅ Enabled and running in this WSL2 environment. All `docker` CLI commands work natively (including `docker ps`, `docker compose`). This means `supabase start` (which spawns local Postgres + GoTrue + other Supabase services via Docker Compose) is fully available for local development.
- **Shell:** Bash (default on this distro)
- **Node:** v24.18.0 (via nvm)
- **Pi agent:** `pi-coding-agent` installed globally (`@earendil-works/pi-coding-agent`)
- **Pi SDK/docs path:** `/home/stauros-ticket/.nvm/versions/node/v24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/`
- **Pi agent skills dir:** `/home/stauros-ticket/.pi/agent/skills/`
- **Skills CLI:** `npx skills` — manages installable agent skills from skills.sh ecosystem
- **Working dir:** `/home/stauros-ticket/ticket`

## CLI Tools at Disposal

| Tool | Version | Purpose | Common usage |
|---|---|---|---|
| `supabase` | 2.109.0 | Database queries, migrations, project management | `supabase db query --linked "<sql>"` — run SQL against the linked Supabase project. `supabase db query --linked` works even when local Docker isn't running. Always use `--linked` for the production database. |
| `vercel` (via `npx vercel`) | 54.18.6 | Deployments, env vars, project config | `npx vercel --prod` — deploy to production. `npx vercel env ls` — list env vars. `npx vercel env pull .env.vercel` — pull production env vars (secrets appear empty locally but are set at runtime). |
| `npm` | 11.16.0 | Package management, running scripts | `npm test` — run the test suite (from `ticket-app/`). `npm run build` — build for production. |
| `git` | 2.53.0 | Version control for the monorepo | The entire `ticket/` directory is a single git repo with one remote. Run `git` commands from the root `ticket/` directory. |
| `curl` | 8.18.0 | API testing, hitting deployed endpoints | Test production endpoints directly: `curl https://ticket-app-beta-silk.vercel.app/api/...` |
| `npx skills` | — | Install/extend agent skills | `npx skills add <owner/repo@skill> -g -y` — install skills from the skills.sh ecosystem. |

### Key CLI workflows

```bash
# Query production DB
cd /home/stauros-ticket/ticket/ticket-database
supabase db query --linked "SELECT * FROM organizers;"

# Run tests
cd /home/stauros-ticket/ticket/ticket-app && npm test

# Deploy
git add -A && git commit -m "..." && git push
npx vercel --prod --cwd ticket-app

# Debug with production env vars
cd /home/stauros-ticket/ticket/ticket-app
npx vercel env run production -- <command>

# Check Vercel env vars
cd /home/stauros-ticket/ticket/ticket-app
npx vercel env ls

# Pull production env vars
cd /home/stauros-ticket/ticket/ticket-app
npx vercel env pull .env.vercel
```

## Git Workflow: Small Commits, Frequent Pushes

The whole repository is a single git repo with one remote on GitHub. Commit early and often — prefer many small, focused commits over one large batch. This keeps the history readable, makes rollbacks easy, and helps others (or your future self) understand why each change was made.

### Principles

- **One logical change per commit.** A commit should do one thing: fix a bug, add a feature, refactor a function, update docs. If you catch yourself writing "and" in the commit message, split it.
- **Commit after every green test run.** Once the test suite passes, that's a natural commit boundary.
- **Small is relative.** A 20-line change in 3 files is fine. A 500-line change touching unrelated modules should be split.
- **Push after every 1–3 commits.** Don't let unpushed commits pile up. Pushing frequently reduces conflict risk and ensures work is backed up.
- **Write descriptive commit messages.** Use imperative mood: "Add fee calculation to checkout handler", not "Added fee calculation" or "changes". If the commit needs more explanation, write a body after a blank line.

### Workflow

```bash
# 1. Check what's changed (run from any directory)
git status          # see what's changed

# 2. Review your changes before staging
git diff            # unstaged changes
git diff --cached   # staged changes

# 3. Stage only what belongs in this commit
git add ticket-app/path/to/file.ts   # single file (prefixed by subdirectory)
git add -p                            # interactive hunk-by-hunk staging

# 4. Commit with a clear message
git commit -m "Add fee calculation to checkout handler"

# 5. Push frequently to GitHub
git push

# 6. Deploy after pushing (optional)
npx vercel --prod --cwd ticket-app
```

### Examples of good commit sizes

| ✅ Good (single concern) | ❌ Too broad |
|---|---|
| `Add fee column to orders table` | `Update orders and fix checkout` |
| `Handle missing organizer in event page` | `Event page changes + DB migration + test fixes` |
| `Bump @supabase/ssr to 0.6.0` | `Update deps and refactor auth` |

### When the agent makes changes

The agent should follow the same discipline:

1. Make the smallest set of changes that accomplishes the task.
2. Stage and commit each logical unit.
3. Push when done.
4. Use the commit message format: `[scope]: brief description` (e.g., `[ticket-app]: Add fee calculation to checkout handler`).
```

## Available Skills

Skills are installable packages that extend the agent's capabilities with specialized knowledge, workflows, and tools. They live in `/home/stauros-ticket/.pi/agent/skills/` and are symlinked from the `.agents/skills` directory.

| Skill | Description | When to use |
|---|---|---|
| `find-skills` | Helps users discover and install skills from the open agent skills ecosystem. Uses `npx skills` CLI to search, add, and manage skills. | User asks "how do I do X" or "is there a skill for X" |
| `grill-me` | A relentless interview to sharpen a plan or design. Invoked via the `/grilling` command or "grill" verb. | When a plan or design needs stress-testing — use the "grill" verb on a plan file to have the agent interview you and poke holes in the approach. |
| `supabase` | Specialized knowledge for Supabase tasks — database, auth, edge functions, storage, RLS, etc. | Any Supabase-related task (DB, Auth, Storage, RLS, Edge Functions) |

When a user asks "how do I do X" or "is there a skill for X", use the `find-skills` skill to search the skills.sh registry. For common web dev tasks, check [skills.sh leaderboard](https://skills.sh/) first. Always verify install count and source before recommending.

To install a new skill globally:
```bash
npx skills add <owner/repo@skill> -g -y
```

## Workflow Loop

When working on a task, follow this sequence:

1. **Read the docs first.** Read `MISSION.md` and `SPECIFICATIONS.md` to understand context before touching code.

2. **Load the relevant skill.** If the task involves Supabase (DB, Auth, Storage, RLS, Edge Functions, migrations, or any `supabase.*` command), load the `supabase` skill at `.agents/skills/supabase/SKILL.md` before proceeding. The skill contains critical security guidance, CLI gotchas, and RLS best practices specific to this project.

3. **Determine the repo.** Figure out which repo the task lives in:
   - `ticket-agent/` — docs, specs, plans
   - `ticket-app/` — code (Next.js, components, API routes, tests)
   - `ticket-database/` — schema migrations, Supabase config

4. **Propose a plan** before writing significant code. Show the approach and get confirmation.
4. **Write tests alongside implementation** (in `ticket-app/tests/`).
5. **Run the test suite** before marking work complete:
   ```bash
   cd ../ticket-app && npm test
   ```
6. **Update specs when requirements change.** When code and docs disagree, the code wins — update the relevant file to match reality.

## Decision-Making

When choosing between approaches with roughly equal complexity:

- **MVP bias.** Prefer the approach that ships the working feature with fewer dependencies, even if it's less elegant. You can refactor later.
- **Don't build what you don't need.** If a config table (`fee_configs`, discount codes) isn't required for the current story, hardcode the value. Add configurability when you have a second use case.
- **Blocking > retrying.** When faced with concurrent access patterns (checkout, inventory), prefer locks over optimistic retries. PostgreSQL row-level locking is well-understood and reliable.

## Prohibited

- Do not write placeholder or stub code without flagging it.
- Do not create files, directories, or config entries that correspond to unimplemented features. If an endpoint isn't built yet, its route handler file should not exist.
- Do not commit generated boilerplate without review.
- Do not ignore failing tests.
- Do not hardcode secrets or configuration that varies by environment.
- Do not expose Supabase `service_role` key or organizer PIX keys client-side.
- Do not store sensitive data (PIX keys, refund IDs) in places readable by client-side code.
