import { describe, it, expect } from "vitest";
import { generateOrderReference, getAvailableTiers } from "../lib/utils";
import type { Tier } from "../lib/types";

describe("generateOrderReference", () => {
  it("generates TCK-XXXXXXXX format", () => {
    const ref = generateOrderReference();
    expect(ref).toMatch(/^TCK-[A-HJ-NP-Z2-9]{8}$/);
  });

  it("generates unique references", () => {
    const refs = new Set(Array.from({ length: 100 }, () => generateOrderReference()));
    expect(refs.size).toBe(100);
  });
});

describe("getAvailableTiers", () => {
  const baseTier = (overrides: Partial<Tier>): Tier => ({
    id: "1",
    event_id: "e1",
    name: "Test",
    description: null,
    price_cents: 1000,
    quantity_total: 10,
    quantity_sold: 0,
    sale_start_at: null,
    sale_end_at: null,
    abacatepay_product_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  });

  it("includes tiers with capacity", () => {
    const tiers = [baseTier({})];
    expect(getAvailableTiers(tiers)).toHaveLength(1);
  });

  it("excludes sold-out tiers", () => {
    const tiers = [baseTier({ quantity_sold: 10 })];
    expect(getAvailableTiers(tiers)).toHaveLength(0);
  });

  it("excludes tiers before sale start", () => {
    const tiers = [baseTier({ sale_start_at: "2099-01-01T00:00:00Z" })];
    expect(getAvailableTiers(tiers, "2026-01-01T00:00:00Z")).toHaveLength(0);
  });

  it("excludes tiers after sale end", () => {
    const tiers = [baseTier({ sale_end_at: "2020-01-01T00:00:00Z" })];
    expect(getAvailableTiers(tiers, "2026-01-01T00:00:00Z")).toHaveLength(0);
  });
});