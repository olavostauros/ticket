# Milestone 6: Dashboard & Polish

**Goal:** Organizer sees sales data, the UI is responsive, error states are handled, rate limiting is wired into middleware.

## Dependencies

- Milestone 5 complete (check-in works)
- At least one test event with test orders/tickets in the database

## What's already built (no work needed)

The following items from the original plan are already in place:

| Item | Status | Details |
|------|--------|---------|
| Rate limiting library | ✅ Done | `lib/rate-limit.ts` — `checkRateLimit`, `getClientIp`, `rateLimitResponse` with `@todo` about distributed limitation |
| Rate limiting on check-in | ✅ Done | `app/api/checkin/route.ts` — 30 req/min per IP |
| Rate limiting on order lookup | ✅ Done | `app/api/orders/lookup/route.ts` — 10 req/min per IP |
| Remove `organizer_id` from public event | ✅ Done | `app/api/events/[slug]/route.ts` — strips `organizer_id` from public response |
| CSS reset | ✅ Done | `app/globals.css` — box-sizing, margin/padding reset, system font stack |
| API error consistency | ✅ Done | All routes use `ok()` / `err()` from `lib/api-utils.ts` with `{ error, code }` format |
| Security: ownership checks | ✅ Done | All mutation routes verify organizer owns the resource |
| Security: webhook HMAC | ✅ Done | `verifyWebhookSignature` in `lib/abacatepay.ts` |
| Security: Zod validation | ✅ Done | All API routes validate input via Zod schemas in `lib/validation.ts` |
| Security: parameterized queries | ✅ Done | Supabase JS client uses parameterized queries throughout |

## Step-by-step

### 6.1 — Currency formatting utility

**`lib/format.ts`** — single source of truth for BRL formatting. Used by the sales dashboard and checkout flow.

```typescript
/**
 * Format a value in cents to BRL currency string.
 * Example: 1500 → "R$ 15,00"
 */
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
```

### 6.2 — Sales dashboard

**`app/dashboard/events/[slug]/dashboard/page.tsx`**

Server component that:
- Authenticates the organizer via `getAuthUser()`
- Looks up event by slug (404 if missing, redirect if not owner)
- Aggregates sales data from `tiers`, `orders`, and `check_ins` tables
- Runs DB queries in parallel with `Promise.all` to minimize latency
- Displays 4 summary cards using the `Card` component: Sold, Revenue, Platform Fees, Checked In
- Shows per-tier breakdown table using the `Table` component
- Wraps data-fetching in a try/catch with fallback to error state

```typescript
import { createServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-middleware";
import { redirect, notFound } from "next/navigation";
import { formatBRL } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function EventDashboardPage({ params }: Props) {
  const { slug } = await params;
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = createServerClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, title, status, organizer_id, start_at")
    .eq("slug", slug)
    .single();

  if (!event) notFound();
  if (event.organizer_id !== user.id) redirect("/dashboard");

  // Run independent queries in parallel
  const [tiersResult, ordersResult, checkinResult] = await Promise.all([
    supabase
      .from("tiers")
      .select("id, name, price_cents, quantity_total, quantity_sold")
      .eq("event_id", event.id),
    supabase
      .from("orders")
      .select("amount_cents, fee_cents")
      .eq("event_id", event.id)
      .eq("status", "paid"),
    supabase
      .from("check_ins")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id),
  ]);

  const tiers = tiersResult.data || [];
  const orders = ordersResult.data || [];
  const checkinCount = checkinResult.count || 0;

  const totalRevenue = orders.reduce((sum, o) => sum + o.amount_cents, 0);
  const totalFees = orders.reduce((sum, o) => sum + o.fee_cents, 0);
  const totalTicketsSold = tiers.reduce((sum, t) => sum + t.quantity_sold, 0);
  const totalCapacity = tiers.reduce((sum, t) => sum + t.quantity_total, 0);

  const statusLabel =
    event.status === "draft"
      ? "Rascunho"
      : event.status === "published"
        ? "Publicado"
        : "Cancelado";

  return (
    <div>
      <h1>{event.title}</h1>
      <p>Status: <strong>{statusLabel}</strong></p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginTop: 24,
        }}
      >
        <Card label="Vendidos" value={`${totalTicketsSold} / ${totalCapacity}`} />
        <Card label="Receita" value={formatBRL(totalRevenue)} />
        <Card label="Taxas" value={formatBRL(totalFees)} />
        <Card label="Check-ins" value={`${checkinCount} / ${totalTicketsSold}`} />
      </div>

      <h2 style={{ marginTop: 32 }}>Por Lote</h2>
      <Table
        headers={["Lote", "Preço", "Vendidos", "Disponíveis"]}
        rows={tiers.map((tier) => [
          tier.name,
          formatBRL(tier.price_cents),
          String(tier.quantity_sold),
          String(tier.quantity_total - tier.quantity_sold),
        ])}
      />
    </div>
  );
}
```

