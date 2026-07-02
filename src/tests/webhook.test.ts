import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/db", () => ({ query: vi.fn() }));
vi.mock("../lib/abacatepay", () => ({ createCheckout: vi.fn(), verifyWebhookSignature: vi.fn() }));

describe("Webhook API — POST /api/webhooks/abacatepay", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("processes checkout.completed", async () => {
    const { verifyWebhookSignature } = await import("../lib/abacatepay");
    (verifyWebhookSignature as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    const res = await (await import("../pages/api/webhooks/abacatepay")).POST({ request: new Request("http://localhost:4321/api/webhooks/abacatepay", { method: "POST", headers: { "Content-Type": "application/json", "x-abacatepay-signature": "valid" }, body: JSON.stringify({ event: "checkout.completed", data: { id: "billing-1", reference: "TCK-X" } }) }) } as any);
    expect(res.status).toBe(200);
  });

  it("processes checkout.lost", async () => {
    const { verifyWebhookSignature } = await import("../lib/abacatepay");
    (verifyWebhookSignature as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const { query } = await import("../lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    const res = await (await import("../pages/api/webhooks/abacatepay")).POST({ request: new Request("http://localhost:4321/api/webhooks/abacatepay", { method: "POST", headers: { "Content-Type": "application/json", "x-abacatepay-signature": "valid" }, body: JSON.stringify({ event: "checkout.lost", data: { id: "billing-2", reference: "TCK-Y" } }) }) } as any);
    expect(res.status).toBe(200);
  });

  it("returns 401 for invalid signature", async () => {
    const { verifyWebhookSignature } = await import("../lib/abacatepay");
    (verifyWebhookSignature as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const res = await (await import("../pages/api/webhooks/abacatepay")).POST({ request: new Request("http://localhost:4321/api/webhooks/abacatepay", { method: "POST", headers: { "Content-Type": "application/json", "x-abacatepay-signature": "bad" }, body: JSON.stringify({ event: "checkout.completed", data: { id: "b-1", reference: "TCK-Z" } }) }) } as any);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid payload (unknown event)", async () => {
    const { verifyWebhookSignature } = await import("../lib/abacatepay");
    (verifyWebhookSignature as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const res = await (await import("../pages/api/webhooks/abacatepay")).POST({ request: new Request("http://localhost:4321/api/webhooks/abacatepay", { method: "POST", headers: { "Content-Type": "application/json", "x-abacatepay-signature": "valid" }, body: JSON.stringify({ event: "unknown.event", data: {} }) }) } as any);
    expect(res.status).toBe(400);
  });

  it("returns 401 when signature header is missing", async () => {
    const res = await (await import("../pages/api/webhooks/abacatepay")).POST({ request: new Request("http://localhost:4321/api/webhooks/abacatepay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "checkout.completed" }) }) } as any);
    expect(res.status).toBe(401);
  });
});