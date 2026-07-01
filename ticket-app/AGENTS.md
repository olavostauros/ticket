# AGENTS.md — How This Workspace Is Structured

This file is the entry point for AI agents entering this workspace.  
It documents the **project split** and points to the canonical instructions in `ticket-agent/`.

---

## Two Directories, One Project

### `/home/stauros-ticket/ticket/` — The Codebase

This directory contains the **working source code**: the Next.js application, tests, config files, etc. This is where you run commands (`npm test`, `git commit`, etc.) and edit application code.

### `/home/stauros-ticket/ticket/ticket-agent/` — The Agent Brain

This is a **sibling directory** (not a sub-package or monorepo workspace). It holds all the documentation that describes **what** this project is, **why** it exists, **how** it works, and **how** to build it. It is the canonical source of truth for project knowledge.

**Never make edits inside `ticket-agent/`** — it is documentation only. All development work happens in the parent directory.

---

## Structure of `ticket-agent/`

```
ticket-agent/
├── AGENTS.md            — Instructions for AI agents (environment, skills, workflow, principles)
├── MISSION.md           — The "why" of the project, MVP gate criteria, out-of-scope items
├── SPECIFICATIONS.md    — Detailed functional & technical specs (data model, API, security)
├── UX.md                — UX/UI conventions (Portuguese for user-facing content, responsive design, components)
├── INFRA.md             — Infra & environment (tech stack, deployment, CI/CD, env vars, secrets)
├── ROADMAP.md           — Features planned after MVP (do not implement until MVP gate is passed)
├── docs/
│   ├── development.md   — Development setup & conventions
│   ├── testing.md       — Testing strategy & conventions
│   └── plans/           — Per-milestone implementation plans
│       ├── M0-scaffold.md
│       ├── M1-auth.md
│       ├── M2-events.md
│       ├── M3-checkout.md
│       ├── M4-tickets-email.md
│       ├── M5-checkin.md
│       ├── M5-grill-fixes.md
│       ├── M6-dashboard-polish.md
│       ├── M6-grill-fixes.md
│       └── M7-e2e-launch.md
```

### Key Files — Read These First

| File | What It Contains |
|---|---|
| [`ticket-agent/MISSION.md`](./ticket-agent/MISSION.md) | Project identity, success criteria, MVP gate, constraints |
| [`ticket-agent/SPECIFICATIONS.md`](./ticket-agent/SPECIFICATIONS.md) | Everything you need to know about the data model, API, checkout flow, security |
| [`ticket-agent/AGENTS.md`](./ticket-agent/AGENTS.md) | Agent-specific instructions (environment, skills, workflow, prohibited actions) |
| [`ticket-agent/UX.md`](./ticket-agent/UX.md) | UI conventions, language policy (PT-BR for users, EN for code), component library |
| [`ticket-agent/INFRA.md`](./ticket-agent/INFRA.md) | Tech stack, env vars, deployment, CI/CD, secrets rules |
| [`ticket-agent/ROADMAP.md`](./ticket-agent/ROADMAP.md) | Post-MVP features — **do not implement** until MVP gate is passed |

---

## First Steps for Any Agent

1. Read `ticket-agent/MISSION.md` to understand the project's purpose and MVP gate.
2. Read `ticket-agent/SPECIFICATIONS.md` for the full technical spec.
3. Read `ticket-agent/AGENTS.md` for environment setup, available skills, and workflow rules.
4. For UI work, read `ticket-agent/UX.md`.
5. For infra/deployment questions, read `ticket-agent/INFRA.md`.

---

## How to Use the Plans

Per-milestone plans in [`ticket-agent/docs/plans/`](./ticket-agent/docs/plans/) contain step-by-step implementation guides. They assume the **current state** of the codebase at the start of that milestone. Read the relevant plan when working on a specific milestone's remaining items.

---

## Quick Reference

- **Project:** Ticket — SaaS for selling tickets to events
- **Target market:** Brazil (Portuguese UI, BRL currency)
- **Tech stack:** Next.js + TypeScript + Supabase (PostgreSQL) + AbacatePay + Resend + Vercel
- **Current milestone:** M7 — E2E & Launch (see plans)
- **Code lives in:** `/home/stauros-ticket/ticket/`
- **Docs live in:** `/home/stauros-ticket/ticket/ticket-agent/`
