# Ticket Database

PostgreSQL schema for the Ticket event ticketing platform.

## Setup

1. Create a Supabase project in **southamerica-east1** (São Paulo)
2. Enable **email/password** auth provider
3. Create a **`event-covers`** Storage bucket (public)
4. Apply migrations in order:

```bash
# Using Supabase CLI
supabase migration up
```

Or apply each `.sql` file manually in the Supabase SQL Editor.

## Migrations

| File | What |
|------|------|
| `00001_initial_schema.sql` | All tables (organizers, events, tiers, orders, order_items, tickets, check_ins, pending_jobs) + indexes |
| `00002_functions.sql` | PostgreSQL functions for job processing and ticket management |
| `00003_atomic_checkout.sql` | Atomic checkout logic with row-level locking (`SELECT ... FOR UPDATE`) |

## Quick Apply

```bash
./scripts/apply-migrations.sh
```

## Schema Diagram

```
organizers ──→ events ──→ tiers
                        ──→ orders ──→ order_items ──→ tickets ──→ check_ins
                        ──→ pending_jobs
```

## Related Repositories

- **App:** [olavostauros/ticket-app](https://github.com/olavostauros/ticket-app) — Next.js frontend + API routes