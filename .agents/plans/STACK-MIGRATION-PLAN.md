# Stack Migration Plan: Next.js 16 → Astro Build + React Islands + Bun

**Date:** 2026-07-01
**Author:** Ticket (solo developer)
**Status:** In progress — ticket-app/ deleted, migration is one-way

## Migration overview

| Component | Before | After |
|---|---|---|
| **Framework** | Next.js 16 (App Router) | ✅ Astro Build 7 (SSR with `@astrojs/node`) |
| **Runtime** | Node.js (via nvm) | ✅ Bun 1.x |
| **Database** | Supabase (PostgreSQL) | ✅ Plain PostgreSQL via `pg` |
| **Auth** | Supabase Auth | ✅ Direct JWT (jsonwebtoken) + bcrypt |
| **API Routes** | `app/api/.../route.ts` | ✅ `src/pages/api/.../[param].ts` (12/17 migrated) |
| **Styling** | Inline `style={{}}` objects | ✅ Same inline styles (Tailwind ad-hoc later) |
| **Pages** | React Server Components | ⏳ `.astro` shells + React islands (not started) |
| **Layouts** | `app/layout.tsx` | ⏳ `src/layouts/BaseLayout.astro` (not started) |
| **Interactive islands** | Next.js client components | ⏳ React `.tsx` with `client:load` (not started) |
| **Tests** | Mixed Vitest + Testing Library | ⏳ API route tests + React island tests (not started) |
| **Deployment** | Vercel | ⏳ Docker + self-hosted |

### Key decisions

- **API-first** — migrated API routes first. Pages come next.
- **React via `@astrojs/react`** — interactive islands keep `.tsx` format. Presentational components render as static HTML in `.astro` shells.
- **No browser database client** — all data fetching in `.astro` frontmatter; pass data as props to React islands.
- **No Tailwind CSS** — keep existing inline styles.
- **`next/navigation` hooks** → `window.location.href` for redirects + props passed from `.astro` frontmatter for URL params.
- **`@/` alias does not work** with Astro 7's Rolldown bundler. All imports use relative paths.
- **No pgbouncer** — single direct PostgreSQL connection.

---

## Current directory structure

```
ticket/
├── src/
│   ├── pages/
│   │   ├── api/                    ← 12 API route files (migrated)
│   │   │   ├── auth/               ← login, signup, logout, me
│   │   │   ├── events/             ← list, create, [slug], tiers, publish, cancel, checkins
│   │   │   ├── tickets/
│   │   │   ├── orders/
│   │   │   └── admin/
│   │   └── index.astro             ← placeholder
│   ├── lib/                        ← all pure services (migrated)
│   │   ├── db.ts                   ← pg Pool
│   │   ├── auth.ts                 ← JWT verify/sign, getAuthUser, requireAuth
│   │   ├── password.ts             ← bcrypt hash/verify
│   │   ├── api-utils.ts            ← ok(), err() returning plain Response
│   │   ├── env.ts                  ← validateEnv() function
│   │   └── ...                     ← constants, fees, format, types, utils, validation, email, abacatepay, rate-limit
│   ├── components/                 ← empty (React islands go here)
│   ├── layouts/                    ← empty (Astro layouts go here)
│   └── tests/                      ← empty (test files go here)
├── public/                         ← empty
├── astro.config.ts                 ← @astrojs/node + @astrojs/react
├── tsconfig.json                   ← strict
├── package.json                    ← scripts: dev, build, start, test
├── .env.local                      ← DB, JWT, AbacatePay, Resend, APP_URL
└── .agents/                        ← mission, specs, plans
```

---

## Phase 1: Core Services ✅ (Complete)

All pure TypeScript modules migrated from `ticket-app/lib/` to `src/lib/`:

| Module | Status | Notes |
|---|---|---|
| `abacatepay.ts` | ✅ | Pure HTTP + crypto |
| `api-utils.ts` | ✅ | Rewritten — plain `Response`, no `NextResponse` |
| `auth.ts` | ✅ | JWT sign/verify, getAuthUser, requireAuth |
| `constants.ts` | ✅ | Pure constants |
| `db.ts` | ✅ | pg Pool wrapper |
| `email.ts` | ✅ | Pure Resend client |
| `email-templates.ts` | ✅ | Pure string templates |
| `env.ts` | ✅ | Exported `validateEnv()` function |
| `fees.ts` | ✅ | Pure calculation |
| `format.ts` | ✅ | Pure formatting |
| `password.ts` | ✅ | bcrypt hash/verify |
| `rate-limit.ts` | ✅ | Refactored — uses plain `Response` |
| `types.ts` | ✅ | Shared types |
| `utils.ts` | ✅ | Pure utilities |
| `validation.ts` | ✅ | Zod schemas |

Supabase dependency eliminated — replaced with `pg` (database), `jsonwebtoken` (auth), `bcryptjs` (password).

---

## Phase 2: API Routes 🔄 (12/17 migrated)

### Migrated ✅

