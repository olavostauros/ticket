/**
 * Platform-wide constants.
 */
export const SITE_NAME = "Ticket";
export const SITE_DESCRIPTION =
  "Plataforma de venda de ingressos para eventos. Crie, publique e venda ingressos.";

// Job Types

/** Recognized job types for the pending_jobs queue. Centralized to prevent typos. */
export const JOB_TYPES = {
  PROCESS_PAID_ORDER: "process_paid_order",
  PROCESS_LOST_ORDER: "process_lost_order",
  RETRY_ABACATEPAY_CHECKOUT: "retry_abacatepay_checkout",
  SEND_CONFIRMATION_EMAIL: "send_confirmation_email",
  SEND_WELCOME_EMAIL: "send_welcome_email",
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

/** Session cookie name — used by httpOnly Set-Cookie and proxy/server auth */
export const SESSION_COOKIE_NAME = "ticket_session";

/** Resend — sender email for transactional emails (must be verified in Resend) */
export const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "Ticket <noreply@ticket.app>";

/**
 * Fee constants — single source of truth.
 * Import these in lib/fees.ts instead of redefining.
 */
export const PLATFORM_FEE_PERCENT = 0.05;      // 5%
export const PLATFORM_FEE_FIXED_CENTS = 50;     // R$ 0,50

/** Session TTL in seconds (7 days) */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/** AbacatePay API base URL — overridable via env var */
export const ABACATEPAY_API_URL =
  process.env.ABACATEPAY_API_URL || "https://api.abacatepay.com/v1";

/** AbacatePay billing create endpoint */
export const ABACATEPAY_BILLING_CREATE_URL = `${ABACATEPAY_API_URL}/billing/create`;