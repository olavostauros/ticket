import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// -------------------------------------------------------------------------
// Mocks
// -------------------------------------------------------------------------
const mockSupabase = { from: vi.fn(), rpc: vi.fn() };

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => mockSupabase,
}));

vi.mock("@/lib/auth-middleware", () => ({
  getAuthUser: vi.fn(),
}));

vi.mock("@/lib/abacatepay", () => ({
  createCheckout: vi.fn(),
  verifyWebhookSignature: vi.fn(),
}));

import { getAuthUser } from "@/lib/auth-middleware";
import { createCheckout, verifyWebhookSignature } from "@/lib/abacatepay";

const ORGANIZER_ID = "550e8400-e29b-41d4-a716-446655440001";
const EVENT_ID = "550e8400-e29b-41d4-a716-446655440002";
const TIER_ID = "550e8400-e29b-41d4-a716-446655440003";
const ORDER_REFERENCE = "TCK-E2E-HAPPY-PATH-001";
const IDEMPOTENCY_KEY = "idem-e2e-happy-path-001";
const BILLING_ID = "bill-e2e-happy-001";
const CHECKOUT_URL = "https://abacatepay.test/checkout/e2e-happy";

function mockQueryBuilder(resolvedValue?: any) {
  const builder: any = {};
  builder.select = vi.fn().mockReturnValue(builder);
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.update = vi.fn().mockReturnValue(builder);
  builder.delete = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.neq = vi.fn().mockReturnValue(builder);
  builder.in = vi.fn().mockReturnValue(builder);
  builder.order = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue(builder);
  builder.single = vi.fn().mockResolvedValue(resolvedValue || { data: null, error: null });
  builder.maybeSingle = vi.fn().mockResolvedValue(resolvedValue || { data: null, error: null });
  // Make the builder thenable (supports await for queries without .single())
  builder.then = function (onfulfilled: any) {
    return Promise.resolve(resolvedValue || { data: null, error: null }).then(onfulfilled);
  };
  return builder;
}