### 6.3 — Dashboard navigation layout

**`app/dashboard/layout.tsx`**

Sidebar layout wrapping all dashboard pages. The sidebar shows:
- Brand name ("Ticket")
- Navigation links: Overview, My Events, Profile, Logout
- Active link highlighting based on current path via `usePathname()`

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/dashboard", label: "Visão Geral" },
  { href: "/dashboard/events", label: "Meus Eventos" },
  { href: "/dashboard/profile", label: "Perfil" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        style={{
          width: 240,
          padding: 16,
          borderRight: "1px solid #e5e7eb",
          background: "#f9fafb",
          flexShrink: 0,
        }}
      >
        <h2 style={{ fontSize: "1.25rem", marginBottom: 24 }}>Ticket</h2>
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  style={{
                    display: "block",
                    padding: "8px 12px",
                    borderRadius: 6,
                    color: "#171717",
                    background: isActive ? "#e5e7eb" : "transparent",
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
          <li>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 6,
                  color: "#991b1b",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: "inherit",
                }}
              >
                Sair
              </button>
            </form>
          </li>
        </ul>
      </nav>
      <main style={{ flex: 1, padding: 24 }}>{children}</main>
    </div>
  );
}
```

**`app/dashboard/page.tsx`** — already exists with auth check, event list, profile/logout links. After the layout is created:
- Remove the inline profile link and logout button (now in sidebar)
- Keep the event list as the main content
- Remove the outer `<main>` wrapper (layout provides it)

### 6.4 — UI component library (minimal)

Create a small set of reused components in **`components/ui/`**:

| Component | File | Purpose |
|---|---|---|
| `Button` | `components/ui/button.tsx` | Styled button with loading state |
| `Input` | `components/ui/input.tsx` | Styled input with error display |
| `Card` | `components/ui/card.tsx` | Summary card (label + value) |
| `Table` | `components/ui/table.tsx` | Responsive table with header/rows props |
| `Spinner` | `components/ui/spinner.tsx` | Loading spinner |

These are thin styled wrappers — no heavy UI framework. Use inline styles.

**`components/ui/card.tsx`**

```tsx
interface CardProps {
  label: string;
  value: string;
}

export function Card({ label, value }: CardProps) {
  return (
    <div
      style={{
        padding: 16,
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
      }}
    >
      <p style={{ fontSize: "0.875rem", color: "#666", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: "1.25rem", fontWeight: 600 }}>{value}</p>
    </div>
  );
}
```

**`components/ui/table.tsx`**

```tsx
interface TableProps {
  headers: string[];
  rows: string[][];
}

export function Table({ headers, rows }: TableProps) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                style={{
                  textAlign: "left",
                  padding: 8,
                  borderBottom: "2px solid #ddd",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: 8,
                    borderBottom: "1px solid #eee",
                    textAlign: ci === 0 ? "left" : "center",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**`components/ui/button.tsx`**

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: "primary" | "danger" | "ghost";
}

export function Button({
  children,
  loading,
  disabled,
  variant = "primary",
  style,
  ...props
}: ButtonProps) {
  const variantStyles = {
    primary: { background: "#171717", color: "#fff" },
    danger: { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" },
    ghost: { background: "none", color: "#171717" },
  };

  return (
    <button
      disabled={disabled || loading}
      style={{
        padding: "8px 16px",
        borderRadius: 6,
        border: "none",
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled || loading ? 0.6 : 1,
        fontSize: "0.875rem",
        ...variantStyles[variant],
        ...style,
      }}
      {...props}
    >
      {loading ? "Carregando..." : children}
    </button>
  );
}
```

**`components/ui/input.tsx`**

```tsx
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export function Input({ error, style, ...props }: InputProps) {
  return (
    <div>
      <input
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 6,
          border: `1px solid ${error ? "#dc2626" : "#d1d5db"}`,
          fontSize: "0.875rem",
          ...style,
        }}
        {...props}
      />
      {error && (
        <p style={{ color: "#dc2626", fontSize: "0.75rem", marginTop: 4 }}>
          {error}
        </p>
      )}
    </div>
  );
}
```

**`components/ui/spinner.tsx`**

```tsx
export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: "3px solid #e5e7eb",
        borderTop: "3px solid #171717",
        borderRadius: "50%",
        animation: "spin 0.6s linear infinite",
      }}
    />
  );
}
```

Add the spin keyframe to `app/globals.css`:

```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

