import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock utilities

/**
 * Creates a chainable mock for the Supabase query builder.
 * Every method call returns the same proxy, enabling `.eq().eq().single()` patterns.
 * The `single` property resolves to a function that returns a promise.
 */
function createMockChain(initialResult?: unknown) {
  const chain: Record<string, unknown> = {};
  return new Proxy(
    initialResult !== undefined
      ? () => Promise.resolve(initialResult)
      : () => undefined,
    {
      get(target, prop: string) {
        if (prop === "then") return undefined; // not a thenable
        if (prop === "single") {
          return vi.fn().mockResolvedValue(
            initialResult !== undefined ? initialResult : { data: null, error: null }
          );
        }
        if (!chain[prop]) {
          chain[prop] = createMockChain(initialResult);
        }
        return chain[prop];
      },
      apply() {
        return createMockChain(initialResult);
      },
    }
  );
}

// Mocks

const mockGetAuthUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/auth-middleware", () => ({
  getAuthUser: mockGetAuthUser,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: null, error: null }),
        getPublicUrl: vi.fn(() => ({
          data: { publicUrl: "https://example.com/img.jpg" },
        })),
      })),
    },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// POST /api/events

describe("POST /api/events", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);

    const { POST } = await import("@/app/api/events/route");
    const request = new Request("http://localhost:3000/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 for invalid body (missing required fields)", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });
    // Return an organizer to pass the 403 check
    mockFrom.mockImplementation((table: string) => {
      if (table === "organizers") {
        return createMockChain({ data: { id: "user-1" }, error: null });
      }
      return createMockChain();
    });

    const { POST } = await import("@/app/api/events/route");
    const request = new Request("http://localhost:3000/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Validation failed");
  });

  it("returns 403 when user is not an organizer", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });
    // No organizer record found
    mockFrom.mockImplementation((table: string) => {
      if (table === "organizers") {
        return createMockChain({ data: null, error: null });
      }
      return createMockChain();
    });

    const { POST } = await import("@/app/api/events/route");
    const request = new Request("http://localhost:3000/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test Event",
        slug: "test-event",
        start_at: "2025-12-01T18:00:00Z",
        end_at: "2025-12-01T23:00:00Z",
        timezone: "America/Sao_Paulo",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});

// GET /api/events/[slug]

describe("GET /api/events/[slug]", () => {
  it("returns 404 for non-existent slug", async () => {
    mockFrom.mockReturnValue(
      createMockChain({ data: null, error: { message: "Not found" } })
    );

    const { GET } = await import("@/app/api/events/[slug]/route");
    const request = new Request("http://localhost:3000/api/events/non-existent");
    const response = await GET(request, { params: Promise.resolve({ slug: "non-existent" }) });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Event not found");
  });

  it("returns 200 for valid slug with available tiers", async () => {
    mockFrom.mockReturnValue(
      createMockChain({
        data: {
          id: "evt-1",
          title: "Test Event",
          slug: "test-event",
          status: "published",
          description: "A test event",
          venue_name: "Test Venue",
          venue_address: "Test Address",
          start_at: "2025-12-01T18:00:00Z",
          end_at: "2025-12-01T23:00:00Z",
          timezone: "America/Sao_Paulo",
          cover_image_url: null,
          tiers: [
            {
              id: "tier-1",
              name: "General",
              price_cents: 2500,
              quantity_total: 100,
              quantity_sold: 30,
              sale_start_at: null,
              sale_end_at: null,
            },
          ],
        },
        error: null,
      })
    );

    const { GET } = await import("@/app/api/events/[slug]/route");
    const request = new Request("http://localhost:3000/api/events/test-event");
    const response = await GET(request, { params: Promise.resolve({ slug: "test-event" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.title).toBe("Test Event");
    expect(body.data.tiers).toHaveLength(1);
    expect(body.data.tiers[0].name).toBe("General");
  });

  it("includes Cache-Control header", async () => {
    mockFrom.mockReturnValue(
      createMockChain({
        data: {
          id: "evt-1",
          title: "Test",
          slug: "test",
          status: "published",
          start_at: "2025-12-01T18:00:00Z",
          end_at: "2025-12-01T23:00:00Z",
          timezone: "America/Sao_Paulo",
          tiers: [],
        },
        error: null,
      })
    );

    const { GET } = await import("@/app/api/events/[slug]/route");
    const request = new Request("http://localhost:3000/api/events/test");
    const response = await GET(request, { params: Promise.resolve({ slug: "test" }) });
    expect(response.status).toBe(200);
    const cacheControl = response.headers.get("Cache-Control");
    expect(cacheControl).toBeTruthy();
    expect(cacheControl).toMatch(/public/);
  });
});

// PATCH /api/events/[slug]

describe("PATCH /api/events/[slug]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);

    const { PATCH } = await import("@/app/api/events/[slug]/route");
    const request = new Request("http://localhost:3000/api/events/test-event", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated" }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ slug: "test-event" }) });
    expect(response.status).toBe(401);
  });

  it("returns 404 for non-existent event", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });
    mockFrom.mockReturnValue(
      createMockChain({ data: null, error: { message: "Not found" } })
    );

    const { PATCH } = await import("@/app/api/events/[slug]/route");
    const request = new Request("http://localhost:3000/api/events/non-existent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated" }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ slug: "non-existent" }) });
    expect(response.status).toBe(404);
  });

  it("returns 403 when not the organizer", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-2", email: "other@test.com" });
    mockFrom.mockReturnValue(
      createMockChain({
        data: { id: "evt-1", organizer_id: "user-1", status: "draft" },
        error: null,
      })
    );

    const { PATCH } = await import("@/app/api/events/[slug]/route");
    const request = new Request("http://localhost:3000/api/events/test-event", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated" }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ slug: "test-event" }) });
    expect(response.status).toBe(403);
  });

  it("returns 400 when event is not draft", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });
    mockFrom.mockReturnValue(
      createMockChain({
        data: { id: "evt-1", organizer_id: "user-1", status: "published" },
        error: null,
      })
    );

    const { PATCH } = await import("@/app/api/events/[slug]/route");
    const request = new Request("http://localhost:3000/api/events/test-event", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated" }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ slug: "test-event" }) });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/draft/i);
  });
});

