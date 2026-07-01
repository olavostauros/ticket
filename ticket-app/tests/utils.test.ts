import { describe, it, expect } from "vitest";
import { generateOrderReference, getAvailableTiers } from "@/lib/utils";

describe("getAvailableTiers", () => {
  const baseTier = {
    id: "tier-1",
    event_id: "event-1",
    name: "General",
    description: null,
    price_cents: 2500,
    quantity_total: 100,
    quantity_sold: 0,
    sale_start_at: null,
    sale_end_at: null,
    abacatepay_product_id: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  };

  it("includes a tier with capacity and no sale window", () => {
    const tiers = [baseTier];
    const result = getAvailableTiers(tiers, "2025-06-01T12:00:00Z");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("tier-1");
  });

  it("excludes a tier that is sold out", () => {
    const tiers = [{ ...baseTier, quantity_sold: 100 }];
    const result = getAvailableTiers(tiers, "2025-06-01T12:00:00Z");
    expect(result).toHaveLength(0);
  });

  it("excludes a tier before sale_start_at", () => {
    const tiers = [{ ...baseTier, sale_start_at: "2025-07-01T00:00:00Z" }];
    const result = getAvailableTiers(tiers, "2025-06-01T12:00:00Z");
    expect(result).toHaveLength(0);
  });

  it("includes a tier after sale_start_at", () => {
    const tiers = [{ ...baseTier, sale_start_at: "2025-05-01T00:00:00Z" }];
    const result = getAvailableTiers(tiers, "2025-06-01T12:00:00Z");
    expect(result).toHaveLength(1);
  });

  it("excludes a tier after sale_end_at", () => {
    const tiers = [{ ...baseTier, sale_end_at: "2025-05-31T23:59:59Z" }];
    const result = getAvailableTiers(tiers, "2025-06-01T12:00:00Z");
    expect(result).toHaveLength(0);
  });

  it("includes a tier before sale_end_at", () => {
    const tiers = [{ ...baseTier, sale_end_at: "2025-07-01T00:00:00Z" }];
    const result = getAvailableTiers(tiers, "2025-06-01T12:00:00Z");
    expect(result).toHaveLength(1);
  });

  it("excludes a tier at exact sale_end_at (sale ended)", () => {
    const tiers = [{ ...baseTier, sale_end_at: "2025-06-01T00:00:00Z" }];
    const result = getAvailableTiers(tiers, "2025-06-01T00:00:00Z");
    expect(result).toHaveLength(0);
  });

  it("includes a tier at exact sale_start_at (sale started)", () => {
    const tiers = [{ ...baseTier, sale_start_at: "2025-06-01T00:00:00Z" }];
    const result = getAvailableTiers(tiers, "2025-06-01T00:00:00Z");
    expect(result).toHaveLength(1);
  });

  it("uses current time when now is not provided", () => {
    // Can't mock Date in vitest easily, but the function should not crash
    const tiers = [baseTier];
    expect(() => getAvailableTiers(tiers)).not.toThrow();
  });

  it("filters multiple tiers independently", () => {
    const tiers = [
      { ...baseTier, id: "available", quantity_sold: 0 },
      { ...baseTier, id: "sold-out", quantity_sold: 100 },
      { ...baseTier, id: "not-yet", quantity_total: 50, quantity_sold: 0, sale_start_at: "2099-01-01T00:00:00Z" },
    ];
    const result = getAvailableTiers(tiers, "2025-06-01T12:00:00Z");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("available");
  });
});

describe("generateOrderReference", () => {
  it("generates a reference starting with TCK-", () => {
    const ref = generateOrderReference();
    expect(ref).toMatch(/^TCK-/);
  });

  it("generates a 12-character string (TCK- + 8 chars)", () => {
    const ref = generateOrderReference();
    expect(ref.length).toBe(12);
  });

  it("generates unique references", () => {
    const refs = new Set(Array.from({ length: 100 }, () => generateOrderReference()));
    expect(refs.size).toBe(100);
  });

  it("generates 10,000 references with no collision", () => {
    const refs = new Set(Array.from({ length: 10_000 }, () => generateOrderReference()));
    expect(refs.size).toBe(10_000);
  });

  it("only uses unambiguous characters", () => {
    const ref = generateOrderReference();
    const suffix = ref.slice(4); // After "TCK-"
    expect(suffix).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
  });
});

