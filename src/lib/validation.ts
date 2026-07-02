import { z } from "zod";

// Auth

export const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").max(100),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100).optional(),
  pix_key: z.string().max(100).optional(),
  pix_key_type: z.enum(["cpf", "cnpj", "email", "phone", "random"]).optional(),
  avatar_url: z.string().url().optional(),
});

// Events

export const createEventSchema = z.object({
  title: z.string().min(1, "Title is required").max(300),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be kebab-case (e.g., 'my-event')"),
  description: z.string().max(5000).optional().default(""),
  venue_name: z.string().max(300).optional().default(""),
  venue_address: z.string().max(500).optional().default(""),
  start_at: z.string().datetime("Invalid start date"),
  end_at: z.string().datetime("Invalid end date"),
  timezone: z.string().min(1, "Timezone is required"),
  cover_image_url: z.string().url().optional().nullable().default(null),
});

export const addTierSchema = z.object({
  name: z.string().min(1, "Tier name is required").max(200),
  description: z.string().max(2000).optional().default(""),
  price_cents: z.number().int().positive("Price must be greater than 0"),
  quantity_total: z.number().int().positive("Quantity must be greater than 0"),
  sale_start_at: z.string().datetime().optional().nullable().default(null),
  sale_end_at: z.string().datetime().optional().nullable().default(null),
});

// Event Update (PATCH)

export const updateEventSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be kebab-case")
    .optional(),
  description: z.string().max(5000).optional(),
  venue_name: z.string().max(300).optional(),
  venue_address: z.string().max(500).optional(),
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime().optional(),
  timezone: z.string().min(1).optional(),
  cover_image_url: z.string().url().nullable().optional(),
  status: z.enum(["draft", "published", "canceled"]).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);

// Password Reset

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// Checkout

export const checkoutItemSchema = z.object({
  tier_id: z.string().uuid("Invalid tier ID"),
  quantity: z.number().int().positive("Quantity must be at least 1"),
});

export const checkoutSchema = z.object({
  event_id: z.string().uuid("Invalid event ID"),
  items: z.array(checkoutItemSchema).min(1, "At least one item is required"),
  attendee_email: z.string().email("Invalid email address"),
  attendee_name: z.string().max(300).optional().default(""),
  idempotency_key: z.string().min(1, "Idempotency key is required"),
});

// Check-in

export const checkinSchema = z.object({
  ticket_code: z.string().uuid("Invalid ticket code"),
});

// Webhook

/** Data payload for known AbacatePay webhook events (checkout.completed / checkout.lost).
 *  Requires id and reference as non-empty strings — prevents `as string` casts on undefined. */
export const abacatepayWebhookDataSchema = z.object({
  id: z.string().min(1, "Missing billing id"),
  reference: z.string().min(1, "Missing order reference"),
});

/**
 * Discriminated union over the `event` field.
 *
 * - For known events (checkout.completed, checkout.lost), `data` is required
 *   with validated id and reference.
 * - Unknown events are accepted but their data is opaque (handled by fallback).
 */
export const abacatepayWebhookSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("checkout.completed"),
    data: abacatepayWebhookDataSchema,
  }),
  z.object({
    event: z.literal("checkout.lost"),
    data: abacatepayWebhookDataSchema,
  }),
]);