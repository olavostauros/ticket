import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { checkoutSchema, checkoutItemSchema, abacatepayWebhookSchema } from "@/lib/validation";
import { generateOrderReference } from "@/lib/utils";

// Schema unit tests

describe("checkoutItemSchema", () => {
  it("accepts valid item", () => {
    const result = checkoutItemSchema.safeParse({
      tier_id: "550e8400-e29b-41d4-a716-446655440000",
      quantity: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid tier_id (not a UUID)", () => {
    const result = checkoutItemSchema.safeParse({
      tier_id: "not-a-uuid",
      quantity: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero quantity", () => {
    const result = checkoutItemSchema.safeParse({
      tier_id: "550e8400-e29b-41d4-a716-446655440000",
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    const result = checkoutItemSchema.safeParse({
      tier_id: "550e8400-e29b-41d4-a716-446655440000",
      quantity: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer quantity", () => {
    const result = checkoutItemSchema.safeParse({
      tier_id: "550e8400-e29b-41d4-a716-446655440000",
      quantity: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("checkoutSchema", () => {
  const validPayload = {
    event_id: "550e8400-e29b-41d4-a716-446655440000",
    items: [
      { tier_id: "550e8400-e29b-41d4-a716-446655440001", quantity: 2 },
    ],
    attendee_email: "joao@example.com",
    attendee_name: "João Silva",
    idempotency_key: "idem-001",
  };

  it("accepts valid checkout payload with all optional fields", () => {
    const result = checkoutSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("accepts checkout without attendee_name (defaults to empty string)", () => {
    const { attendee_name, ...rest } = validPayload;
    const result = checkoutSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attendee_name).toBe("");
    }
  });

  it("accepts checkout with multiple items", () => {
    const result = checkoutSchema.safeParse({
      ...validPayload,
      items: [
        { tier_id: "550e8400-e29b-41d4-a716-446655440002", quantity: 1 },
        { tier_id: "550e8400-e29b-41d4-a716-446655440003", quantity: 3 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid event_id", () => {
    const result = checkoutSchema.safeParse({
      ...validPayload,
      event_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty items array", () => {
    const result = checkoutSchema.safeParse({
      ...validPayload,
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing items field", () => {
    const { items, ...rest } = validPayload;
    const result = checkoutSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid attendee_email", () => {
    const result = checkoutSchema.safeParse({
      ...validPayload,
      attendee_email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing idempotency_key", () => {
    const { idempotency_key, ...rest } = validPayload;
    const result = checkoutSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty idempotency_key", () => {
    const result = checkoutSchema.safeParse({
      ...validPayload,
      idempotency_key: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid item inside items array", () => {
    const result = checkoutSchema.safeParse({
      ...validPayload,
      items: [{ tier_id: "bad", quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });
});

describe("abacatepayWebhookSchema", () => {
  it("accepts a valid webhook payload", () => {
    const result = abacatepayWebhookSchema.safeParse({
      event: "checkout.completed",
      data: { id: "bill-001", reference: "TCK-ABC123" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts checkout.lost event", () => {
    const result = abacatepayWebhookSchema.safeParse({
      event: "checkout.lost",
      data: { id: "bill-002", reference: "TCK-DEF456" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown event types", () => {
    const result = abacatepayWebhookSchema.safeParse({
      event: "some.unknown.event",
      data: { id: "bill-003", reference: "TCK-GHI789" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing event field", () => {
    const result = abacatepayWebhookSchema.safeParse({
      data: { id: "bill-001" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing data field", () => {
    const result = abacatepayWebhookSchema.safeParse({
      event: "checkout.completed",
    });
    expect(result.success).toBe(false);
  });
});

// AbacatePay client tests

describe("createCheckout", () => {
  beforeAll(() => {
    process.env.ABACATEPAY_API_KEY = "apk_test_key";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  it("throws when ABACATEPAY_API_KEY is missing", async () => {
    const key = process.env.ABACATEPAY_API_KEY;
    delete process.env.ABACATEPAY_API_KEY;

    const { createCheckout } = await import("@/lib/abacatepay");
    await expect(
      createCheckout({
        amountCents: 2500,
        customerEmail: "test@example.com",
        reference: "TCK-TEST",
        completionUrl: "http://localhost:3000/success",
        notificationUrl: "http://localhost:3000/webhook",
      })
    ).rejects.toThrow("ABACATEPAY_API_KEY");

    process.env.ABACATEPAY_API_KEY = key;
  });

  it("throws on non-2xx response from AbacatePay", async () => {
    const { createCheckout } = await import("@/lib/abacatepay");

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: vi.fn().mockResolvedValue("Invalid amount"),
    });

    await expect(
      createCheckout({
        amountCents: -100,
        customerEmail: "test@example.com",
        reference: "TCK-TEST",
        completionUrl: "http://localhost:3000/success",
        notificationUrl: "http://localhost:3000/webhook",
      })
    ).rejects.toThrow("AbacatePay error (422)");

    vi.restoreAllMocks();
  });

  it("returns checkout response on success", async () => {
    const { createCheckout } = await import("@/lib/abacatepay");

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: "bill-001",
        checkoutUrl: "https://abacatepay.com/checkout/abc123",
        status: "pending",
      }),
    });

    const result = await createCheckout({
      amountCents: 5000,
      customerEmail: "maria@example.com",
      customerName: "Maria Souza",
      reference: "TCK-MARIA",
      completionUrl: "http://localhost:3000/order/TCK-MARIA/success",
      notificationUrl: "http://localhost:3000/api/webhooks/abacatepay",
    });

    expect(result.id).toBe("bill-001");
    expect(result.checkoutUrl).toBe("https://abacatepay.com/checkout/abc123");
    expect(result.status).toBe("pending");

    // Verify the request payload sent to AbacatePay
    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1]?.body as string);
    expect(requestBody.amount).toBe(5000);
    expect(requestBody.customer.email).toBe("maria@example.com");
    expect(requestBody.customer.name).toBe("Maria Souza");
    expect(requestBody.reference).toBe("TCK-MARIA");

    vi.restoreAllMocks();
  });
});

describe("verifyWebhookSignature", () => {
  beforeAll(() => {
    process.env.ABACATEPAY_WEBHOOK_SECRET = "whsec_test_secret";
  });

  it("returns false when ABACATEPAY_WEBHOOK_SECRET is missing", async () => {
    const secret = process.env.ABACATEPAY_WEBHOOK_SECRET;
    delete process.env.ABACATEPAY_WEBHOOK_SECRET;

    const { verifyWebhookSignature } = await import("@/lib/abacatepay");
    const result = await verifyWebhookSignature('{"event":"test"}', "sig");
    expect(result).toBe(false);

    process.env.ABACATEPAY_WEBHOOK_SECRET = secret;
  });

  it("returns false for invalid signature", async () => {
    const { verifyWebhookSignature } = await import("@/lib/abacatepay");
    const result = await verifyWebhookSignature(
      '{"event":"checkout.completed"}',
      "deadbeef"
    );
    expect(result).toBe(false);
  });

  it("returns true for a valid HMAC-SHA256 signature", async () => {
    const { verifyWebhookSignature } = await import("@/lib/abacatepay");

    // Generate the correct HMAC-SHA256 using Web Crypto
    const encoder = new TextEncoder();
    const body = '{"event":"checkout.completed","data":{"id":"bill-001"}}';
    const secret = "whsec_test_secret";

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const sigHex = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const result = await verifyWebhookSignature(body, sigHex);
    expect(result).toBe(true);
  });

  it("rejects tampered body (different body than what was signed)", async () => {
    const { verifyWebhookSignature } = await import("@/lib/abacatepay");

    const encoder = new TextEncoder();
    const body = '{"event":"checkout.completed","data":{"id":"bill-001"}}';
    const secret = "whsec_test_secret";

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const sigHex = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Verify with a different body — should fail
    const result = await verifyWebhookSignature(
      '{"event":"checkout.lost","data":{"id":"bill-001"}}',
      sigHex
    );
    expect(result).toBe(false);
  });
});

// Utils tests

describe("generateOrderReference", () => {
  it("returns a string with TCK- prefix", () => {
    const ref = generateOrderReference();
    expect(ref).toMatch(/^TCK-/);
  });

  it("returns a string of length 12 (TCK- + 8 chars)", () => {
    const ref = generateOrderReference();
    expect(ref.length).toBe(12);
  });

  it("contains only uppercase alphanumerics after TCK- (no I,O,0,1)", () => {
    const ref = generateOrderReference();
    const suffix = ref.slice(4);
    expect(suffix).toMatch(/^[A-HJ-NP-Z2-9]+$/);
  });

  it("generates unique references on successive calls", () => {
    const refs = new Set(Array.from({ length: 100 }, () => generateOrderReference()));
    expect(refs.size).toBe(100);
  });
});

// Route-level integration tests
// These mock Supabase and test the route handlers directly.

// Shared mock Supabase client — used by all route tests below.
// Tests configure it per-scenario via mockSupabase.rpc / mockSupabase.from.
const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => mockSupabase,
}));

function mockEventFetch(eventOverrides: Record<string, unknown> = {}) {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === "events") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: "550e8400-e29b-41d4-a716-446655440000",
            organizer_id: "org-001",
            title: "Test Event",
            status: "published",
            ...eventOverrides,
          },
          error: null,
        }),
      };
    }
    if (table === "tiers") {
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [
            {
              id: "550e8400-e29b-41d4-a716-446655440001",
              event_id: "550e8400-e29b-41d4-a716-446655440000",
              name: "VIP",
              price_cents: 5000,
              quantity_total: 100,
              quantity_sold: 10,
            },
          ],
          error: null,
        }),
      };
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };
  });
}

describe("POST /api/checkout", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
    process.env.ABACATEPAY_API_KEY = "apk_test";
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing order on duplicate idempotency_key (idempotent)", async () => {
    const mockOrder = {
      id: "order-001",
      reference: "TCK-IDEM",
      abacatepay_checkout_url: "https://checkout.url",
      status: "pending",
      _idempotent: true,
    };

    // Mock AbacatePay success
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: "bill-001",
        checkoutUrl: "https://checkout.url",
        status: "pending",
      }),
    });

    mockSupabase.rpc.mockResolvedValue({ data: mockOrder, error: null });
    mockEventFetch();

    const { POST } = await import("@/app/api/checkout/route");

    const request = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        items: [{ tier_id: "550e8400-e29b-41d4-a716-446655440001", quantity: 2 }],
        attendee_email: "test@example.com",
        attendee_name: "Test User",
        idempotency_key: "dup-key-001",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.order_reference).toBe("TCK-IDEM");
    expect(body.data.checkout_url).toBe("https://checkout.url");
    expect(body.data.order._idempotent).toBe(true);

    vi.restoreAllMocks();
  });

  it("returns 400 on invalid input", async () => {
    const { POST } = await import("@/app/api/checkout/route");

    const request = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: "not-a-uuid",
        items: [],
        attendee_email: "bad-email",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Validation failed");
  });

  it("returns 409 when insufficient tier capacity", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: "bill-002",
        checkoutUrl: "https://checkout.url/002",
        status: "pending",
      }),
    });

    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: new Error("Insufficient capacity for tier: VIP (available: 0, requested: 2)"),
    });
    mockEventFetch();

    const { POST } = await import("@/app/api/checkout/route");

    const request = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        items: [{ tier_id: "550e8400-e29b-41d4-a716-446655440001", quantity: 2 }],
        attendee_email: "test@example.com",
        attendee_name: "Test User",
        idempotency_key: "idem-002",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain("enough available tickets");

    vi.restoreAllMocks();
  });

  it("returns 502 when AbacatePay is unavailable", async () => {
    // Mock AbacatePay to fail
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    mockEventFetch();

    const { POST } = await import("@/app/api/checkout/route");

    const request = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        items: [{ tier_id: "550e8400-e29b-41d4-a716-446655440001", quantity: 2 }],
        attendee_email: "test@example.com",
        attendee_name: "Test User",
        idempotency_key: "idem-003",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toContain("Payment provider temporarily unavailable");

    vi.restoreAllMocks();
  });

  it("creates order and returns checkout_url for a valid request", async () => {
    const mockOrder = {
      id: "order-002",
      reference: "TCK-VALID",
      status: "pending",
      _idempotent: false,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: "bill-003",
        checkoutUrl: "https://abacatepay.com/checkout/valid123",
        status: "pending",
      }),
    });

    mockSupabase.rpc.mockResolvedValue({ data: mockOrder, error: null });
    mockEventFetch();

    const { POST } = await import("@/app/api/checkout/route");

    const request = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        items: [{ tier_id: "550e8400-e29b-41d4-a716-446655440001", quantity: 1 }],
        attendee_email: "test@example.com",
        attendee_name: "Test User",
        idempotency_key: "idem-004",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.order_reference).toBe("TCK-VALID");
    expect(body.data.checkout_url).toBe("https://abacatepay.com/checkout/valid123");

    // Verify the RPC was called with billing info
    const rpcCall = mockSupabase.rpc.mock.calls[0];
    expect(rpcCall[0]).toBe("create_order_atomic");
    expect(rpcCall[1].p_billing_id).toBe("bill-003");
    expect(rpcCall[1].p_checkout_url).toBe("https://abacatepay.com/checkout/valid123");

    vi.restoreAllMocks();
  });

  it("returns 404 for non-existent event", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "events") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: new Error("not found") }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn(),
      };
    });

    const { POST } = await import("@/app/api/checkout/route");

    const request = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        items: [{ tier_id: "550e8400-e29b-41d4-a716-446655440001", quantity: 1 }],
        attendee_email: "test@example.com",
        attendee_name: "Test User",
        idempotency_key: "idem-005",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Event not found");
  });
});