/** Create a mock query builder with a custom single() override. */
function mockQueryBuilderWithResult(result: Record<string, any>) {
  const builder = mockQueryBuilder(result);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Full MVP lifecycle", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    process.env.ABACATEPAY_API_KEY = "apk_test";
    process.env.ABACATEPAY_WEBHOOK_SECRET = "whsec_test";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  it("completes the full flow", async () => {
    // Mock auth for organizer endpoints
    vi.mocked(getAuthUser).mockResolvedValue({ id: ORGANIZER_ID, email: "org@test.com" });

    // === Step 1: Public event page ===
    const mockEvent = {
      id: EVENT_ID,
      organizer_id: ORGANIZER_ID,
      title: "Test Event",
      slug: "test-event",
      description: "An event for testing",
      venue_name: "Test Venue",
      venue_address: "123 Test St",
      start_at: "2026-08-15T20:00:00Z",
      end_at: "2026-08-16T02:00:00Z",
      timezone: "America/Sao_Paulo",
      cover_image_url: null,
      status: "published",
      tiers: [
        {
          id: TIER_ID,
          event_id: EVENT_ID,
          name: "General",
          price_cents: 2500,
          quantity_total: 100,
          quantity_sold: 0,
          description: "",
        },
      ],
    };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "events") {
        return mockQueryBuilder({ data: mockEvent, error: null });
      }
      return mockQueryBuilder({ data: null, error: null });
    });

    const { GET: getPublicEvent } = await import("@/app/api/events/[slug]/route");
    const publicReq = new Request(`http://localhost:3000/api/events/test-event`);
    const publicRes = await getPublicEvent(publicReq, { params: Promise.resolve({ slug: "test-event" }) });
    expect(publicRes.status).toBe(200);
    const publicBody = await publicRes.json();
    expect(publicBody.data.title).toBe("Test Event");
    expect(publicBody.data.tiers).toHaveLength(1);

    // === Step 2: Checkout ===
    vi.mocked(createCheckout).mockResolvedValue({
      id: BILLING_ID,
      checkoutUrl: CHECKOUT_URL,
      status: "pending",
    });

    // Checkout route queries: event (single), tiers (in), then rpc
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "events") {
        return mockQueryBuilder({
          data: { id: EVENT_ID, organizer_id: ORGANIZER_ID, title: "Test Event", status: "published" },
          error: null,
        });
      }
      if (table === "tiers") {
        return mockQueryBuilder({
          data: [
            { id: TIER_ID, event_id: EVENT_ID, name: "General", price_cents: 2500 },
          ],
          error: null,
        });
      }
      return mockQueryBuilder({ data: null, error: null });
    });

    mockSupabase.rpc.mockResolvedValue({
      data: {
        id: "order-e2e-001",
        event_id: EVENT_ID,
        organizer_id: ORGANIZER_ID,
        attendee_email: "attendee@test.com",
        attendee_name: "Test Attendee",
        amount_cents: 5250,
        fee_cents: 250,
        abacatepay_fee_cents: 0,
        reference: ORDER_REFERENCE,
        idempotency_key: IDEMPOTENCY_KEY,
        status: "pending",
        _idempotent: false,
      },
      error: null,
    });

    const { POST: checkoutPost } = await import("@/app/api/checkout/route");

    const checkoutReq = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: EVENT_ID,
        items: [{ tier_id: TIER_ID, quantity: 2 }],
        attendee_email: "attendee@test.com",
        attendee_name: "Test Attendee",
        idempotency_key: IDEMPOTENCY_KEY,
      }),
    });

    const checkoutRes = await checkoutPost(checkoutReq);
    const checkoutBody = await checkoutRes.json();
    
    expect(checkoutRes.status).toBe(201);
    expect(checkoutBody.data.order_reference).toBe(ORDER_REFERENCE);
    expect(checkoutBody.data.checkout_url).toBe(CHECKOUT_URL);

    // === Step 3: Webhook (checkout.completed) ===
    vi.mocked(verifyWebhookSignature).mockResolvedValue(true);

    mockSupabase.rpc.mockResolvedValue({
      data: {
        _idempotent: false,
        order_id: "order-e2e-001",
        ticket_count: 2,
        tickets: [
          { unique_code: "a1b2c3d4-e5f6-4789-abcd-ef0123456701" },
          { unique_code: "a1b2c3d4-e5f6-4789-abcd-ef0123456702" },
        ],
        attendee_email: "attendee@test.com",
        attendee_name: "Test Attendee",
      },
      error: null,
    });

    const { POST: webhookPost } = await import("@/app/api/webhooks/abacatepay/route");
    const webhookReq = new Request("http://localhost:3000/api/webhooks/abacatepay", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-abacatepay-signature": "valid" },
      body: JSON.stringify({
        event: "checkout.completed",
        data: { id: BILLING_ID, reference: ORDER_REFERENCE, status: "paid", amount: 5250, payment_method: "pix" },
      }),
    });

    const webhookRes = await webhookPost(webhookReq);
    expect(webhookRes.status).toBe(200);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("process_paid_order_atomic", {
      p_reference: ORDER_REFERENCE,
      p_billing_id: BILLING_ID,
    });

    // === Step 4: Ticket lookup ===
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "orders") {
        return mockQueryBuilder({
          data: {
            id: "order-e2e-001",
            status: "paid",
            event_id: EVENT_ID,
            attendee_email: "attendee@test.com",
            attendee_name: "Test Attendee",
          },
          error: null,
        });
      }
      if (table === "tickets") {
        return mockQueryBuilder({
          data: [
            { id: "tkt-001", unique_code: "a1b2c3d4-e5f6-4789-abcd-ef0123456701", holder_name: "Test Attendee", tier_id: TIER_ID, checked_in_at: null },
            { id: "tkt-002", unique_code: "a1b2c3d4-e5f6-4789-abcd-ef0123456702", holder_name: "Test Attendee", tier_id: TIER_ID, checked_in_at: null },
          ],
          error: null,
        });
      }
      if (table === "tiers") {
        return mockQueryBuilder({
          data: [{ id: TIER_ID, name: "General" }],
          error: null,
        });
      }
      return mockQueryBuilder({ data: null, error: null });
    });

    const { GET: lookupGet } = await import("@/app/api/orders/lookup/route");
    const lookupReq = new Request(`http://localhost:3000/api/orders/lookup?email=attendee@test.com&reference=${ORDER_REFERENCE}`);
    const lookupRes = await lookupGet(lookupReq);
    expect(lookupRes.status).toBe(200);
    const lookupBody = await lookupRes.json();
    expect(lookupBody.data.tickets).toHaveLength(2);

    // === Step 5: Check-in ===
    // Check-in route queries: organizers (single), tickets with event join (single), then rpc
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "organizers") {
        return mockQueryBuilder({ data: { id: ORGANIZER_ID }, error: null });
      }
      if (table === "tickets") {
        return mockQueryBuilder({
          data: {
            id: "tkt-001",
            unique_code: "a1b2c3d4-e5f6-4789-abcd-ef0123456701",
            event_id: EVENT_ID,
            tier_id: TIER_ID,
            holder_name: "Test Attendee",
            checked_in_at: null,
            event: { title: "Test Event", organizer_id: ORGANIZER_ID },
          },
          error: null,
        });
      }
      return mockQueryBuilder({ data: null, error: null });
    });

    mockSupabase.rpc.mockResolvedValue({
      data: { ticket_id: "tkt-001", checked_in_at: "2026-08-15T20:30:00.000Z", event_id: EVENT_ID },
      error: null,
    });

    const { POST: checkinPost } = await import("@/app/api/checkin/route");
    const checkinReq = new Request("http://localhost:3000/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: EVENT_ID, ticket_code: "a1b2c3d4-e5f6-4789-abcd-ef0123456701" }),
    });

    const checkinRes = await checkinPost(checkinReq);
    const checkinBody = await checkinRes.json();
    expect(checkinRes.status).toBe(200);
    expect(checkinBody.data.checked_in_at).not.toBeNull();
  });

  it("handles idempotent checkout", async () => {
    vi.mocked(createCheckout).mockResolvedValue({
      id: BILLING_ID,
      checkoutUrl: CHECKOUT_URL,
      status: "pending",
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "events") {
        return mockQueryBuilder({
          data: { id: EVENT_ID, organizer_id: ORGANIZER_ID, title: "Test Event", status: "published" },
          error: null,
        });
      }
      if (table === "tiers") {
        return mockQueryBuilder({
          data: [{ id: TIER_ID, event_id: EVENT_ID, name: "General", price_cents: 2500 }],
          error: null,
        });
      }
      return mockQueryBuilder({ data: null, error: null });
    });

    mockSupabase.rpc.mockResolvedValue({
      data: {
        id: "order-e2e-001",
        reference: ORDER_REFERENCE,
        status: "pending",
        _idempotent: true,
      },
      error: null,
    });

    const { POST: checkoutPost } = await import("@/app/api/checkout/route");
    const req = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: EVENT_ID,
        items: [{ tier_id: TIER_ID, quantity: 1 }],
        attendee_email: "attendee@test.com",
        idempotency_key: IDEMPOTENCY_KEY,
      }),
    });

    const res = await checkoutPost(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.order._idempotent).toBe(true);
  });
});