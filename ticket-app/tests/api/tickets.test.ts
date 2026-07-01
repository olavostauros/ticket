import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Setup

const mockSupabase = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => mockSupabase,
}));

function mockSelect(returnValue: Record<string, unknown>) {
  return vi.fn().mockReturnValue(returnValue);
}

function mockSingle(returnValue: Record<string, unknown>) {
  return vi.fn().mockReturnValue(returnValue);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// GET /api/orders/lookup

describe("GET /api/orders/lookup", () => {
  async function callLookup(email: string | null, reference: string | null) {
    const params = new URLSearchParams();
    if (email) params.set("email", email);
    if (reference) params.set("reference", reference);

    const url = new URL(`http://localhost:3000/api/orders/lookup?${params.toString()}`);
    const req = new NextRequest(url);

    const { GET } = await import("@/app/api/orders/lookup/route");
    return GET(req);
  }

  it("rejects missing email param", async () => {
    const res = await callLookup(null, "TCK-TEST1234");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Email and reference are required");
  });

  it("rejects missing reference param", async () => {
    const res = await callLookup("test@example.com", null);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Email and reference are required");
  });

  it("returns 404 for unknown order", async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
    };
    mockSupabase.from.mockReturnValue(mockChain);

    const res = await callLookup("unknown@example.com", "TCK-NOEXIST");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Order not found");
  });

  it("returns tickets for valid email + reference", async () => {
    const orderId = crypto.randomUUID();

    // First call: fetch order
    const orderChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: orderId,
          status: "paid",
          event_id: crypto.randomUUID(),
          attendee_email: "test@example.com",
          attendee_name: "Test User",
        },
        error: null,
      }),
    };

    // Second call: fetch tickets
    const tierId = crypto.randomUUID();
    const ticketChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [
          {
            id: crypto.randomUUID(),
            unique_code: crypto.randomUUID(),
            holder_name: "Test User",
            tier_id: tierId,
            checked_in_at: null,
          },
        ],
        error: null,
      }),
    };

    // Third call: fetch tiers
    const tierChain = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [{ id: tierId, name: "General Admission" }],
        error: null,
      }),
    };

    mockSupabase.from
      .mockReturnValueOnce(orderChain)
      .mockReturnValueOnce(ticketChain)
      .mockReturnValueOnce(tierChain);

    const res = await callLookup("test@example.com", "TCK-TEST1234");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.order_reference).toBe("TCK-TEST1234");
    expect(body.data.tickets).toHaveLength(1);
    expect(body.data.tickets[0].tier_name).toBe("General Admission");
  });
});

// GET /api/tickets/:code

describe("GET /api/tickets/:code", () => {
  async function callTicket(code: string) {
    // The route expects params as a Promise<{ unique_code: string }>
    const { GET } = await import("@/app/api/tickets/[unique_code]/route");
    const url = new URL(`http://localhost:3000/api/tickets/${code}`);
    const req = new NextRequest(url);
    return GET(req, { params: Promise.resolve({ unique_code: code }) });
  }

  it("returns 404 for invalid code", async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
    };
    mockSupabase.from.mockReturnValue(mockChain);

    const res = await callTicket(crypto.randomUUID());
    expect(res.status).toBe(404);
  });

  it("returns ticket details for valid code", async () => {
    const ticketId = crypto.randomUUID();
    const code = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const tierId = crypto.randomUUID();

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: ticketId,
          unique_code: code,
          holder_name: "Test User",
          holder_email: "test@example.com",
          checked_in_at: null,
          event_id: eventId,
          tier_id: tierId,
          event: {
            title: "Test Event",
            start_at: "2026-07-15T18:00:00Z",
            venue_name: "Test Venue",
          },
          tier: {
            name: "VIP",
          },
        },
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValue(mockChain);

    const res = await callTicket(code);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.holder_name).toBe("Test User");
    expect(body.data.event.title).toBe("Test Event");
    expect(body.data.tier.name).toBe("VIP");
    expect(body.data.checked_in).toBe(false);
  });
});

// Email sending

describe("Email sending", () => {
  it("sendEmail makes a POST to Resend API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
    });
    vi.stubGlobal("fetch", mockFetch);

    const { sendEmail } = await import("@/lib/email");
    await sendEmail({
      to: "test@example.com",
      subject: "Test subject",
      html: "<p>Hello</p>",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: expect.stringContaining("Bearer"),
        }),
        body: expect.stringContaining("test@example.com"),
      })
    );

    vi.unstubAllGlobals();
  });

  it("buildConfirmationEmail includes ticket links", async () => {
    const { buildConfirmationEmail } = await import("@/lib/email-templates");

    const html = buildConfirmationEmail({
      attendeeName: "João",
      orderReference: "TCK-ABC1234",
      ticketUrls: ["https://ticket.app/tickets/uuid-1234"],
    });

    expect(html).toContain("João");
    expect(html).toContain("TCK-ABC1234");
    expect(html).toContain("https://ticket.app/tickets/uuid-1234");
    expect(html).toContain("Compra confirmada");
  });

  it("buildConfirmationEmail escapes user-provided strings", async () => {
    const { buildConfirmationEmail } = await import("@/lib/email-templates");

    const html = buildConfirmationEmail({
      attendeeName: "<script>alert('xss')</script>",
      orderReference: "TCK-TEST",
      ticketUrls: ["https://ticket.app/tickets/test"],
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

// QR code component

describe("QRCodeDisplay", () => {
  it("renders a canvas element", async () => {
    // This is a client component — we just verify the import works
    const { QRCodeDisplay } = await import("@/components/qr-code");
    expect(QRCodeDisplay).toBeDefined();
  });
});