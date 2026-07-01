# Local Development with Docker

This guide explains how to run the full Ticket stack locally using Docker.

## Prerequisites

- **Docker** v29+ with Docker Compose v5+
  ```bash
  docker --version
  docker compose version
  ```
- **Supabase CLI** (optional — for local Auth emulation)
  ```bash
  supabase --version
  ```

## Quick Start

The simplest way to run the app in development mode:

```bash
# Start PostgreSQL + Next.js app (with hot reload)
./scripts/up.sh

# Open http://localhost:3000
# The app hot-reloads on source changes
```

## What You Get

| Service | Container | URL |
|---------|-----------|-----|
| Next.js app (dev) | `ticket-app` | http://localhost:3000 |
| PostgreSQL 16 | `ticket-db` | postgres://ticket:REPLACED@localhost:5432/ticket_dev |

## Commands

```bash
# Start in background
docker compose up -d

# Rebuild the app image
docker compose build app

# Run tests inside the container
./scripts/up.sh --test

# Production mode (build + run)
./scripts/up.sh --prod

# View logs
docker compose logs -f

# Stop everything
docker compose down

# Stop and delete database data
docker compose down -v
```

## Configuration

Copy the example env file and configure your services:

```bash
cp .env.local.example .env
# Edit .env with your Supabase, Resend, AbacatePay keys
```

Docker Compose reads variables from the `.env` file automatically.

### Using Supabase Cloud

1. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   and `SUPABASE_SERVICE_ROLE_KEY` in `.env` from your Supabase project settings
2. Run `./scripts/up.sh`

### Using Local Supabase (Auth + DB)

For full offline development with auth:

```bash
# Start local Supabase (launches Docker containers for all Supabase services)
supabase start

# Copy the printed values into .env:
#   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase start output>
#   SUPABASE_SERVICE_ROLE_KEY=<from supabase start output>

# Apply database migrations via Supabase
supabase migration up

# Start the Ticket app
./scripts/up.sh
```

**Note:** The `supabase start` command and `docker compose up` can run side-by-side
because they use separate Docker networks. The Next.js app connects to Supabase
via `host.docker.internal:54321` (the Docker host's local Supabase).

## Database

The Docker Compose includes PostgreSQL for schema bootstrapping and direct database
access (e.g., running custom queries).

### Applying Migrations

Migrations are auto-applied on the first container start via the
`/docker-entrypoint-initdb.d/` mechanism. For subsequent changes:

```bash
# List pending migrations
docker compose exec app node scripts/migrate.mjs

# Print SQL for pending migrations
docker compose exec app node scripts/migrate.mjs --apply

# Connect to Postgres directly
docker compose exec db psql -U ticket -d ticket_dev
```

### Direct Connection

From the host machine:

```bash
psql postgres://ticket:REPLACED@localhost:5432/ticket_dev
```

## Running Tests

```bash
# Run tests inside the container
docker compose run --rm app npx vitest run

# Run tests with watch mode
docker compose run --rm app npx vitest
```

## Troubleshooting

### Hot Reload Not Working

If file changes aren't picked up, ensure `WATCHPACK_POLLING` and
`CHOKIDAR_USEPOLLING` are set in the docker-compose environment (they are by default).

### Port Conflicts

- **3000 in use**: Change the host port mapping in `docker-compose.yml`
  (`ports: "3001:3000"`)
- **5432 in use**: Change the host PG port mapping
  (`ports: "5433:5432"`)

### Permission Issues

If mounted files have wrong permissions inside the container, the Dockerfile
creates a `nextjs` user. For development mode (which runs as root), this isn't
an issue.