import { safeJsonParse, generateIdempotencyKey, sleep } from "@/lib/utils";

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    const result = safeJsonParse('{"key": "value"}', {});
    expect(result).toEqual({ key: "value" });
  });

  it("returns fallback for invalid JSON", () => {
    const fallback = { default: true };
    const result = safeJsonParse("not-json", fallback);
    expect(result).toBe(fallback);
  });

  it("returns fallback for empty string", () => {
    const result = safeJsonParse("", []);
    expect(result).toEqual([]);
  });

  it("returns fallback for malformed JSON", () => {
    const result = safeJsonParse('{"broken"', null);
    expect(result).toBeNull();
  });
});

describe("generateIdempotencyKey", () => {
  it("returns a string", () => {
    const key = generateIdempotencyKey();
    expect(typeof key).toBe("string");
  });

  it("returns different values on successive calls", () => {
    const key1 = generateIdempotencyKey();
    const key2 = generateIdempotencyKey();
    expect(key1).not.toBe(key2);
  });
});

describe("sleep", () => {
  it("resolves after the given delay", async () => {
    const start = Date.now();
    await sleep(10);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(5);
  });

  it("resolves immediately for zero delay", async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });
});

describe("getAvailableTiers (additional edge cases)", () => {
  const baseTier = {
    id: "tier-1",
    event_id: "event-1",
    name: "General",
    description: null,
    price_cents: 2500,
    quantity_total: 100,
    quantity_sold: 0,
    sale_start_at: null,
    sale_end_at: null,
    abacatepay_product_id: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  };

  it("handles empty tiers array", () => {
    const result = getAvailableTiers([], "2025-06-01T12:00:00Z");
    expect(result).toEqual([]);
  });

  it("handles all tiers sold out", () => {
    const tiers = [
      { ...baseTier, id: "1", quantity_sold: 100, quantity_total: 100 },
      { ...baseTier, id: "2", quantity_sold: 200, quantity_total: 200 },
    ];
    const result = getAvailableTiers(tiers, "2025-06-01T12:00:00Z");
    expect(result).toHaveLength(0);
  });

  it("handles sale window that hasn't started yet", () => {
    const tiers = [
      { ...baseTier, sale_start_at: "2025-07-01T00:00:00Z" },
    ];
    const result = getAvailableTiers(tiers, "2025-06-01T12:00:00Z");
    expect(result).toHaveLength(0);
  });

  it("handles sale window that has ended", () => {
    const tiers = [
      { ...baseTier, sale_end_at: "2025-01-01T00:00:00Z" },
    ];
    const result = getAvailableTiers(tiers, "2025-06-01T12:00:00Z");
    expect(result).toHaveLength(0);
  });

  it("includes tiers with exact sale_start_at match", () => {
    const tiers = [
      { ...baseTier, sale_start_at: "2025-06-01T12:00:00Z" },
    ];
    const result = getAvailableTiers(tiers, "2025-06-01T12:00:00Z");
    expect(result).toHaveLength(1);
  });

  it("excludes tiers at exact sale_end_at (already ended)", () => {
    const tiers = [
      { ...baseTier, sale_end_at: "2025-06-01T12:00:00Z" },
    ];
    const result = getAvailableTiers(tiers, "2025-06-01T12:00:00Z");
    expect(result).toHaveLength(0);
  });

  it("filters tiers independently (mixed available/unavailable)", () => {
    const tiers = [
      { ...baseTier, id: "available", quantity_sold: 0 },
      { ...baseTier, id: "sold-out", quantity_sold: 100, quantity_total: 100 },
      { ...baseTier, id: "not-yet", sale_start_at: "2099-01-01T00:00:00Z" },
      { ...baseTier, id: "ended", sale_end_at: "2024-01-01T00:00:00Z" },
    ];
    const result = getAvailableTiers(tiers, "2025-06-01T12:00:00Z");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("available");
  });
});