// POST /api/events/[slug]/publish

describe("POST /api/events/[slug]/publish", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);

    const { POST } = await import("@/app/api/events/[slug]/publish/route");
    const request = new Request(
      "http://localhost:3000/api/events/test-event/publish",
      { method: "POST" }
    );
    const response = await POST(request, {
      params: Promise.resolve({ slug: "test-event" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 404 for non-existent event", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });
    mockFrom.mockReturnValue(
      createMockChain({ data: null, error: { message: "Not found" } })
    );

    const { POST } = await import("@/app/api/events/[slug]/publish/route");
    const request = new Request(
      "http://localhost:3000/api/events/non-existent/publish",
      { method: "POST" }
    );
    const response = await POST(request, {
      params: Promise.resolve({ slug: "non-existent" }),
    });
    expect(response.status).toBe(404);
  });

  it("returns 400 when event is not draft", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });
    // First call to .from("events") for the event lookup
    const mockChain = createMockChain({
      data: { id: "evt-1", organizer_id: "user-1", status: "published" },
      error: null,
    });
    // Override to avoid calling .from("tiers") which would fail the "no tiers" check
    mockFrom.mockImplementation((table: string) => {
      if (table === "events") return mockChain;
      if (table === "tiers") return createMockChain({ data: null, error: null, count: 1 });
      return createMockChain();
    });

    const { POST } = await import("@/app/api/events/[slug]/publish/route");
    const request = new Request(
      "http://localhost:3000/api/events/test-event/publish",
      { method: "POST" }
    );
    const response = await POST(request, {
      params: Promise.resolve({ slug: "test-event" }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/draft/i);
  });
});

// POST /api/events/[slug]/cancel

