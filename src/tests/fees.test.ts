import { describe, it, expect } from "vitest";
import { calculateFees } from "../lib/fees";

describe("calculateFees", () => {
  it("calculates correct fees for PIX", () => {
    const result = calculateFees(2500, "pix");
    expect(result.subtotal_cents).toBe(2500);
    expect(result.platform_fee_cents).toBe(175); // 5% of 2500 = 125 + 50 = 175
    expect(result.abacatepay_fee_cents).toBe(0);
    expect(result.total_cents).toBe(2675);
  });

  it("handles zero subtotal", () => {
    const result = calculateFees(0, "pix");
    expect(result.platform_fee_cents).toBe(50); // just the fixed fee
    expect(result.total_cents).toBe(50);
  });
});