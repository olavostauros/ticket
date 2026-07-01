import { describe, it, expect } from "vitest";
import { calculateFees } from "@/lib/fees";
import { formatBRL } from "@/lib/format";

describe("calculateFees", () => {
  it("calculates fees for PIX correctly", () => {
    // R$ 25,00 ticket = 2500 cents
    const result = calculateFees(2500, "pix");

    expect(result.subtotal_cents).toBe(2500);
    expect(result.platform_fee_cents).toBe(175); // 5% of 2500 = 125 + 50 = 175
    expect(result.abacatepay_fee_cents).toBe(0); // PIX is free
    expect(result.total_cents).toBe(2675); // 2500 + 175 + 0 = 2675
  });

  it("calculates fees for credit card correctly", () => {
    // R$ 100,00 = 10000 cents
    const result = calculateFees(10000, "credit_card");

    expect(result.subtotal_cents).toBe(10000);
    expect(result.platform_fee_cents).toBe(550); // 5% + 50 cents
    expect(result.abacatepay_fee_cents).toBe(448); // 3.99% + 49 cents
    expect(result.total_cents).toBe(10998);
  });

  it("calculates fees for boleto correctly", () => {
    const result = calculateFees(5000, "boleto");

    expect(result.subtotal_cents).toBe(5000);
    expect(result.platform_fee_cents).toBe(300); // 5% of 5000 = 250 + 50 = 300
    expect(result.abacatepay_fee_cents).toBe(299); // 1.99% of 5000 = 99.5 -> round to 100 + 199 = 299

    expect(result.total_cents).toBe(5599); // 5000 + 300 + 299 = 5599
  });

  it("handles zero subtotal", () => {
    const result = calculateFees(0, "pix");

    expect(result.subtotal_cents).toBe(0);
    expect(result.platform_fee_cents).toBe(50); // Just the fixed fee
    expect(result.abacatepay_fee_cents).toBe(0);
    expect(result.total_cents).toBe(50);
  });

  it("handles large amounts", () => {
    // R$ 10.000,00 = 1,000,000 cents
    const result = calculateFees(1_000_000, "credit_card");

    expect(result.subtotal_cents).toBe(1_000_000);
    expect(result.platform_fee_cents).toBe(50_050); // 5% = 50,000 + 50 = 50,050
    expect(result.abacatepay_fee_cents).toBe(39_949); // 3.99% = 39,900 + 49 = 39,949
    expect(result.total_cents).toBe(1_089_999);
  });

  it("handles minimum fee (1 centavos = R$ 0,01)", () => {
    const result = calculateFees(1, "credit_card");

    expect(result.subtotal_cents).toBe(1);
    expect(result.platform_fee_cents).toBe(50); // round(0.05) + 50 = 0 + 50
    expect(result.abacatepay_fee_cents).toBe(49); // round(0.0399) + 49 = 0 + 49
    expect(result.total_cents).toBe(100); // 1 + 50 + 49 = 100
  });

  it("handles single real (100 centavos) with pix", () => {
    const result = calculateFees(100, "pix");

    expect(result.subtotal_cents).toBe(100);
    expect(result.platform_fee_cents).toBe(55); // 5 + 50
    expect(result.abacatepay_fee_cents).toBe(0);
    expect(result.total_cents).toBe(155);
  });

  it("handles negative subtotal (edge case, though validation prevents it)", () => {
    // Function doesn't guard against negative — document current behaviour
    const result = calculateFees(-100, "pix");

    expect(result.subtotal_cents).toBe(-100);
    expect(result.platform_fee_cents).toBe(45); // round(-5) + 50 = -5 + 50 = 45
    expect(result.abacatepay_fee_cents).toBe(0);
    expect(result.total_cents).toBe(-55); // -100 + 45 + 0
  });

  it("handles fractional centavos rounding correctly", () => {
    // Prices that produce fractional centavos
    const result = calculateFees(333, "credit_card");

    expect(result.platform_fee_cents).toBe(67);
    expect(result.abacatepay_fee_cents).toBe(62);
    expect(result.total_cents).toBe(462);
  });

  it("handles boleto rounding", () => {
    const result = calculateFees(199, "boleto");

    expect(result.platform_fee_cents).toBe(60); // Math.round(199*0.05)=10 + 50 = 60
    expect(result.abacatepay_fee_cents).toBe(203); // Math.round(199*0.0199)=4 + 199 = 203
    expect(result.total_cents).toBe(462); // 199 + 60 + 203
  });
});

describe("formatBRL", () => {
  it("formats whole reais", () => {
    expect(formatBRL(2500)).toBe("R$\u00a025,00");
  });

  it("formats with cents", () => {
    expect(formatBRL(2599)).toBe("R$\u00a025,99");
  });

  it("formats single real", () => {
    expect(formatBRL(100)).toBe("R$\u00a01,00");
  });

  it("formats zero", () => {
    expect(formatBRL(0)).toBe("R$\u00a00,00");
  });
});