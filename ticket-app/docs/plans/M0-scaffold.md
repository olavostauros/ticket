# Milestone 0: Scaffold & Foundation

**Goal:** A working Next.js project that boots, connects to Supabase, has the full database schema applied, and is ready for development.

## Step-by-step

### 0.1 — Initialize the Next.js project

```bash
cd /home/ticket
npx create-next-app@latest ticket --typescript --app --eslint --src-dir --import-alias "@/*" --use-npm
```

Wait — we're already inside `/home/ticket`. Create the project **in a subdirectory** or scaffold manually. Since we can't nuke the parent, do:

```bash
cd /home/ticket
npx create-next-app@latest . --typescript --app --eslint --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

If `create-next-app` refuses because the directory is non-empty, scaffold manually:

```bash
npm init -y
npm install next@latest react@latest react-dom@latest
npm install -D typescript @types/node @types/react @types/react-dom eslint eslint-config-next
```

Then create the minimal file tree:

```
src/app/layout.tsx        — root layout
src/app/page.tsx           — landing page
tsconfig.json              — TypeScript config
next.config.ts             — Next.js config
.eslintrc.json             — ESLint config
```

Files are created in step 0.4 below.

### 0.2 — Install core dependencies

```bash
npm install @supabase/supabase-js zod nanoid@^5 uuid
npm install -D @types/uuid vitest @testing-library/react @testing-library/jest-dom
```

- `@supabase/supabase-js` — Supabase client (works with PostgreSQL REST + Auth)
- `zod` — input validation for all API routes
- `nanoid` — short ID generation (order references, slugs)
- `uuid` — UUID v4 for idempotency keys
- `vitest` — unit/integration test runner (faster than Jest, compatible)

### 0.3 — Configure TypeScript

**`tsconfig.json`** — standard Next.js config with path alias `@/*` mapping to `src/*`.

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 0.4 — Create minimal app files

**`src/app/layout.tsx`**
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ticket — Event Ticketing",
  description: "Sell tickets to your events",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
```

**`src/app/page.tsx`**
```tsx
export default function Home() {
  return (
    <main>
      <h1>Ticket</h1>
      <p>Event ticketing platform.</p>
    </main>
  );
}
```

**`src/app/globals.css`**
```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; }
```

### 0.5 — Set up Supabase client

**`src/lib/supabase.ts`**
```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
```

Create a **public** (anon-key) client for client-side auth:

**`src/lib/supabase-browser.ts`**
```typescript
import { createBrowserClient } from "@supabase/ssr";

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
```

Install `@supabase/ssr`:
```bash
npm install @supabase/ssr
```

### 0.6 — Environment variables

**`.env.local`** (add to `.gitignore`)
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key-here
SUPABASE_SERVICE_ROLE_KEY=service-role-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- `NEXT_PUBLIC_SUPABASE_URL` — from Supabase project dashboard → Settings → API
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public anon key from same page
- `SUPABASE_SERVICE_ROLE_KEY` — secret key from same page (never expose to client)
- `NEXT_PUBLIC_APP_URL` — used for redirect URLs in checkout flow

**`.env.example`** — copy of `.env.local` with placeholder values, committed to git.

### 0.7 — Database migration

Create **`supabase/migrations/00001_initial_schema.sql`** with the full schema from SPECIFICATIONS.md §4.3.

Run against the Supabase project:
```bash
# Via Supabase CLI (preferred)
npx supabase link --project-ref <project-id>
npx supabase migration up

# Or paste directly into Supabase SQL editor
```

The migration creates all tables and indexes listed in SPECIFICATIONS.md §4.3.

> **Note:** If you don't have the Supabase CLI set up, you can run the SQL directly in the Supabase dashboard SQL editor. The Supabase CLI is optional for MVP.

### 0.8 — Set up Vitest

**`vitest.config.ts`**
```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

**`package.json`** — add test script:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

### 0.9 — Git setup

```bash
git init
echo "node_modules/\n.next/\n.env.local\n*.log" > .gitignore
git add -A
git commit -m "scaffold: Next.js + Supabase + Vitest"
```

### 0.10 — Verify

1. Run `npm run dev` — app loads at `http://localhost:3000`
2. Run `npm test` — test runner boots (zero tests, exits clean)
3. Confirm `NEXT_PUBLIC_SUPABASE_URL` in browser devtools (/api/env debug endpoint optional)
4. Confirm the SQL migration ran (check Supabase dashboard → tables exist)

## Files created / modified

| File | Type |
|---|---|
| `src/app/layout.tsx` | create |
| `src/app/page.tsx` | create |
| `src/app/globals.css` | create |
| `src/lib/supabase.ts` | create |
| `src/lib/supabase-browser.ts` | create |
| `src/lib/constants.ts` | create (platform fee constants) |
| `tsconfig.json` | create |
| `next.config.ts` | create |
| `vitest.config.ts` | create |
| `.env.local` | create (gitignored) |
| `.env.example` | create |
| `.gitignore` | create |
| `supabase/migrations/00001_initial_schema.sql` | create |
| `package.json` | modify (scripts) |

## Verification checklist

- [ ] `npm run dev` starts without errors
- [ ] `npm test` runs (zero tests, no failures)
- [ ] `npm run build` succeeds
- [ ] Supabase connection works (can query `organizers` table from server)
- [ ] All 8 tables exist in Supabase
- [ ] Indexes are created
- [ ] `pending_jobs` table exists with correct schema
- [ ] `git status` shows clean, `.env.local` is gitignored
