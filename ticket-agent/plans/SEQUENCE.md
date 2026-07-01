# Execution Sequence — Plans Ordering for the Agent

This file defines the **strict order** in which an agent must execute the plans in `plans/`. Each plan has dependencies on the ones before it.

---

## Execution Order

```
Phase 1: P0 — Launch Blockers (build + test)
──────────────────────────────────────────────

  Step 1  →  PLAN-purchase-ui-flow.md
              No dependencies. Creates the "Comprar" button,
              checkout page, and order success page.

  Step 2  →  PLAN-apply-rls-migration.md
              No code dependencies. Applies the DENY-ALL RLS
              migration to the production Supabase project.

  Step 3  →  PLAN-db-rpc-tests.md
              Needs the DB schema to exist (already does).
              Tests create_order_atomic, process_paid_order_atomic,
              void_order_atomic, checkin_ticket against real Postgres.

  Step 4  →  PLAN-overselling-concurrency.md
              Depends on: Step 3 (DB RPC infra set up).
              Concurrent checkout stress test using the RPCs.

  Step 5  →  PLAN-e2e-happy-path.md
              Depends on: Step 1 (purchase UI exists for the full
              lifecycle test). Also benefits from Steps 3–4 (RPC
              confidence) but can run independently with mocks.


Phase 2: P1 — Should Have (test coverage)
──────────────────────────────────────────────

  Step 6  →  PLAN-route-edge-cases.md
              Depends on: Step 1 (some edge cases test routes
              that interact with the new purchase flow).
              Adds ~30 missing test cases.

  Step 7  →  PLAN-webhook-idempotency.md
              Depends on: Step 3 (DB RPC tests confirm the
              underlying functions handle idempotency correctly).
              Tests duplicate webhook delivery + race conditions.

  Step 8  →  PLAN-frontend-smoke-tests.md
              Depends on: Step 1 (purchase UI pages must exist
              to be tested). All 13 pages rendered with mock data.


Phase 3: P2 — Go/No-Go Gate
──────────────────────────────────────────────

  Step 9  →  PLAN-production-readiness.md
              Depends on: Steps 1–8 (everything must be implemented
              and passing before launch). Runs the 25-step QA
              script and checks all production configs.


Phase 4: Post-Launch
──────────────────────────────────────────────

  Step 10 →  PLAN-post-launch.md
              Depends on: Step 9 (only after MVP gate is passed).
              Week 1–2 short-term wins, Week 3–4 growth features,
              and ongoing technical debt.
```

---

## Dependency Graph

```
Step 1 (purchase UI) ───────────────┐
                                    ├── Step 5 (E2E test) ───┐
Step 2 (RLS migration) ─────────────┤                        │
                                    │                        │
Step 3 (DB RPC tests) ───┬─────────┤                        │
                         │         │                        │
                         ├── Step 4 (overselling)           │
                         │                                  │
                         ├── Step 7 (webhook idempotency)   │
                                                            │
                               Step 6 (route edge cases) ───┤
                                                            │
                               Step 8 (frontend tests) ─────┤
                                                            │
                                              Step 9 (prod readiness)
                                                            │
                                              Step 10 (post-launch)
```

---

## What to Do When a Step Fails

| Scenario | Action |
|----------|--------|
| Step N fails tests | Fix the code, re-run Step N's tests, then proceed to Step N+1 |
| Step N reveals a bug in Step N-1 | Fix the bug in Step N-1's code, re-run Step N-1 tests, re-run Step N tests |
| Step N is blocked waiting for external dependency (e.g., AbacatePay sandbox config) | Note the blocker, skip to the next independent Step, come back later |
| Step N's tests pass but feel incomplete | Add more tests to Step N's test file before proceeding |

---

## Running the Full Suite After Each Step

After each step completes, run:

```bash
cd /home/stauros-ticket/ticket/ticket-app && npm test
```

This ensures no regressions were introduced. All 193+ existing tests must still pass after every change.

---

## Quick Reference: File Locations

| Plan File | Code Changes In | Test Files |
|-----------|-----------------|------------|
| `PLAN-purchase-ui-flow` | `ticket-app/app/events/[slug]/page.tsx` + new: `app/checkout/`, `app/order/[ref]/success/` | — |
| `PLAN-apply-rls-migration` | `ticket-database/` (migration push) | — |
| `PLAN-db-rpc-tests` | — | `ticket-app/tests/db/` (new) |
| `PLAN-overselling-concurrency` | — | `ticket-app/tests/e2e/overselling.test.ts` (new) |
| `PLAN-e2e-happy-path` | — | `ticket-app/tests/e2e/happy-path.test.ts` (new) |
| `PLAN-route-edge-cases` | — | `ticket-app/tests/api/*.test.ts` (modify) + `tests/api/admin.test.ts` (new) |
| `PLAN-webhook-idempotency` | — | `ticket-app/tests/api/checkout.test.ts` (modify) |
| `PLAN-frontend-smoke-tests` | — | `ticket-app/tests/pages/*.test.tsx` (new) |
| `PLAN-production-readiness` | Env vars, configs | Manual QA only |
| `PLAN-post-launch` | Various across `ticket-app` and `ticket-database` | — |