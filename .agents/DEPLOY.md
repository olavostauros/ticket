# Ticket — Deployment Guide

## Overview

Ticket supports two deployment modes:

| Mode | Infrastructure | Use Case |
|---|---|---|
| **Local / Docker** | Astro SSR (Node adapter) + PostgreSQL | Development, self-hosting |
| **Cloudflare Workers/Pages** | Astro SSR (Cloudflare adapter) + Neon (serverless Postgres) | Production / edge |

---

## 1. Prerequisites

- [Bun](https://bun.sh) installed
- Node.js 20+
- Docker & Docker Compose (for local mode)
- A [Cloudflare](https://cloudflare.com) account (for production mode)
- [wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed and authenticated (for CF mode)

---

## 2. Environment Variables

Copy the example env file:

```bash
cp .env.local.example .env.local
```

Then fill in the values. Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (local: `postgresql://postgres:postgres@localhost:5432/ticket`) |
| `JWT_SECRET` | Generate with `openssl rand -base64 32` |
| `RESEND_API_KEY` | From [Resend](https://resend.com) (optional during MVP) |
| `PUBLIC_APP_URL` | Public URL of the deployed app (e.g., `http://localhost:4321`) |

---

## 3. Local Development

```bash
# Install dependencies
bun install

# Start dev server with database
docker compose up -d db      # start Postgres
bun run dev                  # starts Astro on http://localhost:4321
```

The dev server supports HMR — edit files and see changes instantly.

### Database Migrations

Migrations are in `migrations/` and run automatically on first startup via `docker-entrypoint-initdb.d`. For manual runs:

```bash
# Via psql directly
psql "$DATABASE_URL" -f migrations/00001_initial_schema.sql
```

---

## 4. Docker Deployment (Local/Production)

```bash
# Build and run everything
docker compose up --build

# Or rebuild just the app
docker compose build app
docker compose up app
```

- App runs on port **4321** (mapped from container)
- Postgres runs on port **5432**
- Persistent data stored in Docker volume `pgdata`

To stop:

```bash
docker compose down
```

To wipe everything (data + volumes):

```bash
docker compose down -v
```

---

## 5. Cloudflare Workers/Pages Deployment

### 5.1 Switch to the Cloudflare adapter

The project currently uses `@astrojs/node` in `astro.config.ts`. For Cloudflare deployment, you must:

1. Install the Cloudflare adapter: `bun add @astrojs/cloudflare`
2. Update `astro.config.ts` to use the Cloudflare adapter instead of the Node adapter:

```ts
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",
  adapter: cloudflare({ mode: "directory" }),
  // ...
});
```

3. Ensure `wrangler.toml` has the correct `pages_build_output_dir = "dist"` (already set).

### 5.2 Create Cloudflare Resources (one-time)

```bash
# R2 bucket for uploads
npx wrangler r2 bucket create ticket-uploads

# KV namespace for rate limiting
npx wrangler kv namespace create RATE_LIMIT

# Hyperdrive for Neon connection
npx wrangler hyperdrive create ticket-neon --connection-string="$DATABASE_URL"

# Uncomment and add the IDs from the output into wrangler.toml
```

### 5.3 Set Secrets

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put PUBLIC_APP_URL
```

### 5.4 Deploy

```bash
# Build for Cloudflare
bun run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name ticket
```

The build command in `package.json` runs `astro build` + a postbuild step that copies the entry file to `dist/_worker.js` (the Cloudflare Pages worker entry point).

### 5.5 Cron Triggers

Configure Cron Triggers in the Cloudflare Dashboard under your Pages project > Settings > Cron Triggers:

| Cron | Endpoint | Purpose |
|---|---|---|
| `*/5 * * * *` | `POST /api/cron/process-jobs` | Process pending background jobs |

---

## 6. Testing

```bash
# Run all tests
bun run test

# Watch mode
bun run test:watch

# Smoke tests only
bun run test:smoke
```

---

## 7. Key Notes

- **The Node adapter is the default** for local dev / Docker. Switching to the Cloudflare adapter is only needed for edge deployment.
- **Cron auth**: Cloudflare Cron Triggers handle authentication internally. Local dev cron endpoints are unprotected.
- **Uploads**: Locally, uploaded images may be stored on disk. On Cloudflare, use the R2 bucket (`UPLOADS_BUCKET` binding).
- **Rate limiting**: Locally, rate limiting is disabled or in-memory. On Cloudflare, use the KV namespace (`RATE_LIMIT` binding).