import type { FeeBreakdown } from "./types";
import { PLATFORM_FEE_PERCENT, PLATFORM_FEE_FIXED_CENTS } from "./constants";

/**
 * AbacatePay fee rates (BRL).
 * Source: https://www.abacatepay.com/docs/taxas
 * These are hardcoded for MVP — move to a fee_configs table when needed.
 */
const ABACATEPAY_FEES = {
  pix: { fixed_cents: 0, percentage: 0 },
  boleto: { fixed_cents: 199, percentage: 0.0199 },
  credit_card: { fixed_cents: 49, percentage: 0.0399 },
} as const;

type PaymentMethod = keyof typeof ABACATEPAY_FEES;

/**
 * Calculate the total fee breakdown for a given subtotal and payment method.
 * All values in BRL centavos.
 *
 * @example
 * calculateFees(2500, "pix")
 * // Returns: { subtotal_cents: 2500, platform_fee_cents: 175, abacatepay_fee_cents: 0, total_cents: 2675 }
 */
export function calculateFees(
  subtotalCents: number,
  paymentMethod: PaymentMethod = "pix"
): FeeBreakdown {
  const platformFee =
    Math.round(subtotalCents * PLATFORM_FEE_PERCENT) + PLATFORM_FEE_FIXED_CENTS;

  const method = ABACATEPAY_FEES[paymentMethod];
  const abacatepayFee =
    Math.round(subtotalCents * method.percentage) + method.fixed_cents;

  return {
    subtotal_cents: subtotalCents,
    platform_fee_cents: platformFee,
    abacatepay_fee_cents: abacatepayFee,
    total_cents: subtotalCents + platformFee + abacatepayFee,
  };
}