describe("POST /api/events/[slug]/cancel", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);

    const { POST } = await import("@/app/api/events/[slug]/cancel/route");
    const request = new Request(
      "http://localhost:3000/api/events/test-event/cancel",
      { method: "POST" }
    );
    const response = await POST(request, {
      params: Promise.resolve({ slug: "test-event" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 400 when event is already canceled", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });
    mockFrom.mockReturnValue(
      createMockChain({
        data: { id: "evt-1", organizer_id: "user-1", status: "canceled" },
        error: null,
      })
    );

    const { POST } = await import("@/app/api/events/[slug]/cancel/route");
    const request = new Request(
      "http://localhost:3000/api/events/test-event/cancel",
      { method: "POST" }
    );
    const response = await POST(request, {
      params: Promise.resolve({ slug: "test-event" }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/already canceled/i);
  });
});

// POST /api/upload

describe("POST /api/upload", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);

    const { POST } = await import("@/app/api/upload/route");
    const formData = new FormData();
    formData.append(
      "file",
      new File(["test"], "test.jpg", { type: "image/jpeg" })
    );
    const request = new Request("http://localhost:3000/api/upload", {
      method: "POST",
      body: formData,
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 when no file is provided", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });

    const { POST } = await import("@/app/api/upload/route");
    const request = new Request("http://localhost:3000/api/upload", {
      method: "POST",
      body: new FormData(),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/no file/i);
  });
});

// POST /api/events/[slug]/tiers

describe("POST /api/events/[slug]/tiers", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);

    const { POST } = await import("@/app/api/events/[slug]/tiers/route");
    const request = new Request("http://localhost:3000/api/events/test-event/tiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "VIP", price_cents: 5000, quantity_total: 100 }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ slug: "test-event" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 404 for non-existent event", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });
    mockFrom.mockReturnValue(
      createMockChain({ data: null, error: { message: "Not found" } })
    );

    const { POST } = await import("@/app/api/events/[slug]/tiers/route");
    const request = new Request("http://localhost:3000/api/events/non-existent/tiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "VIP", price_cents: 5000, quantity_total: 100 }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ slug: "non-existent" }),
    });
    expect(response.status).toBe(404);
  });

  it("returns 400 when event is not draft", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });
    mockFrom.mockReturnValue(
      createMockChain({
        data: { id: "evt-1", organizer_id: "user-1", status: "published" },
        error: null,
      })
    );

    const { POST } = await import("@/app/api/events/[slug]/tiers/route");
    const request = new Request("http://localhost:3000/api/events/test-event/tiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "VIP", price_cents: 5000, quantity_total: 100 }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ slug: "test-event" }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/draft/i);
  });

  it("adds a tier to a draft event", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });

    const createdTier = {
      id: "tier-1",
      event_id: "evt-1",
      name: "VIP",
      price_cents: 5000,
      quantity_total: 100,
      quantity_sold: 0,
    };

    const mockSingle = vi.fn()
      .mockResolvedValueOnce({ data: { id: "evt-1", organizer_id: "user-1", status: "draft" }, error: null })
      .mockResolvedValueOnce({ data: createdTier, error: null });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: mockSingle,
    });

    const { POST } = await import("@/app/api/events/[slug]/tiers/route");
    const request = new Request("http://localhost:3000/api/events/test-event/tiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "VIP", price_cents: 5000, quantity_total: 100 }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ slug: "test-event" }),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.name).toBe("VIP");
    expect(body.data.price_cents).toBe(5000);
  });
});

// POST /api/events (success case)

describe("POST /api/events (success case)", () => {
  it("creates event successfully", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });

    mockFrom.mockImplementation((table: string) => {
      if (table === "organizers") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: "user-1" }, error: null }),
        };
      }
      if (table === "events") {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
          single: vi.fn().mockResolvedValue({
            data: { id: "evt-1", title: "New Event", slug: "new-event", status: "draft" },
            error: null,
          }),
        };
      }
      return createMockChain();
    });

    const { POST } = await import("@/app/api/events/route");
    const request = new Request("http://localhost:3000/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New Event",
        slug: "new-event",
        start_at: "2025-12-01T18:00:00Z",
        end_at: "2025-12-01T23:00:00Z",
        timezone: "America/Sao_Paulo",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.title).toBe("New Event");
    expect(body.data.status).toBe("draft");
  });
});

// GET /api/events/[slug] edge cases