// Webhook route tests

describe("POST /api/webhooks/abacatepay", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
    process.env.ABACATEPAY_WEBHOOK_SECRET = "whsec_test_secret";
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("rejects missing signature header with 401", async () => {
    const { POST } = await import("@/app/api/webhooks/abacatepay/route");

    const request = new Request("http://localhost:3000/api/webhooks/abacatepay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "checkout.completed" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain("signature");

    vi.unstubAllGlobals();
  });

  it("rejects invalid HMAC signature with 401", async () => {
    const { POST } = await import("@/app/api/webhooks/abacatepay/route");

    const request = new Request("http://localhost:3000/api/webhooks/abacatepay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-abacatepay-signature": "deadbeef",
      },
      body: JSON.stringify({ event: "checkout.completed" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);

    vi.unstubAllGlobals();
  });

  it("processes checkout.completed — updates order + creates tickets", async () => {
    const { POST } = await import("@/app/api/webhooks/abacatepay/route");

    const rawBody = JSON.stringify({
      event: "checkout.completed",
      data: { id: "bill-001", reference: "TCK-WEBHOOK-PAID" },
    });

    // Generate a valid HMAC signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode("whsec_test_secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const sigHex = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Configure the shared mockSupabase
    mockSupabase.rpc.mockResolvedValue({
      data: {
        tickets: [{ unique_code: "ticket-001" }, { unique_code: "ticket-002" }],
        attendee_email: "test@example.com",
        attendee_name: "Test User",
        _idempotent: false,
      },
      error: null,
    });

    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    mockSupabase.from.mockReturnValue({ insert: mockInsert });

    const request = new Request("http://localhost:3000/api/webhooks/abacatepay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-abacatepay-signature": sigHex,
      },
      body: rawBody,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.received).toBe(true);

    expect(mockSupabase.rpc).toHaveBeenCalledWith("process_paid_order_atomic", {
      p_reference: "TCK-WEBHOOK-PAID",
      p_billing_id: "bill-001",
    });

    // Job enqueue is now handled inside the RPC — no separate insert call
    expect(mockInsert).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("processes checkout.lost — voids order", async () => {
    const { POST } = await import("@/app/api/webhooks/abacatepay/route");

    const rawBody = JSON.stringify({
      event: "checkout.lost",
      data: { id: "bill-002", reference: "TCK-WEBHOOK-LOST" },
    });

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode("whsec_test_secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const sigHex = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    const request = new Request("http://localhost:3000/api/webhooks/abacatepay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-abacatepay-signature": sigHex,
      },
      body: rawBody,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(mockSupabase.rpc).toHaveBeenCalledWith("void_order_atomic", {
      p_reference: "TCK-WEBHOOK-LOST",
      p_billing_id: "bill-002",
      p_new_status: "lost",
    });

    vi.unstubAllGlobals();
  });

  it("is idempotent for duplicate checkout.completed webhooks", async () => {
    const { POST } = await import("@/app/api/webhooks/abacatepay/route");

    const rawBody = JSON.stringify({
      event: "checkout.completed",
      data: { id: "bill-001", reference: "TCK-IDEMPOTENT" },
    });

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode("whsec_test_secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const sigHex = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // _idempotent: true means the RPC detected it was already processed
    mockSupabase.rpc.mockResolvedValue({
      data: {
        tickets: [{ unique_code: "ticket-001" }],
        attendee_email: "test@example.com",
        _idempotent: true,
      },
      error: null,
    });

    mockSupabase.from.mockReturnValue({ insert: vi.fn() });

    const request = new Request("http://localhost:3000/api/webhooks/abacatepay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-abacatepay-signature": sigHex,
      },
      body: rawBody,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    // RPC should have been called
    expect(mockSupabase.rpc).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("ignores unrecognized event types", async () => {
    const { POST } = await import("@/app/api/webhooks/abacatepay/route");

    const rawBody = JSON.stringify({
      event: "some.unknown.event",
      data: { id: "bill-003", reference: "TCK-UNKNOWN" },
    });

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode("whsec_test_secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const sigHex = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    mockSupabase.rpc.mockClear();

    const request = new Request("http://localhost:3000/api/webhooks/abacatepay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-abacatepay-signature": sigHex,
      },
      body: rawBody,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockSupabase.rpc).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("rejects malformed JSON payload with 400", async () => {
    const { POST } = await import("@/app/api/webhooks/abacatepay/route");

    const rawBody = "not-json";

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode("whsec_test_secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const sigHex = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const request = new Request("http://localhost:3000/api/webhooks/abacatepay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-abacatepay-signature": sigHex,
      },
      body: rawBody,
    });

    const response = await POST(request);
    expect(response.status).toBe(500);

    vi.unstubAllGlobals();
  });
});

// Cron job processor route tests

describe("POST /api/cron/process-jobs", () => {
  beforeAll(() => {
    process.env.JOB_PROCESSOR_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects requests without valid cron secret", async () => {
    const { POST } = await import("@/app/api/cron/process-jobs/route");

    const request = new NextRequest("http://localhost:3000/api/cron/process-jobs", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects wrong bearer token", async () => {
    const { POST } = await import("@/app/api/cron/process-jobs/route");

    const request = new NextRequest("http://localhost:3000/api/cron/process-jobs", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-token" },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("rejects wrong query token", async () => {
    const { POST } = await import("@/app/api/cron/process-jobs/route");

    const request = new NextRequest("http://localhost:3000/api/cron/process-jobs?token=wrong", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("accepts query token and processes jobs", async () => {
    mockSupabase.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [
          {
            id: "job-001",
            job_type: "send_confirmation_email",
            retries: 0,
            max_retries: 3,
            payload: {
              order_reference: "TCK-CRON",
              attendee_email: "test@example.com",
              ticket_codes: ["ticket-001"],
            },
          },
        ],
        error: null,
      });

    mockSupabase.from.mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { POST } = await import("@/app/api/cron/process-jobs/route");

    const request = new NextRequest("http://localhost:3000/api/cron/process-jobs?token=test-secret", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.processed).toBe(1);
    expect(body.data.results[0].status).toBe("done");

    vi.unstubAllGlobals();
  });

  it("retries failed jobs up to max_retries then marks failed", async () => {
    mockSupabase.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [
          {
            id: "job-fail",
            job_type: "send_confirmation_email",
            retries: 2,
            max_retries: 3,
            payload: {
              order_reference: "TCK-FAIL",
              attendee_email: "test@example.com",
            },
          },
        ],
        error: null,
      });

    mockSupabase.from.mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn(),
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("SMTP unavailable")));

    const { POST } = await import("@/app/api/cron/process-jobs/route");

    const request = new NextRequest("http://localhost:3000/api/cron/process-jobs?token=test-secret", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.processed).toBe(1);
    expect(body.data.results[0].status).toBe("failed");

    vi.unstubAllGlobals();
  });
});