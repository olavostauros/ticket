import { randomUUID } from "node:crypto";
import type { Tier } from "./types";

/**
 * Filter tiers to only those currently available for sale.
 * Used by both the public API route and the SSR event page.
 */
export function getAvailableTiers(tiers: Tier[], now?: string): Tier[] {
  const cutoff = now || new Date().toISOString();
  return tiers.filter((tier) => {
    const hasCapacity = tier.quantity_sold < tier.quantity_total;
    const saleStarted = !tier.sale_start_at || tier.sale_start_at <= cutoff;
    const saleNotEnded = !tier.sale_end_at || tier.sale_end_at > cutoff;
    return hasCapacity && saleStarted && saleNotEnded;
  });
}

/**
 * Generate a short, human-readable order reference.
 * Format: TCK-XXXXXXXX (8 uppercase alphanumeric characters)
 * Uses crypto.randomUUID() for cryptographically secure entropy.
 */
export function generateOrderReference(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1 to avoid confusion
  const uuid = randomUUID().replace(/-/g, "");
  let result = "TCK-";
  for (let i = 0; i < 8; i++) {
    // Use two hex digits (0-255) instead of one (0-15) so the full
    // 32-char alphabet is reachable. 32 divides 256 evenly, so no
    // modulo bias.
    const byte = parseInt(uuid[i * 2] + uuid[i * 2 + 1], 16);
    result += chars[byte % chars.length];
  }
  return result;
}

