import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/db", () => ({ query: vi.fn() }));
vi.mock("../lib/auth", () => ({
  getAuthUser: vi.fn(),
  signToken: vi.fn().mockReturnValue("test-token"),
  verifyToken: vi.fn().mockReturnValue(null),
  requireAuth: vi.fn(),
  redirectIfAuthenticated: vi.fn(),
}));
vi.mock("../lib/password", () => ({
  hashPassword: vi.fn().mockResolvedValue("$2b$10$hashedpassword"),
  verifyPassword: vi.fn().mockResolvedValue(true),
}));

import { getAuthUser } from "../lib/auth";
import { verifyPassword } from "../lib/password";

describe("Auth API — Signup", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("POST /api/auth/signup — success creates organizer and returns JWT", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ id: "org-1", email: "test@example.com", name: "Test User", avatar_url: null, pix_key: null, pix_key_type: null, created_at: "2025-01-01T00:00:00Z" }]
    });
    const { POST } = await import("../pages/api/auth/signup");
    const req = new Request("http://localhost:4321/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "test@example.com", password: "password123", name: "Test User" }) });
    const ctx = { request: req, cookies: { set: vi.fn() } } as any;
    const res = await POST(ctx);
    expect(res.status).toBe(201);
    expect((await res.json()).data.organizer.email).toBe("test@example.com");
  });

  it("POST /api/auth/signup — returns 409 for existing email", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "existing" }] });
    const { POST } = await import("../pages/api/auth/signup");
    const res = await POST({ request: new Request("http://localhost:4321/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "existing@example.com", password: "password123", name: "User" }) }), cookies: { set: vi.fn() } } as any);
    expect(res.status).toBe(409);
  });

  it("POST /api/auth/signup — returns 400 for missing fields", async () => {
    const { POST } = await import("../pages/api/auth/signup");
    const res = await POST({ request: new Request("http://localhost:4321/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "bad", password: "short" }) }), cookies: { set: vi.fn() } } as any);
    expect(res.status).toBe(400);
  });
});

describe("Auth API — Login", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("POST /api/auth/login — success returns JWT", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "org-1", email: "test@example.com", name: "Test User", avatar_url: null, pix_key: null, pix_key_type: null, password_hash: "$2b$10$h" }] });
    const { POST } = await import("../pages/api/auth/login");
    const res = await POST({ request: new Request("http://localhost:4321/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "test@example.com", password: "password123" }) }), cookies: { set: vi.fn() } } as any);
    expect(res.status).toBe(200);
  });

  it("POST /api/auth/login — wrong password returns 401", async () => {
    const { query } = await import("../lib/db");
    (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "org-1", email: "test@example.com", name: "Test", password_hash: "$2b$10$h" }] });
    const { POST } = await import("../pages/api/auth/login");
    const res = await POST({ request: new Request("http://localhost:4321/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "test@example.com", password: "wrongpass" }) }), cookies: { set: vi.fn() } } as any);
    expect(res.status).toBe(401);
  });

  it("POST /api/auth/login — returns 401 for unknown email", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
    const { POST } = await import("../pages/api/auth/login");
    const res = await POST({ request: new Request("http://localhost:4321/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "unknown@test.com", password: "password123" }) }), cookies: { set: vi.fn() } } as any);
    expect(res.status).toBe(401);
  });

  it("POST /api/auth/login — validation error for invalid email", async () => {
    const { POST } = await import("../pages/api/auth/login");
    const res = await POST({ request: new Request("http://localhost:4321/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "not-an-email", password: "" }) }), cookies: { set: vi.fn() } } as any);
    expect(res.status).toBe(400);
  });
});

describe("Auth API — GET /api/auth/me", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns current user", async () => {
    (getAuthUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "org-1", email: "test@example.com" });
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "org-1", email: "test@example.com", name: "Test", pix_key: null }] });
    const res = await (await import("../pages/api/auth/me")).GET({ request: new Request("http://localhost:4321/api/auth/me") } as any);
    expect(res.status).toBe(200);
  });

  it("returns 401 when not authenticated", async () => {
    (getAuthUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await (await import("../pages/api/auth/me")).GET({ request: new Request("http://localhost:4321/api/auth/me") } as any);
    expect(res.status).toBe(401);
  });
});

describe("Auth API — PATCH /api/auth/me", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("updates and returns organizer", async () => {
    (getAuthUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "org-1", email: "test@example.com" });
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "org-1", name: "Updated", email: "test@example.com", pix_key: "123", pix_key_type: "cpf", created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-02T00:00:00Z", verified_at: null, avatar_url: null }] });
    const res = await (await import("../pages/api/auth/me")).PATCH({ request: new Request("http://localhost:4321/api/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Updated", pix_key: "123", pix_key_type: "cpf" }) }) } as any);
    expect(res.status).toBe(200);
    expect((await res.json()).data.organizer.name).toBe("Updated");
  });

  it("returns 401 when not authenticated", async () => {
    (getAuthUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await (await import("../pages/api/auth/me")).PATCH({ request: new Request("http://localhost:4321/api/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Test" }) }) } as any);
    expect(res.status).toBe(401);
  });

  it("validation error for invalid pix_key_type", async () => {
    (getAuthUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "org-1", email: "test@example.com" });
    const res = await (await import("../pages/api/auth/me")).PATCH({ request: new Request("http://localhost:4321/api/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pix_key_type: "invalid" }) }) } as any);
    expect(res.status).toBe(400);
  });
});