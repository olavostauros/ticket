# Plan: Frontend Page Smoke Tests

> **Roadmap:** [#8 — Frontend Page Smoke Tests](../ROADMAP.md#8-frontend-page-smoke-tests)
> **Priority:** P1 — Should Have
> **Effort:** 1.5 days

---

## Goal

Add rendering tests for all 13 pages to verify they render without crashing when given mock data. These are "smoke tests" — they don't test interactivity or complex state, just that the page structure is correct.

---

## Test Strategy

### Pages Overview

| # | Page | Route | Component Type | Test Priority |
|---|------|-------|---------------|---------------|
| 1 | Landing | `/` | Server | High |
| 2 | Public Event | `/events/[slug]` | Server | High |
| 3 | Checkout | `/checkout` | Client | High (new) |
| 4 | Order Success | `/order/[ref]/success` | Server | High (new) |
| 5 | My Tickets | `/my-tickets` | Client | Medium |
| 6 | Ticket Detail | `/tickets/[code]` | Server | High |
| 7 | Login | `/login` | Client | Medium |
| 8 | Signup | `/signup` | Client | Medium |
| 9 | Dashboard | `/dashboard` | Server | High |
| 10 | Create Event | `/dashboard/events/new` | Client | Medium |
| 11 | Edit Event | `/dashboard/events/[slug]` | Client | Medium |
| 12 | Sales Dashboard | `/dashboard/events/[slug]/dashboard` | Server | High |
| 13 | Check-in | `/dashboard/events/[slug]/checkin` | Server + Client | Medium |
| 14 | Profile | `/dashboard/profile` | Client | Low |
| 15 | Privacy | `/privacy` | Server | Low |

---

## Test Approach

### For Server Components (SSR):

Use `@testing-library/react` with a simulated environment. Since server components render on the server, we can either:

**Option A: Unit test the rendered output directly** — import the component, render with mock props, assert on the DOM.

**Option B: Integration test via app router** — use Next.js testing utilities to render full page routes.

**Decision: Option A** for simplicity and speed. Create a test helper that renders each page component with mock props and mocks the Supabase data-fetching layer.

### For Client Components:

Use `@testing-library/react` + `jsdom` + `@testing-library/user-event`. Render the component directly, mock API calls with `vi.fn()`.

---

## Test File Structure

```
ticket-app/tests/pages/
├── landing.test.tsx          # Landing page (/)
├── event-page.test.tsx       # Public event page
├── checkout-page.test.tsx    # Checkout form
├── order-success.test.tsx    # Order success page
├── my-tickets.test.tsx       # My Tickets lookup
├── ticket-detail.test.tsx    # Ticket detail + QR code
├── auth-pages.test.tsx       # Login + signup
├── dashboard.test.tsx        # Dashboard overview
├── event-edit.test.tsx       # Create/edit event forms
├── event-dashboard.test.tsx  # Sales dashboard
├── checkin.test.tsx          # Check-in page
├── profile.test.tsx          # Profile page
└── privacy.test.tsx          # Privacy policy
```

---

## Test Specifications Per Page

### 1. Landing Page (`/`)

```typescript
describe("Landing Page", () => {
  it("renders the hero heading", () => {
    render(<HomePage />);
    expect(screen.getByText(/venda ingressos/i)).toBeInTheDocument();
  });

  it("shows 'Sou organizador' and 'Sou participante' cards", () => {
    render(<HomePage />);
    expect(screen.getByText(/sou organizador/i)).toBeInTheDocument();
    expect(screen.getByText(/sou participante/i)).toBeInTheDocument();
  });

  it("links to signup from organizer card", () => {
    render(<HomePage />);
    const signupLink = screen.getByText(/criar conta grátis/i);
    expect(signupLink).toHaveAttribute("href", "/signup");
  });

  it("links to my-tickets from attendee card", () => {
    render(<HomePage />);
    const ticketsLink = screen.getByText(/meus ingressos/i);
    expect(ticketsLink).toHaveAttribute("href", "/my-tickets");
  });

  it("has login link in header", () => {
    render(<HomePage />);
    expect(screen.getByText(/entrar/i)).toHaveAttribute("href", "/login");
  });

  it("has privacy link in footer", () => {
    render(<HomePage />);
    expect(screen.getByText(/politica de privacidade/i)).toHaveAttribute("href", "/privacy");
  });
});
```

### 2. Public Event Page (`/events/[slug]`)

Requires mocking Supabase data fetch.

```typescript
describe("Public Event Page", () => {
  const mockEvent = {
    title: "Test Event",
    description: "A test event description",
    start_at: "2026-08-15T20:00:00Z",
    end_at: "2026-08-16T02:00:00Z",
    timezone: "America/Sao_Paulo",
    venue_name: "Test Venue",
    venue_address: "123 Test St",
    cover_image_url: null,
    tiers: [
      { id: "tier-1", name: "General", price_cents: 2500, quantity_total: 100, quantity_sold: 0, description: "" },
      { id: "tier-2", name: "VIP", price_cents: 10000, quantity_total: 50, quantity_sold: 0, description: "VIP access" },
    ],
  };

  it("renders event title and description", async () => {
    // Mock supabase to return mockEvent
    render(await EventPage({ params: Promise.resolve({ slug: "test-event" }) }));
    expect(screen.getByText("Test Event")).toBeInTheDocument();
    expect(screen.getByText("A test event description")).toBeInTheDocument();
  });

  it("renders venue name and address", () => {
    // ...
  });

  it("renders all available tiers with prices", () => {
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("VIP")).toBeInTheDocument();
    // Prices formatted in BRL
    expect(screen.getByText("R$ 25,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 100,00")).toBeInTheDocument();
  });

  it("shows 'Comprar' link for each tier", () => {
    const buyLinks = screen.getAllByText("Comprar");
    expect(buyLinks).toHaveLength(2);
    expect(buyLinks[0]).toHaveAttribute("href", expect.stringContaining("/checkout"));
  });

  it("shows availability count", () => {
    expect(screen.getByText(/100 disponíveis/i)).toBeInTheDocument();
  });

  it("does not show sold-out tiers (quantity_sold = quantity_total)", async () => {
    // Mock with sold-out tier
    // Assert it doesn't render the tier or the Comprar link
  });
});
```

### 3. Checkout Page (`/checkout`) — Client Component

```typescript
describe("Checkout Page", () => {
  it("renders the checkout form", () => {
    render(<CheckoutPage searchParams={{ event: "test-event", tier: "tier-1" }} />);
    expect(screen.getByText(/finalizar compra/i)).toBeInTheDocument();
  });

  it("has email field", () => {
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("has name field (optional)", () => {
    expect(screen.getByLabelText(/nome/i)).toBeInTheDocument();
  });

  it("has quantity selector", () => {
    // Default quantity should be 1
    const qty = screen.getByRole("spinbutton", { name: /quantidade/i });
    expect(qty).toHaveValue(1);
  });

  it("shows fee breakdown", () => {
    // Price + platform fee + total should all display
  });

  it("shows error when email is empty on submit", async () => {
    const user = userEvent.setup();
    await user.click(screen.getByText("Comprar"));
    expect(screen.getByText(/informe seu email/i)).toBeInTheDocument();
  });

  it("redirects to AbacatePay on successful checkout", async () => {
    // Mock fetch to return 201 with checkout_url
    // Assert window.location.href was set
  });
});
```

### 4. Ticket Detail Page (`/tickets/[code]`)

```typescript
describe("Ticket Detail Page", () => {
  it("renders event name, date, venue", async () => {
    // Mock ticket with event data
    render(await TicketPage({ params: Promise.resolve({ code: "ABC123" }) }));
    expect(screen.getByText("Test Event")).toBeInTheDocument();
    expect(screen.getByText(/test venue/i)).toBeInTheDocument();
  });

  it("renders holder name", () => {
    expect(screen.getByText(/joão silva/i)).toBeInTheDocument();
  });

  it("renders QR code", () => {
    // QRCodeDisplay component should be in the document
    expect(document.querySelector("canvas")).toBeInTheDocument(); // or SVG
  });

  it("shows checked-in status when ticket is checked in", async () => {
    // Mock ticket with checked_in_at set
    render(await TicketPage({ params: Promise.resolve({ code: "CHECKED" }) }));
    expect(screen.getByText(/check-in realizado/i)).toBeInTheDocument();
  });

  it("does not show check-in message when not checked in", async () => {
    // Mock ticket with checked_in_at = null
    render(await TicketPage({ params: Promise.resolve({ code: "UNCHECKED" }) }));
    expect(screen.queryByText(/check-in realizado/i)).not.toBeInTheDocument();
  });
});
```

### 5. Dashboard Page (`/dashboard`)

```typescript
describe("Dashboard Page", () => {
  it("greets the organizer by name", async () => {
    render(await DashboardPage());
    expect(screen.getByText(/bem-vindo/i)).toBeInTheDocument();
  });

  it("shows list of events", async () => {
    // Mock events data
    expect(screen.getByText("Test Event 1")).toBeInTheDocument();
    expect(screen.getByText("Test Event 2")).toBeInTheDocument();
  });

  it("shows 'Criar Evento' button when no events exist", async () => {
    // Mock empty events
    expect(screen.getByText("Criar Evento")).toBeInTheDocument();
  });

  it("shows status badges per event", () => {
    // Published, draft, canceled badges
  });
});
```

### 6. Login Page (`/login`)

```typescript
describe("Login Page", () => {
  it("renders email and password fields", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
  });

  it("has a link to signup", () => {
    expect(screen.getByText(/criar conta/i)).toHaveAttribute("href", "/signup");
  });
});
```

---

## Test Setup

### Vitest Config

Ensure `vitest.config.ts` is set up for client component testing:

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",     // for client components
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

### Mock Supabase for Server Components

Create a test utility to mock Supabase server client:

```typescript
// tests/helpers/server-mock.ts
export function mockServerSupabase(data: Record<string, unknown>) {
  // Returns a mock of createServerClient() 
  // that resolves data accordingly
}
```

---

## Running the Tests

```bash
cd ticket-app && npx vitest run tests/pages --reporter verbose
```

---

## Files Summary

| Action | File | Purpose |
|--------|------|---------|
| **Create** | `tests/pages/landing.test.tsx` | Landing page smoke tests |
| **Create** | `tests/pages/event-page.test.tsx` | Public event page tests |
| **Create** | `tests/pages/checkout-page.test.tsx` | Checkout form tests |
| **Create** | `tests/pages/order-success.test.tsx` | Order success page tests |
| **Create** | `tests/pages/my-tickets.test.tsx` | My Tickets lookup tests |
| **Create** | `tests/pages/ticket-detail.test.tsx` | Ticket detail tests |
| **Create** | `tests/pages/auth-pages.test.tsx` | Login + signup tests |
| **Create** | `tests/pages/dashboard.test.tsx` | Dashboard tests |
| **Create** | `tests/pages/event-edit.test.tsx` | Create/edit event form tests |
| **Create** | `tests/pages/event-dashboard.test.tsx` | Sales dashboard tests |
| **Create** | `tests/pages/checkin.test.tsx` | Check-in page tests |
| **Create** | `tests/pages/profile.test.tsx` | Profile page tests |
| **Create** | `tests/pages/privacy.test.tsx` | Privacy policy tests |
| **Modify** | `vitest.config.ts` | Ensure jsdom environment |
| **Create** | `tests/helpers/server-mock.ts` | Supabase mock utility |