| Route | File | Handlers |
|---|---|---|
| Auth — Login | `src/pages/api/auth/login.ts` | POST (cookie set) |
| Auth — Signup | `src/pages/api/auth/signup.ts` | POST (cookie set) |
| Auth — Logout | `src/pages/api/auth/logout.ts` | POST (cookie clear) |
| Auth — Me | `src/pages/api/auth/me.ts` | GET, PATCH |
| Events — List/Create | `src/pages/api/events.ts` | POST |
| Events — Single | `src/pages/api/events/[slug].ts` | GET, PATCH, DELETE |
| Events — Tiers | `src/pages/api/events/[slug]/tiers.ts` | POST |
| Events — Publish | `src/pages/api/events/[slug]/publish.ts` | POST |
| Events — Cancel | `src/pages/api/events/[slug]/cancel.ts` | POST |
| Events — Checkins | `src/pages/api/events/[slug]/checkins.ts` | GET |
| Tickets — Lookup | `src/pages/api/tickets/[unique_code].ts` | GET |
| Orders — Lookup | `src/pages/api/orders/lookup.ts` | POST |
| Admin — Delete | `src/pages/api/admin/delete-attendee-data.ts` | POST |

### All 17 routes migrated ✅

| Route | File | Handlers |
|---|---|---|
| Auth — Login | `src/pages/api/auth/login.ts` | POST (cookie) ✅ |
| Auth — Signup | `src/pages/api/auth/signup.ts` | POST (cookie) ✅ |
| Auth — Logout | `src/pages/api/auth/logout.ts` | POST (cookie clear) ✅ |
| Auth — Me | `src/pages/api/auth/me.ts` | GET, PATCH ✅ |
| Events — List/Create | `src/pages/api/events.ts` | POST ✅ |
| Events — Single | `src/pages/api/events/[slug].ts` | GET, PATCH, DELETE ✅ |
| Events — Tiers | `src/pages/api/events/[slug]/tiers.ts` | POST ✅ |
| Events — Publish | `src/pages/api/events/[slug]/publish.ts` | POST ✅ |
| Events — Cancel | `src/pages/api/events/[slug]/cancel.ts` | POST ✅ |
| Events — Checkins | `src/pages/api/events/[slug]/checkins.ts` | GET ✅ |
| Checkout | `src/pages/api/checkout.ts` | POST ✅ |
| Check-in | `src/pages/api/checkin.ts` | POST ✅ |
| Upload | `src/pages/api/upload.ts` | POST ✅ |
| Tickets — Lookup | `src/pages/api/tickets/[unique_code].ts` | GET ✅ |
| Orders — Lookup | `src/pages/api/orders/lookup.ts` | POST ✅ |
| Webhooks — AbacatePay | `src/pages/api/webhooks/abacatepay.ts` | POST ✅ |
| Cron — Process Jobs | `src/pages/api/cron/process-jobs.ts` | POST ✅ |
| Admin — Delete | `src/pages/api/admin/delete-attendee-data.ts` | POST ✅ |

---

## Phase 3: Pages ⏳ (Not started)

All 20+ pages need to be created as `.astro` files. Priority order:

### Layouts (create first)
- `src/layouts/BaseLayout.astro` — shared HTML shell
- `src/layouts/DashboardLayout.astro` — dashboard shell with `requireAuth`

### Public pages
- `src/pages/index.astro` — landing page
- `src/pages/404.astro`
- `src/pages/500.astro`
- `src/pages/privacy.astro` — LGPD privacy policy
- `src/pages/events/[slug].astro` — public event page (SSR)
- `src/pages/tickets/[code].astro` — ticket lookup page (SSR)
- `src/pages/order/[ref]/success.astro` — order success page (SSR)

### Auth pages (React islands)
- `src/pages/login.astro` + `src/components/LoginForm.tsx`
- `src/pages/signup.astro` + `src/components/SignupForm.tsx`

### Dashboard pages (React islands)
- `src/pages/dashboard/index.astro` + dashboard React component
- `src/pages/dashboard/profile.astro`
- `src/pages/dashboard/events/index.astro` — events list
- `src/pages/dashboard/events/new.astro` + `CreateEventForm`
- `src/pages/dashboard/events/[slug].astro` — edit event
- `src/pages/dashboard/events/[slug]/dashboard.astro` — sales dashboard
- `src/pages/dashboard/events/[slug]/checkin.astro` + `CheckinClient`

### Checkout flow (React islands)
- `src/pages/checkout/index.astro` + `CheckoutForm`
- `src/pages/my-tickets/index.astro`

---

## Phase 4: Tests ⏳ (Not started)

- Create `src/tests/setup.ts` with env vars
- Create `vitest.config.ts`
- API route tests (mock db or use real test db)
- React island tests (keep `@testing-library/react`)
- Pure logic tests (fees, utils, validation — copy from old)

---

## Phase 5: Docker & Deployment ⏳ (Not started)

- Create `Dockerfile` (oven/bun multi-stage build)
- Create `docker-compose.yml` (app + postgres)

---

## Risk mitigation

| Risk | Mitigation |
|---|---|
| **Checkout/Webhook routes missing** | Must create these before the app works end-to-end |
| **Database schema doesn't match queries** | Verify table/column names match what queries expect |
| **File upload needs storage backend** | Use local filesystem for MVP (was Supabase Storage) |
| **Process-jobs queue not running** | Create the route + a systemd timer or simple in-process scheduler |
| **React islands need old component code** | Old components were in ticket-app/ — must be rewritten from memory/old patterns |

## Rollback

⚠️ **Not possible.** `ticket-app/` has been deleted. Forward only from here.