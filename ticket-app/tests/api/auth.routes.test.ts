import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const mockSupabase = { from: vi.fn(), auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn() } } };
const mockSupabaseAnon = { auth: vi.fn() };

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => mockSupabase,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabaseAnon),
}));

vi.mock("@/lib/auth-middleware", () => ({
  getAuthUser: vi.fn(),
}));

import { getAuthUser } from "@/lib/auth-middleware";
import { resetRateLimiter } from "@/lib/rate-limit";

// ─── POST /api/auth/login ─────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimiter();
  });

  it("returns 400 for invalid body (missing password)", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@test.com" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Validation failed");
  });

  it("returns 400 for invalid email", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bad-email", password: "secret123" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 401 for wrong credentials", async () => {
    mockSupabaseAnon.auth = {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "Invalid login credentials" },
      }),
    };

    const { POST } = await import("@/app/api/auth/login/route");
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@test.com", password: "wrongpass" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Email ou senha incorretos.");
  });

  it("returns 200 with organizer data and session cookie on success", async () => {
    const mockSession = {
      access_token: "mock-session-token",
      refresh_token: "mock-refresh",
    };

    mockSupabaseAnon.auth = {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: {
          user: { id: "user-1", email: "test@test.com" },
          session: mockSession,
        },
        error: null,
      }),
    };

    const mockOrganizer = {
      id: "user-1",
      email: "test@test.com",
      name: "Test User",
      avatar_url: null,
      pix_key: null,
      pix_key_type: null,
    };

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockOrganizer, error: null }),
    });

    const { POST } = await import("@/app/api/auth/login/route");
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@test.com", password: "correctpass" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.organizer.name).toBe("Test User");
    expect(body.data.organizer.email).toBe("test@test.com");

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("ticket_session=mock-session-token");
    expect(setCookie).toContain("Max-Age=");
  });
});

// ─── POST /api/auth/signup ────────────────────────────────────────────────

describe("POST /api/auth/signup", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimiter();
  });

  it("returns 400 for invalid body (short password)", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const request = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@test.com",
        password: "1234567",
        name: "Test",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 409 if auth user creation fails (e.g. duplicate email)", async () => {
    mockSupabase.auth.admin.createUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: "User already registered" },
    });

    const { POST } = await import("@/app/api/auth/signup/route");
    const request = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "existing@test.com",
        password: "supersecure123",
        name: "Existing",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("User already registered");
  });

  it("returns 500 if organizer insert fails and cleans up auth user", async () => {
    const userId = "new-user-id";

    mockSupabase.auth.admin.createUser = vi.fn().mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
    mockSupabase.auth.admin.deleteUser = vi.fn().mockResolvedValue({ error: null });

    mockSupabaseAnon.auth = {
      signInWithPassword: vi.fn(),
    };

    // Organizer insert fails
    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { message: "DB error" } }),
    });

    const { POST } = await import("@/app/api/auth/signup/route");
    const request = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "new@test.com",
        password: "supersecure123",
        name: "New User",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(500);

    // Auth user should be cleaned up
    expect(mockSupabase.auth.admin.deleteUser).toHaveBeenCalledWith(userId);
  });

  it("returns 201 with organizer data on success", async () => {
    const userId = "new-user-id";

    mockSupabase.auth.admin.createUser = vi.fn().mockResolvedValue({
      data: { user: { id: userId, email: "new@test.com" } },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    });

    // Sign in succeeds with confirmed email
    mockSupabaseAnon.auth = {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: {
          user: { id: userId, email: "new@test.com", email_confirmed_at: "2025-01-01T00:00:00Z" },
          session: { access_token: "new-session-token" },
        },
        error: null,
      }),
    };

    const { POST } = await import("@/app/api/auth/signup/route");
    const request = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "new@test.com",
        password: "supersecure123",
        name: "New User",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.data.id).toBe(userId);
    expect(body.data.name).toBe("New User");
    expect(body.data.needs_login).toBe(false);

    // Session cookie should be set
    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("ticket_session=new-session-token");
  });

  it("returns needs_login: true when email is not confirmed", async () => {
    const userId = "unconfirmed-user";

    mockSupabase.auth.admin.createUser = vi.fn().mockResolvedValue({
      data: { user: { id: userId, email: "unconfirmed@test.com" } },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    });

    // Sign in succeeds but email NOT confirmed
    mockSupabaseAnon.auth = {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: {
          user: { id: userId, email: "unconfirmed@test.com", email_confirmed_at: null },
          session: { access_token: "partial-session" },
        },
        error: null,
      }),
    };

    const { POST } = await import("@/app/api/auth/signup/route");
    const request = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "unconfirmed@test.com",
        password: "supersecure123",
        name: "Unconfirmed",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.data.needs_login).toBe(true);

    // No session cookie when email not confirmed
    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toBeNull();
  });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────

