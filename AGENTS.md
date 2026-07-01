# AGENTS.md — Workspace Routing & Agent Workflow

This file routes agents to the correct project directory and defines the operational loop for working on the Ticket codebase.

## Workspace Structure

```
ticket/
├── .agents/              ← Agent skills (grilling, find-skills)
├── skills-lock.json      ← Installed skills manifest (source of truth)
├── agent/               ← MISSION, SPECS, UX, docs, plans
├── ticket-app/           ← Next.js web application (frontend + API routes)
└── ticket-database/      ← Database migrations and config
```

## Where to go

| If you want to… | Go to… |
|---|---|
| Understand the project mission, specs, or conventions | [`agent/`](./agent/) |
| Read or edit the web app code (Next.js, components, API routes, tests) | [`ticket-app/`](./ticket-app/) |
| Work on database schema, migrations, or config | [`ticket-database/`](./ticket-database/) |

## Quick start

1. Read `agent/MISSION.md` for the project's purpose.
2. Read `agent/SPECIFICATIONS.md` for detailed functional and technical specs.
3. Set up local environment:
   ```bash
   cd ticket-app && cp -n .env.local.example .env.local
   ```
   Edit `.env.local` with your database URL, JWT secret, and API keys.
4. Run the app: `cd ticket-app && npm run dev`
5. Run tests: `cd ticket-app && npm test`

---

## Environment Architecture

Single environment running locally:

| Environment | Code runs at | DB |
|---|---|---|
| **Local dev** | `localhost:3000` | Local PostgreSQL (Docker container) |

> ⚠️ **Server-side code uses a direct database connection (`DATABASE_URL`)**. Authorization is enforced in route handler code (checks `auth.uid()` against `organizer_id`).

---

## Agent Environment

- **OS:** Ubuntu 26.04 — kernel 7.0.0-27-generic
- **Docker:** 29.6.1 — installed.
- **Shell:** Bash (default on this distro)
- **Node:** v24.18.0 (via nvm)
- **Pi agent:** `pi-coding-agent` installed globally (`@earendil-works/pi-coding-agent`)
- **Pi SDK/docs path:** `/home/olavostauros/.nvm/versions/node/v24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/`
- **Pi agent skills dir:** `/home/olavostauros/.pi/agent/skills/`
- **Skills CLI:** `npx skills` — manages installable agent skills from skills.sh ecosystem
- **Working dir:** `/home/olavostauros/code/ticket`

## CLI Tools at Disposal

| Tool | Version | Purpose | Common usage |
|---|---|---|---|
| `docker` | 29.6.1 | Container engine for local PostgreSQL + app | `docker compose up` — boot full stack. `docker ps` — list running containers. |
| `npm` | 11.16.0 | Package management, running scripts | `npm test` — run the test suite via Vitest (from `ticket-app/`). `npm run build` — build for production. `npx vitest run tests/path/to/file.test.ts` — run a specific test file. |
| `git` | 2.53.0 | Version control | Single repo, one remote (`origin → github.com/olavostauros/ticket`). Run `git` commands from the root `ticket/` directory. |
| `curl` | 8.18.0 | API testing | `curl http://localhost:3000/api/...` |
| `npx skills` | — | Install/extend agent skills | `npx skills add <owner/repo@skill> -g -y` |

### Key CLI workflows

```bash
# Boot full stack with Docker Compose
cd /home/olavostauros/code/ticket && docker compose up

# Local dev server (outside Docker, for hot reload)
cd /home/olavostauros/code/ticket/ticket-app && npm run dev

# Run database migrations
cd /home/olavostauros/code/ticket/ticket-database
psql $DATABASE_URL -f supabase/migrations/00001_initial_schema.sql

# Run all tests (via Vitest)
cd /home/olavostauros/code/ticket/ticket-app && npm test

# Run a specific test file
cd /home/olavostauros/code/ticket/ticket-app && npx vitest run tests/path/to/file.test.ts

# Query the local database
psql $DATABASE_URL -c "SELECT * FROM organizers;"

# Deploy (local build only)
cd /home/olavostauros/code/ticket && docker compose build
```

## Available Skills

Skills are installable packages that extend the agent's capabilities. They live in `/home/olavostauros/.pi/agent/skills/` and are symlinked from `.agents/skills/`.

| Skill | Description | When to use |
|---|---|---|
| `find-skills` | Discover and install skills from the open agent skills ecosystem. | User asks "how do I do X" or "is there a skill for X" |
| `grill-me` | A relentless interview to sharpen a plan or design. Invoked via the `/grilling` command or "grill" verb. | When a plan or design needs stress-testing — use the "grill" verb on a plan file. |
| `grilling` | Sequential, one-question-at-a-time interrogation of a design tree. | When you want a more methodical walkthrough than `grill-me`. |

To install a new skill globally:
```bash
npx skills add <owner/repo@skill> -g -y
```

## Workflow Loop

When working on a task, follow this sequence:

1. **Read the docs first.** Read `MISSION.md` and `SPECIFICATIONS.md` to understand context before touching code.

2. **Load the relevant skill** when appropriate. See the Available Skills table above.

3. **Determine the repo.** Figure out which repo the task lives in:
   - `agent/` — docs, specs, plans
   - `ticket-app/` — code (Next.js, components, API routes, tests)
   - `ticket-database/` — schema migrations, database config

4. **Propose a plan** before writing significant code. Show the approach and get confirmation. Prefer MVP-first approaches (ship working feature with fewer dependencies; hardcode values until a second use case demands configurability).

5. **Write tests alongside implementation** (in `ticket-app/tests/`).

6. **Run the test suite** before marking work complete:
   ```bash
   cd /home/olavostauros/code/ticket/ticket-app && npx vitest run
   ```

7. **Commit and push.** Make small, focused commits. Use imperative mood in messages, prefixed by scope: `[ticket-app]: Add fee calculation to checkout handler`. Push after every 1–3 commits.

8. **Update specs when requirements change.** When code and docs disagree, the code wins — update the relevant file to match reality.

## Prohibited

- Do not write placeholder or stub code without flagging it.
- Do not create files, directories, or config entries that correspond to unimplemented features.
- Do not commit generated boilerplate without review.
- Do not ignore failing tests.
- Do not hardcode secrets or configuration that varies by environment.
- Do not expose organizer PIX keys client-side.
- Do not store sensitive data (PIX keys, refund IDs) in places readable by client-side code.