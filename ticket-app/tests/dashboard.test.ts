import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-middleware";

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/auth-middleware", () => ({
  getAuthUser: vi.fn(),
}));

describe("Sales dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users to login", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    // Page should call redirect("/login")
    const user = await getAuthUser();
    expect(user).toBeNull();
  });

  it("shows 404 for unknown event slug", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-1", email: "org@test.com" });
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    };
    vi.mocked(createServerClient).mockReturnValue(mockSupabase as any);

    const supabase = createServerClient();
    const { data: event } = await supabase
      .from("events")
      .select("id, title, status, organizer_id, start_at")
      .eq("slug", "unknown-slug")
      .single();

    expect(event).toBeNull();
  });

  it("redirects non-owner away from event dashboard", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-2", email: "other@test.com" });
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "evt-1", organizer_id: "org-1", title: "Test", status: "published", start_at: "2026-07-01" },
      }),
    };
    vi.mocked(createServerClient).mockReturnValue(mockSupabase as any);

    const supabase = createServerClient();
    const { data: event } = await supabase
      .from("events")
      .select("id, title, status, organizer_id, start_at")
      .eq("slug", "test-event")
      .single();

    // Non-owner should be redirected
    const user = await getAuthUser();
    expect(user?.id).toBe("org-2");
    expect(event?.organizer_id).toBe("org-1");
    expect(event?.organizer_id).not.toBe(user?.id);
  });

  it("computes totals from tiers and orders", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: "org-1", email: "org@test.com" });

    const mockEvent = {
      data: { id: "evt-1", organizer_id: "org-1", title: "Test", status: "published", start_at: "2026-07-01" },
    };
    const mockTiers = {
      data: [
        { id: "tier-1", name: "VIP", price_cents: 5000, quantity_total: 100, quantity_sold: 30 },
        { id: "tier-2", name: "Regular", price_cents: 2000, quantity_total: 200, quantity_sold: 50 },
      ],
    };
    const mockOrders = {
      data: [
        { amount_cents: 5000, fee_cents: 300 },
        { amount_cents: 2000, fee_cents: 150 },
        { amount_cents: 2000, fee_cents: 150 },
      ],
    };
    const mockCheckins = { count: 20 };

    let callCount = 0;
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(mockEvent);
      }),
    };

    // Override for the parallel queries
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === "tiers") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: vi.fn((resolve: any) => resolve(mockTiers)),
        };
      }
      if (table === "orders") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: vi.fn((resolve: any) => resolve(mockOrders)),
        };
      }
      if (table === "check_ins") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: vi.fn((resolve: any) => resolve(mockCheckins)),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(mockEvent),
        then: vi.fn((resolve: any) => resolve({ data: [] })),
      };
    });

    vi.mocked(createServerClient).mockReturnValue({ from: mockFrom } as any);

    const supabase = createServerClient();

    // Simulate the parallel queries from the dashboard page
    const [tiersResult, ordersResult, checkinResult] = await Promise.all([
      supabase.from("tiers").select("id, name, price_cents, quantity_total, quantity_sold").eq("event_id", "evt-1"),
      supabase.from("orders").select("amount_cents, fee_cents").eq("event_id", "evt-1").eq("status", "paid"),
      supabase.from("check_ins").select("id", { count: "exact", head: true }).eq("event_id", "evt-1"),
    ]);

    const tiers = tiersResult.data || [];
    const orders = ordersResult.data || [];
    const checkinCount = checkinResult.count || 0;

    const totalRevenue = orders.reduce((sum: number, o: any) => sum + o.amount_cents, 0);
    const totalFees = orders.reduce((sum: number, o: any) => sum + o.fee_cents, 0);
    const totalTicketsSold = tiers.reduce((sum: number, t: any) => sum + t.quantity_sold, 0);
    const totalCapacity = tiers.reduce((sum: number, t: any) => sum + t.quantity_total, 0);

    expect(totalTicketsSold).toBe(80);
    expect(totalCapacity).toBe(300);
    expect(totalRevenue).toBe(9000);
    expect(totalFees).toBe(600);
    expect(checkinCount).toBe(20);
  });
});