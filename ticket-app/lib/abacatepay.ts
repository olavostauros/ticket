import { ABACATEPAY_BILLING_CREATE_URL } from "./constants";

/**
 * AbacatePay client — shared functions for creating checkouts and verifying webhooks.
 *
 * AbacatePay API docs: https://docs.abacatepay.com
 *
 * All amounts are in BRL centavos.
 */


export interface AbacatePayCheckoutResponse {
  id: string;
  checkoutUrl: string;
  status: string;
}

export interface CreateCheckoutParams {
  amountCents: number;
  customerEmail: string;
  customerName?: string;
  reference: string;
  completionUrl: string;
  notificationUrl: string;
  /** Optional extra metadata passed through to the AbacatePay webhook */
  metadata?: Record<string, string>;
}

/**
 * Create an AbacatePay checkout (billing).
 *
 * The API key is read from ABACATEPAY_API_KEY env var.
 * Throws on non-2xx responses with the error body in the message.
 */
export async function createCheckout(
  params: CreateCheckoutParams
): Promise<AbacatePayCheckoutResponse> {
  const apiKey = process.env.ABACATEPAY_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ABACATEPAY_API_KEY environment variable");
  }

  const response = await fetch(ABACATEPAY_BILLING_CREATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amountCents,
      currency: "BRL",
      customer: {
        email: params.customerEmail,
        name: params.customerName || "Attendee",
      },
      reference: params.reference,
      completionUrl: params.completionUrl,
      notificationUrl: params.notificationUrl,
      metadata: params.metadata,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown");
    throw new Error(
      `AbacatePay error (${response.status}): ${errorBody}`
    );
  }

  return response.json();
}

/**
 * Verify an AbacatePay webhook HMAC-SHA256 signature.
 *
 * Uses the Web Crypto API (available in Node 18+, modern runtimes).
 * The secret is read from ABACATEPAY_WEBHOOK_SECRET env var.
 *
 * Returns true if the signature is valid, false otherwise.
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string
): Promise<boolean> {
  const secret = process.env.ABACATEPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Missing ABACATEPAY_WEBHOOK_SECRET environment variable");
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = hexToBytes(signature);
    const bodyBytes = encoder.encode(body);

    return await crypto.subtle.verify("HMAC", key, sigBytes as BufferSource, bodyBytes);
  } catch (err) {
    console.error("Webhook signature verification threw:", err);
    return false;
  }
}

/**
 * Convert a hex string to Uint8Array.
 * Handles optional "0x" prefix.
 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}