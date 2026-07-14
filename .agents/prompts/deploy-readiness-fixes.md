# Prompt: Fix Deploy Readiness + Remove Remaining Payment Dead Code

## Mission

Fix all deploy-readiness blockers identified in the [DEPLOY.md](../DEPLOY.md) evaluation and remove remaining payment-related dead code to align with the [free MVP scope](../MVP.md).

## Context

The codebase was evaluated for deploy readiness against DEPLOY.md and MVP.md. Findings revealed:

1. **Critical deploy infrastructure issues** — lockfile gitignored, dual configs, postbuild mismatch
2. **Remaining payment artifacts** — ABACATEPAY env vars, `pix_key` in types, `orders` table references

The previously existing payment files (abacatepay.ts, fees.ts, checkout routes, webhooks, etc.) have **already been removed**. The remaining work is targeted cleanup.

---

## Part 1: Fix Deploy Infrastructure

### 1.1 Remove `bun.lock` from `.gitignore`

**File:** `.gitignore`

The `bun.lock` entry must be removed so the lockfile is committed to the repository. The `Dockerfile` uses `bun install --frozen-lockfile` which requires a lockfile, and the CI workflow needs reproducible builds.

Remove this line from `.gitignore`:
```
bun.lock
```

Then generate and commit the lockfile:
```bash
cd /home/ticket-wsl/ticket
bun install
# bun.lock is now generated
```

### 1.2 Consolidate Astro Config — Keep Node Adapter as Default

**Files involved:**
- `astro.config.ts` — Node adapter (standalone mode), has `validateEnv()` + vite alias config
- `astro.config.mjs` — Cloudflare adapter, separate standalone config

There are two config files. Astro auto-detects one of them, making builds unpredictable. 

**Action:** Delete `astro.config.mjs`. The DEPLOY.md specifies Node adapter is the default for local/Docker development. When switching to Cloudflare, the adapter swap is documented as a manual step.

**Also fix:** `astro.config.ts` calls `validateEnv()` at module level—this will crash any Astro command if env vars are missing. Move it inside a function or guard it:

```ts
// Current (problematic):
import { validateEnv } from "./src/lib/env";
validateEnv();  // crashes on `astro check`, `astro dev` if .env.local missing

// Fixed:
// Only validate on build/start, not on every command
if (process.env.NODE_ENV !== "test") {
  // Inline or guard the validation
}
```

Better approach: move `validateEnv()` call into the `defineConfig` callback or use `process.argv` to check if it's a build/dev command.

### 1.3 Fix Postbuild Script

**File:** `package.json`

Current:
```json
"postbuild": "rm -rf dist/server/wrangler.json .wrangler && cp dist/server/entry.mjs dist/_worker.js && cp dist/server/virtual_astro_middleware.mjs dist/virtual_astro_middleware.mjs && rm -rf dist/chunks 2>/dev/null; mv dist/server/chunks dist/chunks",
```

This script assumes Node adapter output paths (`dist/server/entry.mjs`). Since the Node adapter is the default, this is fine **for local/Docker**. However, the script has `rm -rf dist/chunks` followed by `mv dist/server/chunks dist/chunks` which is fragile.

**Action:** Simplify the postbuild to only what's needed for the Node adapter. Keep it clean:

```json
"postbuild": "cp dist/server/entry.mjs dist/_worker.js"
```

Or remove the postbuild entirely for local/Docker and only add it back when switching to Cloudflare (as documented in DEPLOY.md).

### 1.4 Clean Up `.env.local.example` — Remove ABACATEPAY Vars

**File:** `.env.local.example`

Current (payment-related lines to remove):
```
# Payments — get from https://abacatepay.com
ABACATEPAY_API_KEY=apk_xxxxxxxxxxxx
ABACATEPAY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

**Action:** Remove these two lines and the comment above them. The MVP has no payments.

### 1.5 Fix CI/CD Workflow — Remove ABACATEPAY Placeholders

**File:** `.github/workflows/deploy.yml`

Current payment-related env vars in the build step:
```yaml
ABACATEPAY_API_KEY: placeholder
ABACATEPAY_WEBHOOK_SECRET: placeholder
```

**Action:** Remove these two lines from the build step.

### 1.6 Configure Cloudflare Bindings (Future Use)

**File:** `wrangler.toml`

The R2 bucket and Hyperdrive bindings are commented out. For Cloudflare deployment, they need to be uncommented with real IDs. This is a future task (out of MVP scope for now), but the file should be clean.

**Action:** No change needed now — the comments serve as documentation. The DEPLOY.md already instructs users to create resources and uncomment. This is fine.

---

## Part 2: Remove Remaining Payment Dead Code

### 2.1 Strip `pix_key` and `pix_key_type` from Types

**File:** `src/lib/types.ts`

Remove these from the `Organizer` interface:
```typescript
  pix_key: string | null;
  pix_key_type: PixKeyType | null;
```

Remove the `PixKeyType` type entirely:
```typescript
export type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";
```

### 2.2 Strip `pix_key` and `pix_key_type` from Validation

**File:** `src/lib/validation.ts`

Remove these from `updateProfileSchema`:
```typescript
  pix_key: z.string().max(100).optional(),
  pix_key_type: z.enum(["cpf", "cnpj", "email", "phone", "random"]).optional(),
