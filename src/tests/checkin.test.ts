import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/db", () => ({ query: vi.fn() }));
vi.mock("../lib/auth", () => ({ getAuthUser: vi.fn(), signToken: vi.fn(), verifyToken: vi.fn(), requireAuth: vi.fn(), redirectIfAuthenticated: vi.fn() }));

import { getAuthUser } from "../lib/auth";

const UUID_OK = "a1b2c3d4-e5f6-4890-abcd-ef1234567890";
const UUID_OK2 = "b2c3d4e5-f6a7-48a1-bcde-f12345678901";
const UUID_OK3 = "d4e5f6a7-b8c9-4480-9abc-123456789abc";
const UUID_NIL = "00000000-0000-0000-0000-000000000000";

describe("Check-in API — POST /api/checkin", () => {
  beforeEach(() => { vi.clearAllMocks(); (getAuthUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "org-1" }); });

  it("checks in a valid ticket", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "ticket-1", unique_code: UUID_OK, holder_name: "João", holder_email: "joao@test.com", checked_in_at: null, event_id: "event-1", event_title: "Test Event", organizer_id: "org-1" }] });
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    const { POST } = await import("../pages/api/checkin");
    const res = await POST({ request: new Request("http://localhost:4321/api/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket_code: UUID_OK }) }) } as any);
    expect(res.status).toBe(200);
    expect((await res.json()).data.checked_in).toBe(true);
  });

  it("returns re-entry for already checked-in ticket", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "ticket-1", unique_code: UUID_OK2, holder_name: "Maria", holder_email: "maria@test.com", checked_in_at: "2025-01-01T12:00:00Z", event_id: "event-1", event_title: "Test Event", organizer_id: "org-1" }] });
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    const { POST } = await import("../pages/api/checkin");
    const res = await POST({ request: new Request("http://localhost:4321/api/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket_code: UUID_OK2 }) }) } as any);
    expect(res.status).toBe(200);
    expect((await res.json()).data.already_checked_in).toBe(true);
  });

  it("returns 404 for non-existent ticket", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
    const { POST } = await import("../pages/api/checkin");
    const res = await POST({ request: new Request("http://localhost:4321/api/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket_code: UUID_NIL }) }) } as any);
    expect(res.status).toBe(404);
  });

  it("returns 403 for ticket from another organizer", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "ticket-2", unique_code: UUID_OK3, holder_name: "Pedro", holder_email: "pedro@test.com", checked_in_at: null, event_id: "event-2", event_title: "Other", organizer_id: "org-2" }] });
    const { POST } = await import("../pages/api/checkin");
    const res = await POST({ request: new Request("http://localhost:4321/api/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket_code: UUID_OK3 }) }) } as any);
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    (getAuthUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { POST } = await import("../pages/api/checkin");
    const res = await POST({ request: new Request("http://localhost:4321/api/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket_code: UUID_OK }) }) } as any);
    expect(res.status).toBe(401);
  });
});