describe("GET /api/auth/me", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { GET } = await import("@/app/api/auth/me/route");
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns 404 when organizer profile does not exist", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "user-1", email: "test@test.com" });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
    });

    const { GET } = await import("@/app/api/auth/me/route");
    const response = await GET();
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Organizer not found");
  });

  it("returns organizer profile when authenticated", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "user-1", email: "test@test.com" });

    const mockOrganizer = {
      id: "user-1",
      email: "test@test.com",
      name: "Test User",
      avatar_url: null,
      pix_key: null,
      pix_key_type: null,
      verified_at: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockOrganizer, error: null }),
    });

    const { GET } = await import("@/app/api/auth/me/route");
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.organizer.name).toBe("Test User");
    expect(body.data.organizer.email).toBe("test@test.com");
  });
});

// ─── PATCH /api/auth/me ───────────────────────────────────────────────────

describe("PATCH /api/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { PATCH } = await import("@/app/api/auth/me/route");
    const request = new Request("http://localhost:3000/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    const response = await PATCH(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "user-1", email: "test@test.com" });

    const { PATCH } = await import("@/app/api/auth/me/route");
    const request = new Request("http://localhost:3000/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const response = await PATCH(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 400 for invalid profile data", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "user-1", email: "test@test.com" });

    const { PATCH } = await import("@/app/api/auth/me/route");
    const request = new Request("http://localhost:3000/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "a".repeat(101) }),
    });
    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });

  it("updates and returns the organizer profile", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "user-1", email: "test@test.com" });

    const updatedOrganizer = {
      id: "user-1",
      email: "test@test.com",
      name: "New Name",
      avatar_url: null,
      pix_key: "123.456.789-00",
      pix_key_type: "cpf",
      verified_at: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-06-01T00:00:00Z",
    };

    const eqResult = {
      error: null,
      single: vi.fn().mockResolvedValue({ data: updatedOrganizer, error: null }),
    };
    const chainedEq = vi.fn().mockReturnValue(eqResult);
    const mockUpdate = vi.fn().mockReturnThis();
    const mockSelect = vi.fn().mockReturnThis();

    mockSupabase.from.mockReturnValue({
      update: mockUpdate,
      select: mockSelect,
      eq: chainedEq,
      single: vi.fn(),
    });

    const { PATCH } = await import("@/app/api/auth/me/route");
    const request = new Request("http://localhost:3000/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New Name",
        pix_key: "123.456.789-00",
        pix_key_type: "cpf",
      }),
    });
    const response = await PATCH(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.organizer.name).toBe("New Name");
    expect(body.data.organizer.pix_key).toBe("123.456.789-00");
  });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────

describe("POST /api/auth/logout", () => {
  it("returns JSON with logged_out for API clients", async () => {
    const { POST } = await import("@/app/api/auth/logout/route");
    const request = new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: { accept: "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.logged_out).toBe(true);
  });

  it("clears the session cookie on logout", async () => {
    const { POST } = await import("@/app/api/auth/logout/route");
    const request = new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: { accept: "application/json" },
    });
    const response = await POST(request);

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("ticket_session=");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("returns a redirect for browser form submissions", async () => {
    const { POST } = await import("@/app/api/auth/logout/route");
    const request = new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: { accept: "text/html" },
    });
    const response = await POST(request);

    expect(response.status).toBe(307);

    const location = response.headers.get("Location");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    expect(location).toBe(appUrl + "/");

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("Max-Age=0");
  });
});