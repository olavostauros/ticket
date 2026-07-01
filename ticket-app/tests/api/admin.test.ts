import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const mockSupabase = { from: vi.fn() };

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => mockSupabase,
}));

vi.mock("@/lib/auth-middleware", () => ({
  getAuthUser: vi.fn(),
}));

import { getAuthUser } from "@/lib/auth-middleware";

/** Builder that supports chained .eq().eq() and can be await-ed. */
function makeBuilder(result: any) {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: (onfulfilled: any) => Promise.resolve(result).then(onfulfilled),
  };
  return builder;
}

/** Shortcut for a resolved query builder ({ error: null }). */
function makeOkBuilder() {
  return makeBuilder({ error: null });
}

describe("POST /api/admin/delete-attendee-data", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { POST } = await import("@/app/api/admin/delete-attendee-data/route");
    const request = new Request("http://localhost:3000/api/admin/delete-attendee-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "attendee@example.com" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user is not an organizer", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "regular-user", email: "user@test.com" });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "organizers") {
        return makeBuilder({ data: null, error: null });
      }
      return makeOkBuilder();
    });

    const { POST } = await import("@/app/api/admin/delete-attendee-data/route");
    const request = new Request("http://localhost:3000/api/admin/delete-attendee-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "attendee@example.com" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Only organizers can request data deletion");
  });

  it("returns 400 for missing email field", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-1", email: "org@test.com" });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "organizers") {
        return makeBuilder({ data: { id: "org-1" }, error: null });
      }
      return makeOkBuilder();
    });

    const { POST } = await import("@/app/api/admin/delete-attendee-data/route");
    const request = new Request("http://localhost:3000/api/admin/delete-attendee-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid email", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-1", email: "org@test.com" });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "organizers") {
        return makeBuilder({ data: { id: "org-1" }, error: null });
      }
      return makeOkBuilder();
    });

    const { POST } = await import("@/app/api/admin/delete-attendee-data/route");
    const request = new Request("http://localhost:3000/api/admin/delete-attendee-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 500 when orders update fails", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-1", email: "org@test.com" });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "organizers") {
        return makeBuilder({ data: { id: "org-1" }, error: null });
      }
      if (table === "orders") {
        return makeBuilder({ error: { message: "DB connection failed" } });
      }
      return makeOkBuilder();
    });

    const { POST } = await import("@/app/api/admin/delete-attendee-data/route");
    const request = new Request("http://localhost:3000/api/admin/delete-attendee-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "att@test.com" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Failed to delete attendee data");
  });

  it("returns 500 when tickets update fails (after orders succeed)", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-1", email: "org@test.com" });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "organizers") {
        return makeBuilder({ data: { id: "org-1" }, error: null });
      }
      if (table === "tickets") {
        return makeBuilder({ error: { message: "Ticket DB error" } });
      }
      // Orders succeed, tickets fail
      return makeOkBuilder();
    });

    const { POST } = await import("@/app/api/admin/delete-attendee-data/route");
    const request = new Request("http://localhost:3000/api/admin/delete-attendee-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "att@test.com" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Failed to delete ticket data");
  });

  it("successfully anonymizes attendee data for a valid request", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-1", email: "org@test.com" });

    // Track update arguments
    let ordersUpdateArgs: any = null;
    let ticketsUpdateArgs: any = null;

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "organizers") {
        return makeBuilder({ data: { id: "org-1" }, error: null });
      }
      if (table === "orders") {
        const builder = makeOkBuilder();
        const origUpdate = builder.update;
        builder.update = vi.fn().mockImplementation((args: any) => {
          ordersUpdateArgs = args;
          return builder;
        });
        return builder;
      }
      if (table === "tickets") {
        const builder = makeOkBuilder();
        const origUpdate = builder.update;
        builder.update = vi.fn().mockImplementation((args: any) => {
          ticketsUpdateArgs = args;
          return builder;
        });
        return builder;
      }
      return makeOkBuilder();
    });

    const testEmail = "attendee@example.com";

    const { POST } = await import("@/app/api/admin/delete-attendee-data/route");
    const request = new Request("http://localhost:3000/api/admin/delete-attendee-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.deleted).toBe(true);
    expect(body.data.email).toBe(testEmail);

    // Verify orders were anonymized with a consistent identifier
    expect(ordersUpdateArgs).toEqual(
      expect.objectContaining({
        attendee_name: null,
        attendee_email: expect.stringMatching(/^deleted-\d+@anonymized\.ticket\.app$/),
      })
    );
    // Verify the same anonymized email was used for tickets
    expect(ticketsUpdateArgs).toEqual(
      expect.objectContaining({
        holder_name: "Removido",
        holder_email: ordersUpdateArgs.attendee_email,
      })
    );

    // Verify organizer scoping: both orders and tickets are scoped to org-1
    const ordersEqCalls = vi.mocked(mockSupabase.from).mock.results
      .filter((r) => r.value === mockSupabase.from.mock.results.find((r2) => r2.value && r2.value.eq)?.value);
  });

  it("handles email that has no matching records (no-op success)", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-1", email: "org@test.com" });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "organizers") {
        return makeBuilder({ data: { id: "org-1" }, error: null });
      }
      return makeOkBuilder();
    });

    const { POST } = await import("@/app/api/admin/delete-attendee-data/route");
    const request = new Request("http://localhost:3000/api/admin/delete-attendee-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nonexistent@test.com" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.deleted).toBe(true);
  });
});