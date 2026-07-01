import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const mockSupabase = { from: vi.fn(), rpc: vi.fn() };

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => mockSupabase,
}));

vi.mock("@/lib/auth-middleware", () => ({
  getAuthUser: vi.fn(),
}));

import { getAuthUser } from "@/lib/auth-middleware";

// ─── POST /api/checkin ───────────────────────────────────────────────────────

describe("POST /api/checkin", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { POST } = await import("@/app/api/checkin/route");
    const request = new Request("http://localhost:3000/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: "550e8400-e29b-41d4-a716-446655440000" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid body (not a UUID)", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "user-1" });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "user-1" }, error: null }),
    });

    const { POST } = await import("@/app/api/checkin/route");
    const request = new Request("http://localhost:3000/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: "not-a-uuid" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 403 when user is not an organizer", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "user-1" });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const { POST } = await import("@/app/api/checkin/route");
    const request = new Request("http://localhost:3000/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: "550e8400-e29b-41d4-a716-446655440000" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("returns 404 for unknown ticket code", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-001" });

    // First call: organizer lookup succeeds
    // Second call: ticket lookup returns null
    const mockSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: "org-001" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "Not found" } });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockSingle,
    });

    const { POST } = await import("@/app/api/checkin/route");
    const request = new Request("http://localhost:3000/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: "550e8400-e29b-41d4-a716-446655440000" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Ticket not found");
  });

  it("returns 403 for ticket from event the organizer doesn't own", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-001" });

    const mockTicket = {
      id: "ticket-001",
      event_id: "event-001",
      unique_code: "550e8400-e29b-41d4-a716-446655440000",
      checked_in_at: null,
      holder_name: "João Silva",
      event: { title: "Test Event", organizer_id: "org-999" },
    };

    // First call: organizer lookup succeeds
    // Second call: ticket lookup returns ticket with different organizer
    const mockSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: "org-001" }, error: null })
      .mockResolvedValueOnce({ data: mockTicket, error: null });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockSingle,
    });

    const { POST } = await import("@/app/api/checkin/route");
    const request = new Request("http://localhost:3000/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: "550e8400-e29b-41d4-a716-446655440000" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 409 for already checked-in ticket", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-001" });

    const mockTicket = {
      id: "ticket-001",
      event_id: "event-001",
      unique_code: "550e8400-e29b-41d4-a716-446655440000",
      checked_in_at: "2026-06-29T12:00:00Z",
      holder_name: "João Silva",
      event: { title: "Test Event", organizer_id: "org-001" },
    };

    const mockSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: "org-001" }, error: null })
      .mockResolvedValueOnce({ data: mockTicket, error: null });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockSingle,
    });

    const { POST } = await import("@/app/api/checkin/route");
    const request = new Request("http://localhost:3000/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: "550e8400-e29b-41d4-a716-446655440000" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("Ticket already checked in");
  });

  it("successfully checks in a valid ticket", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-001" });

    const mockTicket = {
      id: "ticket-001",
      event_id: "event-001",
      unique_code: "550e8400-e29b-41d4-a716-446655440000",
      checked_in_at: null,
      holder_name: "Maria Souza",
      event: { title: "My Event", organizer_id: "org-001" },
    };

    const mockSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: "org-001" }, error: null })
      .mockResolvedValueOnce({ data: mockTicket, error: null });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockSingle,
    });

    mockSupabase.rpc.mockResolvedValue({
      data: { checked_in_at: "2026-06-29T15:00:00Z" },
      error: null,
    });

    const { POST } = await import("@/app/api/checkin/route");
    const request = new Request("http://localhost:3000/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: "550e8400-e29b-41d4-a716-446655440000" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.ticket_id).toBe("ticket-001");
    expect(body.data.holder_name).toBe("Maria Souza");
    expect(body.data.event_name).toBe("My Event");
    expect(body.data.checked_in_at).toBe("2026-06-29T15:00:00Z");

    // Verify RPC was called with correct params
    expect(mockSupabase.rpc).toHaveBeenCalledWith("checkin_ticket", {
      p_ticket_id: "ticket-001",
      p_event_id: "event-001",
      p_checked_in_by: "org-001",
      p_type: "entry",
    });
  });

  it("returns 500 when RPC fails", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-001" });

    const mockTicket = {
      id: "ticket-001",
      event_id: "event-001",
      unique_code: "550e8400-e29b-41d4-a716-446655440000",
      checked_in_at: null,
      holder_name: "Carlos",
      event: { title: "Event", organizer_id: "org-001" },
    };

    const mockSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: "org-001" }, error: null })
      .mockResolvedValueOnce({ data: mockTicket, error: null });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockSingle,
    });

    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: new Error("Database connection failed"),
    });

    const { POST } = await import("@/app/api/checkin/route");
    const request = new Request("http://localhost:3000/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_code: "550e8400-e29b-41d4-a716-446655440000" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(500);
  });
});

