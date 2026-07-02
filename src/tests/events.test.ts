import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/db", () => ({ query: vi.fn() }));
vi.mock("../lib/auth", () => ({ getAuthUser: vi.fn(), signToken: vi.fn(), verifyToken: vi.fn(), requireAuth: vi.fn(), redirectIfAuthenticated: vi.fn() }));

import { getAuthUser } from "../lib/auth";

describe("Events API", () => {
  beforeEach(() => { vi.clearAllMocks(); (getAuthUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "org-1" }); });

  it("POST /api/events — creates event", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "event-1", slug: "test-event", title: "Test", status: "draft" }] });
    const res = await (await import("../pages/api/events")).POST({ request: new Request("http://localhost:4321/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Test Event", slug: "test-event", start_at: "2025-06-01T14:00:00.000Z", end_at: "2025-06-01T22:00:00.000Z", timezone: "America/Sao_Paulo" }) }) } as any);
    expect(res.status).toBe(201);
  });

  it("POST /api/events — returns 401 when not authenticated", async () => {
    (getAuthUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await (await import("../pages/api/events")).POST({ request: new Request("http://localhost:4321/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Test" }) }) } as any);
    expect(res.status).toBe(401);
  });

  it("POST /api/events — returns 409 for duplicate slug", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ code: "23505" });
    const res = await (await import("../pages/api/events")).POST({ request: new Request("http://localhost:4321/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Test", slug: "dup", start_at: "2025-06-01T14:00:00.000Z", end_at: "2025-06-01T22:00:00.000Z", timezone: "America/Sao_Paulo" }) }) } as any);
    expect(res.status).toBe(409);
  });

  it("GET /api/events/[slug] — returns published event", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "event-1", slug: "my-event", title: "My Event", status: "published", description: "", venue_name: null, venue_address: null, start_at: "2025-06-01T14:00:00.000Z", end_at: "2025-06-01T22:00:00.000Z", timezone: "America/Sao_Paulo", cover_image_url: null, organizer_id: "org-1" }] });
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "tier-1", event_id: "event-1", name: "General", price_cents: 2500, quantity_total: 100, quantity_sold: 0, description: null, sale_start_at: null, sale_end_at: null, abacatepay_product_id: null }] });
    const res = await (await import("../pages/api/events/[slug]")).GET({ params: { slug: "my-event" }, request: new Request("http://localhost:4321/api/events/my-event") } as any);
    expect(res.status).toBe(200);
  });

  it("GET /api/events/[slug] — returns 404 for draft without include_drafts", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
    const res = await (await import("../pages/api/events/[slug]")).GET({ params: { slug: "draft-event" }, request: new Request("http://localhost:4321/api/events/draft-event") } as any);
    expect(res.status).toBe(404);
  });

  it("PATCH /api/events/[slug] — updates draft event", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "event-1", organizer_id: "org-1", status: "draft" }] });
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "event-1", title: "Updated Title", slug: "my-event", status: "draft" }] });
    const res = await (await import("../pages/api/events/[slug]")).PATCH({ params: { slug: "my-event" }, request: new Request("http://localhost:4321/api/events/my-event", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Updated Title" }) }) } as any);
    expect(res.status).toBe(200);
  });

  it("PATCH /api/events/[slug] — returns 403 when not owner", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "event-1", organizer_id: "org-2", status: "draft" }] });
    const res = await (await import("../pages/api/events/[slug]")).PATCH({ params: { slug: "my-event" }, request: new Request("http://localhost:4321/api/events/my-event", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Updated" }) }) } as any);
    expect(res.status).toBe(403);
  });

  it("PATCH /api/events/[slug] — returns 400 when not draft", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "event-1", organizer_id: "org-1", status: "published" }] });
    const res = await (await import("../pages/api/events/[slug]")).PATCH({ params: { slug: "my-event" }, request: new Request("http://localhost:4321/api/events/my-event", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Updated" }) }) } as any);
    expect(res.status).toBe(400);
  });

  it("PATCH /api/events/[slug] — returns 401 when not authenticated", async () => {
    (getAuthUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await (await import("../pages/api/events/[slug]")).PATCH({ params: { slug: "my-event" }, request: new Request("http://localhost:4321/api/events/my-event", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Updated" }) }) } as any);
    expect(res.status).toBe(401);
  });

  it("POST /api/events/[slug]/publish — publishes with tiers", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "event-1", organizer_id: "org-1", status: "draft" }] });
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ cnt: "2" }] });
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "event-1", status: "published" }] });
    const res = await (await import("../pages/api/events/[slug]/publish")).POST({ params: { slug: "my-event" }, request: new Request("http://localhost:4321/api/events/my-event/publish", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
  });

  it("POST /api/events/[slug]/publish — returns 400 when no tiers", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "event-1", organizer_id: "org-1", status: "draft" }] });
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ cnt: "0" }] });
    const res = await (await import("../pages/api/events/[slug]/publish")).POST({ params: { slug: "my-event" }, request: new Request("http://localhost:4321/api/events/my-event/publish", { method: "POST" }) } as any);
    expect(res.status).toBe(400);
  });

  it("POST /api/events/[slug]/cancel — cancels published event", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "event-1", organizer_id: "org-1", status: "published" }] });
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "event-1", status: "canceled" }] });
    const res = await (await import("../pages/api/events/[slug]/cancel")).POST({ params: { slug: "my-event" }, request: new Request("http://localhost:4321/api/events/my-event/cancel", { method: "POST" }) } as any);
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("canceled");
  });

  it("POST /api/events/[slug]/tiers — adds tier", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "event-1", organizer_id: "org-1", status: "draft" }] });
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "tier-1", name: "General", price_cents: 2500, quantity_total: 100 }] });
    const res = await (await import("../pages/api/events/[slug]/tiers")).POST({ params: { slug: "my-event" }, request: new Request("http://localhost:4321/api/events/my-event/tiers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "General", price_cents: 2500, quantity_total: 100 }) }) } as any);
    expect(res.status).toBe(201);
  });

  it("POST /api/events/[slug]/tiers — returns 400 for missing name", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "event-1", organizer_id: "org-1", status: "draft" }] });
    const res = await (await import("../pages/api/events/[slug]/tiers")).POST({ params: { slug: "my-event" }, request: new Request("http://localhost:4321/api/events/my-event/tiers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "", price_cents: 2500, quantity_total: 10 }) }) } as any);
    expect(res.status).toBe(400);
  });

  it("POST /api/events/[slug]/tiers — returns 403 for wrong owner", async () => {
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: "event-1", organizer_id: "org-2", status: "draft" }] });
    const res = await (await import("../pages/api/events/[slug]/tiers")).POST({ params: { slug: "my-event" }, request: new Request("http://localhost:4321/api/events/my-event/tiers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "General", price_cents: 2500, quantity_total: 100 }) }) } as any);
    expect(res.status).toBe(403);
  });
});