```

### 2.3 Remove `pix_key` References from API Responses

**Action:** Search the codebase for remaining references to `pix_key` in API responses and remove them.

```bash
cd /home/ticket-wsl/ticket
rg 'pix_key' --files-with-matches
```

Update any API route or page that selects `pix_key` or `pix_key_type` from the database to exclude those columns.

### 2.4 Migrate `orders` Table References to `registrations`

The DB schema already uses a `registrations` table (free MVP). However, several files still reference the old `orders` table:

**Files to fix:**

| File | Issue | Fix |
|---|---|---|
| `src/pages/order/[ref]/success.astro` | Queries `orders` table, checks `status === "paid"` | Query `registrations` instead; remove "paid" status check (registrations use `confirmed`/`canceled`) |
| `src/pages/api/orders/lookup.ts` | Queries `orders` table | Migrate to query `registrations` table; rename route or keep as alias |
| `src/pages/api/admin/delete-attendee-data.ts` | Updates `orders` table | Migrate to update `registrations` and `tickets` tables |

**Specific fixes:**

**2.4.1 `src/pages/order/[ref]/success.astro`**
- Change `query("SELECT * FROM orders WHERE reference = $1", [ref])` to `query("SELECT * FROM registrations WHERE reference = $1", [ref])`
- Change `order.status === "paid" ? "✅ Pago" : "⏳ Pendente"` to `order.status === "confirmed" ? "✅ Confirmada" : "❌ Cancelada"`
- Change the conditional block from `order.status !== "paid"` to `order.status !== "confirmed"` and update the message text (free registration, no payment needed)
- Update variable names from `order` to `registration` for clarity

**2.4.2 `src/pages/api/orders/lookup.ts`**
- Migrate queries from `orders` to `registrations`
- Update column names (`attendee_email`, `reference`, `event_id` stay the same, but remove any price/amount columns)
- The route `/api/orders/lookup` can remain as-is or be renamed to `/api/registrations/lookup` — keeping backward compatibility is fine

**2.4.3 `src/pages/api/admin/delete-attendee-data.ts`**
- Change `orders` to `registrations` in the UPDATE queries
- The `attendee_email` and `attendee_name` columns exist in `registrations`, so the UPDATE logic stays the same

### 2.5 Update Test Fixtures

**File:** `src/tests/fixtures/index.ts`

Remove any test fixtures that create `orders` with payment data or set up `pix_key` on organizers. Ensure all test data uses `registrations` table with free-tier semantics.

**Action:** Search for `orders`, `pix_key`, `abacatepay`, `price_cents` in test files and remove/update as needed.

### 2.6 Update Smoke Tests

**File:** `src/tests/smoke.suite.ts`

The smoke test references `/order/REF123/success` — this route should still work after migration (it will query `registrations` instead of `orders`). Update any test assertions that check for "paid" status text.

### 2.7 Validate No Remaining Payment References

After all edits, confirm no payment artifacts remain:

```bash
cd /home/ticket-wsl/ticket

# These should return no results
rg 'abacatepay' --ignore-case --glob '!node_modules' --glob '!.git'
rg 'pix_key' --glob '!node_modules' --glob '!.git'
rg 'price_cents' --glob '!node_modules' --glob '!.git'
rg 'amount_cents' --glob '!node_modules' --glob '!.git'

# This should only return the orders table reference in migration (which is fine)
# or the routes we intentionally kept as migration points
rg 'FROM orders' --glob '!node_modules' --glob '!.git' --glob '!migrations'
```

---

## Part 3: Verify Everything Works

### 3.1 Build Check

```bash
cd /home/ticket-wsl/ticket
bun run build
```

Must complete without errors. The Node adapter build should produce `dist/server/entry.mjs`.

### 3.2 Test Suite

```bash
cd /home/ticket-wsl/ticket
bun run test
```

All tests must pass.

### 3.3 Verify No Import Errors

```bash
cd /home/ticket-wsl/ticket
# Check for any dangling imports to deleted modules
rg 'from.*abacatepay' --glob '!node_modules' --glob '!.git'
rg 'from.*fees' --glob '!node_modules' --glob '!.git'
rg 'from.*checkout' --glob '!node_modules' --glob '!.git' | grep -v 'pages/checkout'
```

### 3.4 Verify Docker Compose

```bash
cd /home/ticket-wsl/ticket
docker compose build app
```

Should build successfully. (Skip `docker compose up` unless database is running.)

---

## Definition of Done

1. ✅ `bun.lock` committed to repository (removed from `.gitignore`)
2. ✅ Single astro config (`astro.config.ts`) remains; `astro.config.mjs` deleted
3. ✅ Postbuild script simplified/cleaned
4. ✅ No ABACATEPAY references in `.env.local.example` or `.github/workflows/deploy.yml`
5. ✅ No `pix_key`, `pix_type`, or `PixKeyType` in types, validation, or API code
6. ✅ All `orders` table queries migrated to `registrations`
7. ✅ `src/pages/order/[ref]/success.astro` no longer references "paid" status
8. ✅ Test suite passes
9. ✅ Application builds successfully
10. ✅ No dangling imports to removed modules

---

## References

- [DEPLOY.md](../DEPLOY.md) — deployment instructions
- [MVP.md](../MVP.md) — free MVP scope (no payments)
- [remove-payment-dead-code.md](./remove-payment-dead-code.md) — previous cleanup prompt (most files already deleted)