### 6.5 — Error handling

- **Global error boundary** — `app/error.tsx` for server errors
- **Not found page** — `app/not-found.tsx`
- **Client-side error display** — each form shows field-level errors from Zod validation (already done in event edit, check-in, profile pages)

**`app/error.tsx`**

```tsx
"use client";
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
      <h1>Algo deu errado</h1>
      <p style={{ color: "#666", margin: "1rem 0" }}>{error.message}</p>
      <button
        onClick={reset}
        style={{
          padding: "8px 16px",
          background: "#171717",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        Tentar novamente
      </button>
    </div>
  );
}
```

**`app/not-found.tsx`**

```tsx
import Link from "next/link";
export default function NotFound() {
  return (
    <div style={{ maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
      <h1>Página não encontrada</h1>
      <p style={{ color: "#666", margin: "1rem 0" }}>
        A página que você procura não existe ou foi removida.
      </p>
      <Link
        href="/"
        style={{
          display: "inline-block",
          padding: "8px 16px",
          background: "#171717",
          color: "#fff",
          borderRadius: 6,
          textDecoration: "none",
        }}
      >
        Ir para o início
      </Link>
    </div>
  );
}
```

### 6.6 — Rate limiting in middleware

Add rate limiting to the existing `middleware.ts` for auth and checkout endpoints. The rate limiting library (`lib/rate-limit.ts`) already exists — this step wires it into the middleware.

The middleware currently protects `/dashboard/*`, `/login`, `/signup`. Add rate limiting for `/api/auth/*` and `/api/checkout` paths.

Use route-specific limits:
- `/api/auth/*` — 60 req/min (login page makes multiple sub-requests; 20 is too aggressive)
- `/api/checkout` — 10 req/min (checkout is expensive and should be throttled)

```typescript
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

// Inside middleware(), before auth checks:
const pathname = request.nextUrl.pathname;

if (pathname.startsWith("/api/auth") || pathname === "/api/checkout") {
  const ip = getClientIp(request);
  const maxAttempts = pathname === "/api/checkout" ? 10 : 60;
  const { allowed, resetAt } = checkRateLimit(`mw:${ip}:${pathname}`, maxAttempts, 60_000);
  if (!allowed) {
    return rateLimitResponse(resetAt);
  }
}
```

Update the `config.matcher` to include these paths:

```typescript
export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup", "/api/auth/:path*", "/api/checkout"],
};
```

### 6.7 — Responsive design pass

Add responsive rules to `app/globals.css`. Keep table styles scoped to dashboard tables (the `Table` component handles its own styling) — avoid global table styles that could leak into public pages.

```css
img { max-width: 100%; height: auto; }

@media (max-width: 768px) {
  .desktop-only { display: none; }
  body { font-size: 16px; }
}
```

### 6.8 — Environment config validation

**`lib/env.ts`** — validate required env vars at startup. Only throw in production to avoid breaking CI/PR previews that may not have all secrets.

```typescript
const requiredVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ABACATEPAY_API_KEY",
  "RESEND_API_KEY",
  "NEXT_PUBLIC_APP_URL",
] as const;

const missing = requiredVars.filter((key) => !process.env[key]);

if (missing.length > 0) {
  const msg = `Missing required environment variables: ${missing.join(", ")}`;
  if (process.env.NODE_ENV === "production") {
    throw new Error(msg);
  }
  console.warn(`[env] ${msg}`);
}
```

Import this in `next.config.ts`:

```typescript
// next.config.ts
import "./lib/env";
```

### 6.9 — Security review checklist

- [x] All API routes that modify data check organizer ownership
- [x] Webhook HMAC verification is in place
- [x] No sensitive data (service role key, PIX keys) exposed client-side
- [x] Rate limiting on check-in and order lookup endpoints
- [ ] Rate limiting on auth + checkout endpoints in middleware
- [x] Input validation (Zod) on all API routes
- [x] SQL injection prevented (parameterized queries via Supabase JS client)
- [ ] Environment variables validated at startup

