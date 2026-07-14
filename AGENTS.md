# Ticket — Agent Guide

This file is the entry point for coding agents and AI agent harnesses working on the **Ticket** project.

## Agent Context Directory

All agent-facing documentation lives under:

```
~/ticket/.agents/
```

## Key Files

| File | Purpose |
|---|---|
| [MISSION.md](.agents/MISSION.md) | Core mission and purpose of the Ticket platform |
| [MVP.md](.agents/MVP.md) | Minimal viable product scope and roadmap |
| [DEPLOY.md](.agents/DEPLOY.md) | Deployment instructions for local, Docker, and Cloudflare 
| [TESTS.md](.agents/TESTS.md) | Test guidelines, conventions, and test tier system |

## How to Use

1. **Start here** — read this file to understand where agent context is stored.
2. **Read [MISSION.md](.agents/MISSION.md)** — understand the overarching goals of the project (ticket sales, liquidity, support).
3. **Read [MVP.md](.agents/MVP.md)** — understand the current free/no-payments scope and what is being built first.
4. **Read [DEPLOY.md](.agents/DEPLOY.md)** — understand how to build, deploy, and run the project locally or in production.
5. **Read [TESTS.md](.agents/TESTS.md)** — understand the testing strategy, tiers, mocking conventions, and fixtures before writing or modifying tests.
6. **All edits, feature work, and decisions** should align with the mission and stay within the MVP scope unless explicitly directed otherwise.

## Agent Harness Instructions

- Agent harnesses (e.g., pi, Copilot, Cursor, Claude Code) should load `~/ticket/.agents/` as a context directory.
- When proposing changes, reference the relevant section of MISSION.md, MVP.md, or TESTS.md.
- If a user request conflicts with the MVP scope (e.g., adding payment processing), flag it as out-of-scope per MVP.md unless the user explicitly overrides.
