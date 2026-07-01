# Ticket — Event Ticketing SaaS

Multi-tenant SaaS platform for selling tickets to events. Built for the Brazilian market.

## Tech Stack

- **Frontend:** Next.js (React), TypeScript
- **Backend:** Next.js API routes (co-located)
- **Database:** PostgreSQL via Supabase
- **Auth:** Supabase Auth (email/password)
- **Payments:** AbacatePay
- **Email:** Resend
- **Storage:** Supabase Storage
- **Hosting:** Vercel

## Repositories

| Repo | Purpose |
|------|---------|
| `olavostauros/ticket-app` | Next.js app (this repo) — deployed to Vercel |
| `olavostauros/ticket-database` | PostgreSQL schema & migrations — applied to Supabase |

## Getting Started

```bash
# 1. Clone
git clone https://github.com/olavostauros/ticket-app.git
cd ticket-app

# 2. Install
npm install

# 3. Environment variables
cp .env.local.example .env.local
# Edit .env.local with your Supabase, AbacatePay, Resend keys

# 4. Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

See [`.env.local.example`](./.env.local.example) for all required variables.

## Running Tests

```bash
npm test         # run once
npm run test:watch  # watch mode
```

## Deployment

### App (Vercel)

Push to `main` — Vercel auto-deploys. Configure env vars in Vercel Dashboard.

### Database (Supabase)

Migrations live in the [`ticket-database`](https://github.com/olavostauros/ticket-database) repo. Apply via Supabase CLI.

## License

MIT