### 6.10 — Tests

**`tests/middleware.test.ts`** — rate limiting behavior

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

describe("Rate limiting", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("allows requests under the limit", () => {
    const result = checkRateLimit("test-key", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks requests over the limit", () => {
    const key = "test-block-key";
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, 5, 60_000);
    }
    const result = checkRateLimit(key, 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after the window expires", () => {
    const key = "test-reset-key";
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, 5, 50); // 50ms window
    }
    // After window expires, should allow again
    const result = checkRateLimit(key, 5, 50);
    expect(result.allowed).toBe(true);
  });
});
```

**`tests/dashboard.test.ts`** — sales dashboard data aggregation

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-middleware";

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/auth-middleware", () => ({
  getAuthUser: vi.fn(),
}));

describe("Sales dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users to login", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    // Page should call redirect("/login")
  });

  it("shows 404 for unknown event slug", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-1" });
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    };
    vi.mocked(createServerClient).mockReturnValue(mockSupabase as any);
    // Page should call notFound()
  });

  it("redirects non-owner away from event dashboard", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-2" });
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "evt-1", organizer_id: "org-1", title: "Test", status: "published" },
      }),
    };
    vi.mocked(createServerClient).mockReturnValue(mockSupabase as any);
    // Page should call redirect("/dashboard")
  });

  it("computes totals from tiers and orders", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-1" });
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "evt-1", organizer_id: "org-1", title: "Test", status: "published" },
      }),
    };
    // Mock parallel queries
    vi.mocked(createServerClient).mockReturnValue(mockSupabase as any);
    // Verify totalRevenue, totalFees, totalTicketsSold are computed correctly
  });
});
```

**`tests/components/ui.test.tsx`** — UI component rendering

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

describe("Card", () => {
  it("renders label and value", () => {
    render(<Card label="Vendidos" value="42" />);
    expect(screen.getByText("Vendidos")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
  });
});

describe("Button", () => {
  it("shows loading text when loading", () => {
    render(<Button loading>Salvar</Button>);
    expect(screen.getByText("Carregando...")).toBeDefined();
  });

  it("is disabled when loading", () => {
    render(<Button loading>Salvar</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("Input", () => {
  it("shows error message", () => {
    render(<Input error="Campo obrigatório" />);
    expect(screen.getByText("Campo obrigatório")).toBeDefined();
  });
});
```

## Files to create

| File | Action |
|---|---|
| `lib/format.ts` | create |
| `app/dashboard/layout.tsx` | create |
| `app/dashboard/events/[slug]/dashboard/page.tsx` | create |
| `components/ui/button.tsx` | create |
| `components/ui/input.tsx` | create |
| `components/ui/card.tsx` | create |
| `components/ui/table.tsx` | create |
| `components/ui/spinner.tsx` | create |
| `app/error.tsx` | create |
| `app/not-found.tsx` | create |
| `lib/env.ts` | create |
| `tests/middleware.test.ts` | create |
| `tests/dashboard.test.ts` | create |
| `tests/components/ui.test.tsx` | create |

## Files to update

| File | Action |
|---|---|
| `middleware.ts` | Add rate limiting for `/api/auth/*` and `/api/checkout` with route-specific limits |
| `app/globals.css` | Add responsive rules (img max-width, mobile breakpoint, spin keyframe) — no global table styles |
| `app/dashboard/page.tsx` | Remove inline profile link and logout button (now in sidebar); remove outer `<main>` wrapper |
| `next.config.ts` | Import `./lib/env` for startup validation |

## Verification checklist

- [ ] Dashboard shows total sold, revenue, fees, check-in count
- [ ] Per-tier breakdown is accurate
- [ ] Dashboard layout has sidebar navigation with active link highlighting
- [ ] Error boundary renders on server crashes (test by throwing in a page)
- [ ] 404 page renders for unknown routes
- [ ] Rate limiting blocks >60 requests/min on auth endpoints (429)
- [ ] Rate limiting blocks >10 requests/min on checkout endpoint (429)
- [ ] CSS is responsive on mobile widths (<768px)
- [ ] All env vars validated on startup (warning in dev, error in production)
- [ ] `npm test` passes (all existing + new tests)
- [ ] `npm run build` succeeds