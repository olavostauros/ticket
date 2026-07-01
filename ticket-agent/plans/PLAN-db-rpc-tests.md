# Plan: Database RPC Tests

> **Roadmap:** [#4 — Database RPC Tests](../ROADMAP.md#4-🧪-database-rpc-tests)
> **Priority:** P0 — Launch Blocker
> **Effort:** 2 days

---

## Goal

Test the 4 critical PostgreSQL RPC functions against a real PostgreSQL instance. These functions are the spine of the system — they handle all money- and ticket-integrity operations atomically. A bug here means lost money, oversold events, or broken check-ins.

---

## Functions to Test

| Function | Purpose | Risk if Broken |
|----------|---------|----------------|
| `create_order_atomic` | Locks tiers, checks capacity, creates order + order_items, increments `quantity_sold` | Overselling, partial orders |
| `process_paid_order_atomic` | Flips order to `paid`, generates tickets, enqueues confirmation email | Lost tickets, unpaid orders marked paid |
| `void_order_atomic` | Flips order to `lost`, decrements `quantity_sold` | Tickets stuck as pending, phantom capacity |
| `checkin_ticket` | Sets `checked_in_at`, inserts `check_ins` row, validates ticket | Double check-in, fake tickets admitted |

---

## Test Infrastructure

### Option A: Docker + Supabase CLI (recommended)

```bash
# Start local Supabase with the ticket-database schema
cd /home/stauros-ticket/ticket/ticket-database
supabase start          # starts Postgres + all services
supabase db push        # applies migrations
supabase db dump --linked | ...  # verify schema
```

Then connect in tests using the local connection string.

### Option B: Ephemeral PostgreSQL via test container

Use `@testcontainers/postgresql` to spin up a fresh Postgres for each test run:

```bash
npm install --save-dev @testcontainers/postgresql
```

```typescript
import { PostgreSqlContainer } from "@testcontainers/postgresql";

let container: StartedPostgreSqlContainer;
let supabase: SupabaseClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer()
    .withDatabase("ticket_test")
    .start();
  // Apply migrations to the container's Postgres
  const sql = fs.readFileSync("../ticket-database/supabase/migrations/00001_initial_schema.sql", "utf-8");
  const pool = new Pool({ connectionString: container.getConnectionUri() });
  await pool.query(sql);
  // ... apply 00002, 00003
  supabase = createClient(/* use container URL */);
});
```

**Decision: Option A** — Simpler, matches the existing development workflow. Tests expect a running `supabase start` instance (or `SUPABASE_TEST_URL` env var for CI).

### Test File Location

Create: `ticket-app/tests/db/`

| File | Purpose |
|------|---------|
| `tests/db/setup.ts` | Test DB lifecycle (seed, teardown helpers) |
| `tests/db/rpc-create-order.test.ts` | `create_order_atomic` tests |
| `tests/db/rpc-process-paid.test.ts` | `process_paid_order_atomic` tests |
| `tests/db/rpc-void-order.test.ts` | `void_order_atomic` tests |
| `tests/db/rpc-checkin.test.ts` | `checkin_ticket` tests |
| `tests/db/constraints.test.ts` | Unique/check constraint tests |

## `create_order_atomic` Test Matrix

### Happy Path

| # | Scenario | Arrange | Assert |
|---|----------|---------|--------|
| 1 | Single tier, single item | 1 tier, qty=1 | Order created, order_items has 1 row, tier.quantity_sold incremented by 1 |
| 2 | Single tier, multiple items | 1 tier, qty=3 | Order created, 3 order_items? Actually 1 order_item row with qty=3, quantity_sold += 3 |
| 3 | Multi-tier order | 2 tiers, qty=2 each | 2 order_item rows, each tier's quantity_sold += 2 |
| 4 | Idempotent replay (same key) | First: success. Replay: same key | Second call returns same order with `_idempotent: true`, no new rows |

### Error Cases

| # | Scenario | Arrange | Assert |
|---|----------|---------|--------|
| 5 | Insufficient capacity | tier has 2 remaining, request qty=3 | Transaction rolls back, quantity_sold unchanged |
| 6 | Zero-capacity tier | quantity_sold = quantity_total | Rolls back |
| 7 | Invalid tier_id | Non-existent UUID | Rolls back |
| 8 | Tier belongs to different event | tier_id from another event | Rolls back |
| 9 | Event is in `draft` status | Set event to draft | Rolls back |
| 10 | Event is `canceled` | Set event to canceled | Rolls back |

### Concurrency (run 10 times)

| # | Scenario | Arrange | Assert |
|---|----------|---------|--------|
| 11 | 10 concurrent requests, capacity=5 | Fire all at once | Exactly 5 succeed, 5 fail, quantity_sold=5 |

## `process_paid_order_atomic` Test Matrix

### Happy Path

| # | Scenario | Arrange | Assert |
|---|----------|---------|--------|
| 1 | Valid pending order | Order exists, status=pending | Order → paid, tickets generated (1 per qty), pending_jobs row created |
| 2 | Multi-item order generates correct tickets | Order with 2 items: tier A qty=3, tier B qty=2 | 5 tickets created, each with correct tier reference |

### Error / Idempotency

| # | Scenario | Arrange | Assert |
|---|----------|---------|--------|
| 3 | Already-paid order (idempotent) | Order status=paid | No-op, returns existing data with `_idempotent: true` |
| 4 | Unknown reference | Random string | Returns error |
| 5 | Order is `expired` | Set order status=expired | Rolls back or returns error |
| 6 | Order is `lost` | Set order status=lost | Rolls back or returns error |

## `void_order_atomic` Test Matrix

| # | Scenario | Arrange | Assert |
|---|----------|---------|--------|
| 1 | Void pending order | Order exists, status=pending | Order → lost, quantity_sold -= requested qty for each tier |
| 2 | Void already-voided order (idempotent) | Order status=lost | No-op, `_idempotent: true` |
| 3 | Void a paid order | Order status=paid | Rolls back — can't void paid orders |

## `checkin_ticket` Test Matrix

| # | Scenario | Arrange | Assert |
|---|----------|---------|--------|
| 1 | Never-checked-in ticket | Ticket exists, checked_in_at=null | check_ins row created, ticket.checked_in_at set |
| 2 | Already-checked-in ticket | Ticket has checked_in_at set | Rolls back or returns "already checked in" error |
| 3 | Non-existent ticket | Random UUID | Returns error |
| 4 | Mismatched event_id | Ticket belongs to different event | Returns error |

## Constraint Tests

| # | Constraint | Test | Expected |
|---|-----------|------|----------|
| 1 | `idempotency_key` UNIQUE on orders | Insert same key twice | Unique violation |
| 2 | `reference` UNIQUE on orders | Insert same reference twice | Unique violation |
| 3 | `unique_code` UNIQUE on tickets | Insert same code twice | Unique violation |
| 4 | `quantity_sold <= quantity_total` on tiers | Insert tier with quantity_sold=101, total=100 | Check constraint violation |
| 5 | `status` check on events | Insert event with status='invalid' | Check constraint violation |
| 6 | `status` check on orders | Insert order with status='invalid' | Check constraint violation |

---

## Files to Create

| File | Purpose |
|------|---------|
| `ticket-app/tests/db/setup.ts` | DB connection, seed helpers, teardown |
| `ticket-app/tests/db/rpc-create-order.test.ts` | create_order_atomic tests |
| `ticket-app/tests/db/rpc-process-paid.test.ts` | process_paid_order_atomic tests |
| `ticket-app/tests/db/rpc-void-order.test.ts` | void_order_atomic tests |
| `ticket-app/tests/db/rpc-checkin.test.ts` | checkin_ticket tests |
| `ticket-app/tests/db/constraints.test.ts` | Schema constraint tests |

---

## Running the Tests

```bash
# Start local Supabase (must be done once before running tests)
cd /home/stauros-ticket/ticket/ticket-database
supabase start

# Run DB tests
cd /home/stauros-ticket/ticket/ticket-app
npm run test:db    # runs vitest run tests/db
```

Add the script to `package.json` if not already present:

```json
{
  "scripts": {
    "test:db": "vitest run tests/db --reporter verbose"
  }
}
```

---

## CI Integration

For GitHub Actions, add a PostgreSQL service container to the CI workflow (see [TESTING_PLAN.md §9](../plan/TESTING_PLAN.md#9-ci-integration)):

```yaml
jobs:
  test:
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      # ... checkout, setup Node
      - name: Apply migrations
        run: |
          # Apply SQL files to the test Postgres
          PGPASSWORD=postgres psql -h localhost -U postgres -d postgres \
            -f ../ticket-database/supabase/migrations/00001_initial_schema.sql
          PGPASSWORD=postgres psql -h localhost -U postgres -d postgres \
            -f ../ticket-database/supabase/migrations/00002_functions.sql
          PGPASSWORD=postgres psql -h localhost -U postgres -d postgres \
            -f ../ticket-database/supabase/migrations/00003_atomic_checkout.sql
      - name: Run DB tests
        run: npm run test:db
        env:
          SUPABASE_TEST_URL: postgresql://postgres:postgres@localhost:5432/postgres
```