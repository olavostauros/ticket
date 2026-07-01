# AGENTS.md — Workspace Routing & Agent Workflow

This file routes agents to the correct project directory and defines the operational loop for working on the Ticket codebase.

## Workspace Structure

```
ticket/
├── .agents/              ← Agent skills (supabase, grilling, find-skills)
├── skills-lock.json      ← Installed skills manifest (source of truth)
├── ticket-agent/         ← MISSION, SPECS, UX, docs, plans
├── ticket-app/           ← Next.js web application (frontend + API routes)
└── ticket-database/      ← Database migrations and Supabase config
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
3. Set up local environment:
   ```bash
   cd ticket-app && cp -n .env.local.example .env.local
   ```
   Edit `.env.local` with your Supabase keys (anon key + service role key).
4. Run the app: `cd ticket-app && npm run dev`
5. Run tests: `cd ticket-app && npm test`

---

## Environment Architecture

Three environments share the same Supabase project[^1]:

| Environment | Code runs at | DB |
|---|---|---|
| **Local dev** | `localhost:3000` | `supabase start` (local Docker) or cloud project |
| **Vercel Preview** | Per-branch Vercel preview | Supabase cloud (southamerica-east1) |
| **Vercel Production** | `ticket-app-beta-silk.vercel.app` | Supabase cloud (southamerica-east1) |

[^1]: A future improvement would separate preview/staging projects.

> ⚠️ **Server-side code uses `SUPABASE_SERVICE_ROLE_KEY`**, which bypasses RLS entirely. Authorization is enforced in route handler code (checks `auth.uid()` against `organizer_id`). Do not rely on RLS for server-side access control.

---

## Agent Environment

- **OS:** WSL2 (Ubuntu on Windows) — kernel 6.18.33.2-microsoft-standard-WSL2
- **Docker Desktop:** ✅ Enabled. `supabase start` (local Postgres + GoTrue via Docker Compose) is fully available.
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
| `supabase` | 2.109.0 | Database queries, migrations, project management | `supabase db query --linked "<sql>"` — run SQL against the linked Supabase project. Works without local Docker. Always use `--linked` for the production database. |
| `vercel` (via `npx vercel`) | 54.18.6 | Deployments, env vars, project config | `npx vercel --prod` — deploy to production. `npx vercel env ls` — list env vars. `npx vercel env pull .env.vercel` — pull production env vars (secrets appear empty locally but are set at runtime). |
| `npm` | 11.16.0 | Package management, running scripts | `npm test` — run the test suite via Vitest (from `ticket-app/`). `npm run build` — build for production. `npx vitest run tests/path/to/file.test.ts` — run a specific test file. |
| `git` | 2.53.0 | Version control | Single repo, one remote (`origin → github.com/olavostauros/ticket`). Run `git` commands from the root `ticket/` directory. |
| `curl` | 8.18.0 | API testing | `curl https://ticket-app-beta-silk.vercel.app/api/...` |
| `npx skills` | — | Install/extend agent skills | `npx skills add <owner/repo@skill> -g -y` |

### Key CLI workflows

```bash
# Local dev server (first-time: cp -n .env.local.example .env.local)
cd /home/stauros-ticket/ticket/ticket-app && npm run dev

# Start local Supabase (optional — uses Docker)
cd /home/stauros-ticket/ticket/ticket-database && supabase start

# Run all tests (via Vitest)
cd /home/stauros-ticket/ticket/ticket-app && npm test

# Run a specific test file
cd /home/stauros-ticket/ticket/ticket-app && npx vitest run tests/path/to/file.test.ts

# Query production DB
cd /home/stauros-ticket/ticket/ticket-database
supabase db query --linked "SELECT * FROM organizers;"

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

## Available Skills

Skills are installable packages that extend the agent's capabilities. They live in `/home/stauros-ticket/.pi/agent/skills/` and are symlinked from `.agents/skills/`.

| Skill | Description | When to use |
|---|---|---|
| `find-skills` | Discover and install skills from the open agent skills ecosystem. | User asks "how do I do X" or "is there a skill for X" |
| `grill-me` | A relentless interview to sharpen a plan or design. Invoked via the `/grilling` command or "grill" verb. | When a plan or design needs stress-testing — use the "grill" verb on a plan file. |
| `grilling` | Sequential, one-question-at-a-time interrogation of a design tree. | When you want a more methodical walkthrough than `grill-me`. |
| `supabase` | Specialized knowledge for all Supabase tasks (DB, Auth, Storage, RLS, Edge Functions). | Any Supabase-related task. |

To install a new skill globally:
```bash
npx skills add <owner/repo@skill> -g -y
```

## Workflow Loop

When working on a task, follow this sequence:

1. **Read the docs first.** Read `MISSION.md` and `SPECIFICATIONS.md` to understand context before touching code.

2. **Load the relevant skill.** If the task involves Supabase, load the `supabase` skill at `.agents/skills/supabase/SKILL.md` before proceeding. The skill contains critical security guidance, CLI gotchas, and RLS best practices specific to this project.

3. **Determine the repo.** Figure out which repo the task lives in:
   - `ticket-agent/` — docs, specs, plans
   - `ticket-app/` — code (Next.js, components, API routes, tests)
   - `ticket-database/` — schema migrations, Supabase config

4. **Propose a plan** before writing significant code. Show the approach and get confirmation. Prefer MVP-first approaches (ship working feature with fewer dependencies; hardcode values until a second use case demands configurability).

5. **Write tests alongside implementation** (in `ticket-app/tests/`).

6. **Run the test suite** before marking work complete:
   ```bash
   cd /home/stauros-ticket/ticket/ticket-app && npx vitest run
   ```

7. **Commit and push.** Make small, focused commits. Use imperative mood in messages, prefixed by scope: `[ticket-app]: Add fee calculation to checkout handler`. Push after every 1–3 commits.

8. **Update specs when requirements change.** When code and docs disagree, the code wins — update the relevant file to match reality.

## Prohibited

- Do not write placeholder or stub code without flagging it.
- Do not create files, directories, or config entries that correspond to unimplemented features.
- Do not commit generated boilerplate without review.
- Do not ignore failing tests.
- Do not hardcode secrets or configuration that varies by environment.
- Do not expose Supabase `service_role` key or organizer PIX keys client-side.
- Do not store sensitive data (PIX keys, refund IDs) in places readable by client-side code.