describe("GET /api/events/[slug] edge cases", () => {
  it("returns 404 for draft event without include_drafts", async () => {
    mockFrom.mockReturnValue(
      createMockChain({ data: null, error: { message: "Not found" } })
    );

    const { GET } = await import("@/app/api/events/[slug]/route");
    const request = new Request("http://localhost:3000/api/events/draft-event");
    const response = await GET(request, { params: Promise.resolve({ slug: "draft-event" }) });
    expect(response.status).toBe(404);
  });

  it("returns event with include_drafts for owner", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "org-001", email: "org@test.com" });

    const draftEvent = {
      id: "evt-1",
      title: "Draft Event",
      slug: "draft-event",
      status: "draft",
      organizer_id: "org-001",
      description: "",
      venue_name: "",
      venue_address: "",
      start_at: "2025-12-01T18:00:00Z",
      end_at: "2025-12-01T23:00:00Z",
      timezone: "America/Sao_Paulo",
      cover_image_url: null,
      tiers: [],
    };

    mockFrom.mockReturnValue(createMockChain({ data: draftEvent, error: null }));

    const { GET } = await import("@/app/api/events/[slug]/route");
    const request = new NextRequest(
      new URL("http://localhost:3000/api/events/draft-event?include_drafts=true")
    );
    const response = await GET(request, { params: Promise.resolve({ slug: "draft-event" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.title).toBe("Draft Event");
    expect(body.data.status).toBe("draft");
    expect(body.data.organizer_id).toBeUndefined();
  });

  it("returns 404 for include_drafts when caller is not owner", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "other-org", email: "other@test.com" });

    mockFrom.mockReturnValue(
      createMockChain({
        data: { id: "evt-1", title: "Draft", slug: "draft", status: "draft", organizer_id: "org-001", start_at: "2025-12-01T18:00:00Z", end_at: "2025-12-01T23:00:00Z", timezone: "America/Sao_Paulo", tiers: [] },
        error: null,
      })
    );

    const { GET } = await import("@/app/api/events/[slug]/route");
    const request = new NextRequest(
      new URL("http://localhost:3000/api/events/draft?include_drafts=true")
    );
    const response = await GET(request, { params: Promise.resolve({ slug: "draft" }) });
    expect(response.status).toBe(404);
  });

  it("strips organizer_id from public response", async () => {
    mockFrom.mockReturnValue(
      createMockChain({
        data: {
          id: "evt-1",
          title: "Public", slug: "public", status: "published",
          organizer_id: "org-secret",
          start_at: "2025-12-01T18:00:00Z",
          end_at: "2025-12-01T23:00:00Z",
          timezone: "America/Sao_Paulo",
          tiers: [],
        },
        error: null,
      })
    );

    const { GET } = await import("@/app/api/events/[slug]/route");
    const request = new Request("http://localhost:3000/api/events/public");
    const response = await GET(request, { params: Promise.resolve({ slug: "public" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.organizer_id).toBeUndefined();
  });
});

// PATCH /api/events/[slug] success and error cases

describe("PATCH /api/events/[slug] additional cases", () => {
  it("updates event and returns updated data", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });

    const mockSingle = vi.fn()
      .mockResolvedValueOnce({ data: { id: "evt-1", organizer_id: "user-1", status: "draft" }, error: null })
      .mockResolvedValueOnce({ data: { id: "evt-1", title: "Updated", slug: "test-event" }, error: null });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: mockSingle,
    });

    const { PATCH } = await import("@/app/api/events/[slug]/route");
    const request = new Request("http://localhost:3000/api/events/test-event", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated" }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ slug: "test-event" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.title).toBe("Updated");
  });

  it("returns 409 for duplicate slug", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });

    const mockSingle = vi.fn()
      .mockResolvedValueOnce({ data: { id: "evt-1", organizer_id: "user-1", status: "draft" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate key" } });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: mockSingle,
    });

    const { PATCH } = await import("@/app/api/events/[slug]/route");
    const request = new Request("http://localhost:3000/api/events/test-event", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "already-used" }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ slug: "test-event" }) });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain("slug already exists");
  });
});

// POST /api/events/[slug]/publish additional cases

describe("POST /api/events/[slug]/publish additional cases", () => {
  it("returns 403 when not the organizer", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-2", email: "other@test.com" });
    mockFrom.mockReturnValue(
      createMockChain({
        data: { id: "evt-1", organizer_id: "user-1", status: "draft" },
        error: null,
      })
    );

    const { POST } = await import("@/app/api/events/[slug]/publish/route");
    const request = new Request("http://localhost:3000/api/events/test-event/publish", { method: "POST" });
    const response = await POST(request, { params: Promise.resolve({ slug: "test-event" }) });
    expect(response.status).toBe(403);
  });

  it("returns 400 when event has no tiers", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });

    mockFrom.mockImplementation((table: string) => {
      if (table === "events") {
        return createMockChain({
          data: { id: "evt-1", organizer_id: "user-1", status: "draft" },
          error: null,
        });
      }
      if (table === "tiers") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: null, count: 0 }),
        };
      }
      return createMockChain();
    });

    const { POST } = await import("@/app/api/events/[slug]/publish/route");
    const request = new Request("http://localhost:3000/api/events/no-tiers/publish", { method: "POST" });
    const response = await POST(request, { params: Promise.resolve({ slug: "no-tiers" }) });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/tier/i);
  });

  it("publishes event successfully", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });

    const mockSingle = vi.fn()
      .mockResolvedValueOnce({ data: { id: "evt-1", organizer_id: "user-1", status: "draft" }, error: null })
      .mockResolvedValueOnce({ data: { id: "evt-1", status: "published" }, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "events") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          single: mockSingle,
        };
      }
      if (table === "tiers") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: null, count: 2 }),
        };
      }
      return createMockChain();
    });

    const { POST } = await import("@/app/api/events/[slug]/publish/route");
    const request = new Request("http://localhost:3000/api/events/my-event/publish", { method: "POST" });
    const response = await POST(request, { params: Promise.resolve({ slug: "my-event" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("published");
  });
});