// ─── GET /api/events/:slug/checkins (polling endpoint) ───────────────────────

describe("GET /api/events/:slug/checkins", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { GET } = await import("@/app/api/events/[slug]/checkins/route");
    const request = new Request("http://localhost:3000/api/events/my-event/checkins");
    const response = await GET(request, {
      params: Promise.resolve({ slug: "my-event" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 404 for non-existent event", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-001" });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
    });

    const { GET } = await import("@/app/api/events/[slug]/checkins/route");
    const request = new Request("http://localhost:3000/api/events/nonexistent/checkins");
    const response = await GET(request, {
      params: Promise.resolve({ slug: "nonexistent" }),
    });
    expect(response.status).toBe(404);
  });

  it("returns 403 when organizer doesn't own the event", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-001" });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "event-001", organizer_id: "org-999", title: "Not Mine" },
        error: null,
      }),
    });

    const { GET } = await import("@/app/api/events/[slug]/checkins/route");
    const request = new Request("http://localhost:3000/api/events/not-mine/checkins");
    const response = await GET(request, {
      params: Promise.resolve({ slug: "not-mine" }),
    });
    expect(response.status).toBe(403);
  });

  it("returns ticket list for the event owner", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-001" });

    const mockTickets = [
      {
        id: "ticket-001",
        unique_code: "550e8400-e29b-41d4-a716-446655440001",
        holder_name: "Alice",
        holder_email: "alice@test.com",
        checked_in_at: null,
      },
      {
        id: "ticket-002",
        unique_code: "550e8400-e29b-41d4-a716-446655440002",
        holder_name: "Bob",
        holder_email: "bob@test.com",
        checked_in_at: "2026-06-29T14:00:00Z",
      },
    ];

    // First call: event lookup
    // Second call: ticket count
    // Third call: ticket fetch
    const mockSingle = vi
      .fn()
      .mockResolvedValueOnce({
        data: { id: "event-001", organizer_id: "org-001", title: "My Event" },
        error: null,
      });

    // Builder for tickets chain — detects count vs data queries
    function ticketsBuilder() {
      let isCountQuery = false;
      return {
        select: vi.fn((_cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count === "exact") {
            isCountQuery = true;
          }
          return this;
        }),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: mockTickets, error: null }),
      };
    }

    // The `select("*", { count: "exact", head: true }).eq(...)` chain
    // needs to resolve to { count, error }, not { data, error }.
    // We handle this by making `select` detect the count query and
    // having `eq` short-circuit with the count result.
    let callIndex = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "events") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: mockSingle,
        };
      }
      if (table === "tickets") {
        callIndex++;
        if (callIndex === 1) {
          // Count query: select("*", { count: "exact", head: true }).eq(...)
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: mockTickets.length, error: null }),
          };
        }
        // Data query: select(...).eq(...).order(...).range(...)
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockResolvedValue({ data: mockTickets, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(),
        order: vi.fn(),
        range: vi.fn(),
      };
    });

    const { GET } = await import("@/app/api/events/[slug]/checkins/route");
    const request = new Request("http://localhost:3000/api/events/my-event/checkins");
    const response = await GET(request, {
      params: Promise.resolve({ slug: "my-event" }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.event.title).toBe("My Event");
    expect(body.data.tickets).toHaveLength(2);
    expect(body.data.tickets[0].holder_name).toBe("Alice");
    expect(body.data.tickets[1].checked_in_at).toBe("2026-06-29T14:00:00Z");
    expect(body.data.pagination.total).toBe(2);
    expect(body.data.pagination.has_more).toBe(false);
  });

  it("returns empty ticket array when no tickets exist", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-001" });

    const mockSingle = vi
      .fn()
      .mockResolvedValueOnce({
        data: { id: "event-001", organizer_id: "org-001", title: "Empty Event" },
        error: null,
      });

    let callIndex = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "events") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: mockSingle,
        };
      }
      if (table === "tickets") {
        callIndex++;
        if (callIndex === 1) {
          // Count query
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
          };
        }
        // Data query
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(),
        order: vi.fn(),
        range: vi.fn(),
      };
    });

    const { GET } = await import("@/app/api/events/[slug]/checkins/route");
    const request = new Request("http://localhost:3000/api/events/empty/checkins");
    const response = await GET(request, {
      params: Promise.resolve({ slug: "empty" }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.tickets).toEqual([]);
    expect(body.data.pagination.total).toBe(0);
  });
});