// POST /api/events/[slug]/cancel additional cases

describe("POST /api/events/[slug]/cancel additional cases", () => {
  it("returns 403 when not the organizer", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-2", email: "other@test.com" });
    mockFrom.mockReturnValue(
      createMockChain({
        data: { id: "evt-1", organizer_id: "user-1", status: "published" },
        error: null,
      })
    );

    const { POST } = await import("@/app/api/events/[slug]/cancel/route");
    const request = new Request("http://localhost:3000/api/events/test-event/cancel", { method: "POST" });
    const response = await POST(request, { params: Promise.resolve({ slug: "test-event" }) });
    expect(response.status).toBe(403);
  });

  it("returns 404 for non-existent event", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });
    mockFrom.mockReturnValue(createMockChain({ data: null, error: { message: "Not found" } }));

    const { POST } = await import("@/app/api/events/[slug]/cancel/route");
    const request = new Request("http://localhost:3000/api/events/nonexistent/cancel", { method: "POST" });
    const response = await POST(request, { params: Promise.resolve({ slug: "nonexistent" }) });
    expect(response.status).toBe(404);
  });

  it("cancels event successfully", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });

    const mockSingle = vi.fn()
      .mockResolvedValueOnce({ data: { id: "evt-1", organizer_id: "user-1", status: "published" }, error: null })
      .mockResolvedValueOnce({ data: { id: "evt-1", status: "canceled" }, error: null });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: mockSingle,
    });

    const { POST } = await import("@/app/api/events/[slug]/cancel/route");
    const request = new Request("http://localhost:3000/api/events/my-event/cancel", { method: "POST" });
    const response = await POST(request, { params: Promise.resolve({ slug: "my-event" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("canceled");
  });
});

// DELETE /api/events/[slug]

describe("DELETE /api/events/[slug]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);

    const { DELETE } = await import("@/app/api/events/[slug]/route");
    const request = new Request("http://localhost:3000/api/events/test-event", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ slug: "test-event" }) });
    expect(response.status).toBe(401);
  });

  it("returns 404 for non-existent event", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });
    mockFrom.mockReturnValue(createMockChain({ data: null, error: { message: "Not found" } }));

    const { DELETE } = await import("@/app/api/events/[slug]/route");
    const request = new Request("http://localhost:3000/api/events/nonexistent", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ slug: "nonexistent" }) });
    expect(response.status).toBe(404);
  });

  it("returns 403 when not the organizer", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-2", email: "other@test.com" });
    mockFrom.mockReturnValue(createMockChain({ data: { id: "evt-1", organizer_id: "user-1", status: "draft" }, error: null }));

    const { DELETE } = await import("@/app/api/events/[slug]/route");
    const request = new Request("http://localhost:3000/api/events/test-event", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ slug: "test-event" }) });
    expect(response.status).toBe(403);
  });

  it("returns 400 when event is not draft", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });
    mockFrom.mockReturnValue(createMockChain({ data: { id: "evt-1", organizer_id: "user-1", status: "published" }, error: null }));

    const { DELETE } = await import("@/app/api/events/[slug]/route");
    const request = new Request("http://localhost:3000/api/events/test-event", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ slug: "test-event" }) });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/draft/i);
  });

  it("deletes draft event successfully", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1", email: "test@test.com" });

    const mockSingle = vi.fn()
      .mockResolvedValueOnce({ data: { id: "evt-1", organizer_id: "user-1", status: "draft" }, error: null });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      single: mockSingle,
    });

    const { DELETE } = await import("@/app/api/events/[slug]/route");
    const request = new Request("http://localhost:3000/api/events/my-draft", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ slug: "my-draft" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.deleted).toBe(true);
  });
});