// ─── GET /api/tickets/:unique_code (verification endpoint) ───────────────────

describe("GET /api/tickets/:unique_code", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 for unknown ticket code", async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
    });

    const { GET } = await import("@/app/api/tickets/[unique_code]/route");
    const request = new Request(
      "http://localhost:3000/api/tickets/550e8400-e29b-41d4-a716-446655440000"
    );
    const response = await GET(request, {
      params: Promise.resolve({ unique_code: "550e8400-e29b-41d4-a716-446655440000" }),
    });
    expect(response.status).toBe(404);
  });

  it("returns ticket details for a valid code", async () => {
    const mockTicket = {
      id: "ticket-001",
      holder_name: "João Silva",
      holder_email: "joao@test.com",
      checked_in_at: null,
      event: { title: "Test Event", start_at: "2026-07-15T20:00:00Z", venue_name: "Espaço Cultural" },
      tier: { name: "VIP" },
    };

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockTicket, error: null }),
    });

    const { GET } = await import("@/app/api/tickets/[unique_code]/route");
    const request = new Request(
      "http://localhost:3000/api/tickets/550e8400-e29b-41d4-a716-446655440000"
    );
    const response = await GET(request, {
      params: Promise.resolve({ unique_code: "550e8400-e29b-41d4-a716-446655440000" }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.holder_name).toBe("João Silva");
    expect(body.data.checked_in).toBe(false);
    expect(body.data.event.title).toBe("Test Event");
    expect(body.data.tier.name).toBe("VIP");
  });

  it("returns checked_in: true for a checked-in ticket", async () => {
    const mockTicket = {
      id: "ticket-002",
      holder_name: "Maria",
      holder_email: "maria@test.com",
      checked_in_at: "2026-06-29T15:00:00Z",
      event: { title: "Event", start_at: "2026-07-15T20:00:00Z", venue_name: "Local" },
      tier: { name: "General" },
    };

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockTicket, error: null }),
    });

    const { GET } = await import("@/app/api/tickets/[unique_code]/route");
    const request = new Request(
      "http://localhost:3000/api/tickets/550e8400-e29b-41d4-a716-446655440001"
    );
    const response = await GET(request, {
      params: Promise.resolve({ unique_code: "550e8400-e29b-41d4-a716-446655440001" }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.checked_in).toBe(true);
    expect(body.data.checked_in_at).toBe("2026-06-29T15:00:00Z");
  });
});