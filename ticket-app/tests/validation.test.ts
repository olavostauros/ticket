import { describe, it, expect } from "vitest";
import {
  signupSchema,
  loginSchema,
  createEventSchema,
  checkoutSchema,
  checkinSchema,
  updateProfileSchema,
  updateEventSchema,
} from "@/lib/validation";

// signupSchema

describe("signupSchema", () => {
  it("accepts valid input", () => {
    const result = signupSchema.safeParse({
      email: "organizer@example.com",
      password: "supersecure123",
      name: "João Organizador",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = signupSchema.safeParse({
      email: "not-an-email",
      password: "supersecure123",
      name: "João",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = signupSchema.safeParse({
      email: "organizer@example.com",
      password: "1234567",
      name: "João",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = signupSchema.safeParse({
      email: "organizer@example.com",
      password: "supersecure123",
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 100 chars", () => {
    const result = signupSchema.safeParse({
      email: "organizer@example.com",
      password: "supersecure123",
      name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("accepts password with exactly 8 characters", () => {
    const result = signupSchema.safeParse({
      email: "organizer@example.com",
      password: "12345678",
      name: "João",
    });
    expect(result.success).toBe(true);
  });
});

// loginSchema

describe("loginSchema", () => {
  it("accepts valid input", () => {
    const result = loginSchema.safeParse({
      email: "organizer@example.com",
      password: "supersecure123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "supersecure123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      email: "organizer@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing email field", () => {
    const result = loginSchema.safeParse({
      password: "supersecure123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing password field", () => {
    const result = loginSchema.safeParse({
      email: "organizer@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("accepts long email addresses (Zod has no built-in length limit)", () => {
    const longLocal = "a".repeat(64);
    const result = loginSchema.safeParse({
      email: `${longLocal}@example.com`,
      password: "validpass123",
    });
    // Zod's email validator does not enforce RFC 5321 length limits
    expect(result.success).toBe(true);
  });

  it("rejects empty object", () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// createEventSchema

describe("createEventSchema", () => {
  it("accepts valid event input", () => {
    const result = createEventSchema.safeParse({
      title: "My Awesome Event",
      slug: "my-awesome-event",
      description: "A great event",
      venue_name: "Centro de Convenções",
      venue_address: "Rua X, 123",
      start_at: "2025-12-01T18:00:00Z",
      end_at: "2025-12-01T23:00:00Z",
      timezone: "America/Sao_Paulo",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid slug format", () => {
    const result = createEventSchema.safeParse({
      title: "My Event",
      slug: "My Event With Spaces",
      description: "",
      start_at: "2025-12-01T18:00:00Z",
      end_at: "2025-12-01T23:00:00Z",
      timezone: "America/Sao_Paulo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty title", () => {
    const result = createEventSchema.safeParse({
      title: "",
      slug: "my-event",
      start_at: "2025-12-01T18:00:00Z",
      end_at: "2025-12-01T23:00:00Z",
      timezone: "America/Sao_Paulo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects description exceeding 5000 chars", () => {
    const result = createEventSchema.safeParse({
      title: "Long Desc",
      slug: "long-desc",
      description: "a".repeat(5001),
      start_at: "2025-12-01T18:00:00Z",
      end_at: "2025-12-01T23:00:00Z",
      timezone: "America/Sao_Paulo",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid slug with numbers", () => {
    const result = createEventSchema.safeParse({
      title: "Event 2025",
      slug: "event-2025",
      start_at: "2025-12-01T18:00:00Z",
      end_at: "2025-12-01T23:00:00Z",
      timezone: "America/Sao_Paulo",
    });
    expect(result.success).toBe(true);
  });

  it("rejects slug with consecutive hyphens", () => {
    const result = createEventSchema.safeParse({
      title: "Bad Slug",
      slug: "bad--slug",
      start_at: "2025-12-01T18:00:00Z",
      end_at: "2025-12-01T23:00:00Z",
      timezone: "America/Sao_Paulo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects venue_name exceeding 300 chars", () => {
    const result = createEventSchema.safeParse({
      title: "Long Venue",
      slug: "long-venue",
      venue_name: "a".repeat(301),
      start_at: "2025-12-01T18:00:00Z",
      end_at: "2025-12-01T23:00:00Z",
      timezone: "America/Sao_Paulo",
    });
    expect(result.success).toBe(false);
  });

  it("does not validate end_at after start_at", () => {
    const result = createEventSchema.safeParse({
      title: "Time Travel",
      slug: "time-travel",
      start_at: "2025-12-01T18:00:00Z",
      end_at: "2025-12-01T17:00:00Z",
      timezone: "America/Sao_Paulo",
    });
    // Schema doesn't validate temporal ordering — this documents current behaviour
    expect(result.success).toBe(true);
  });
});

// checkoutSchema

describe("checkoutSchema", () => {
  it("accepts valid checkout input", () => {
    const result = checkoutSchema.safeParse({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      items: [
        { tier_id: "550e8400-e29b-41d4-a716-446655440001", quantity: 2 },
      ],
      attendee_email: "attendee@example.com",
      attendee_name: "Maria Silva",
      idempotency_key: "key-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid tier_id", () => {
    const result = checkoutSchema.safeParse({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      items: [
        { tier_id: "not-a-uuid", quantity: 1 },
      ],
      attendee_email: "attendee@example.com",
      idempotency_key: "key-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero quantity", () => {
    const result = checkoutSchema.safeParse({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      items: [
        { tier_id: "550e8400-e29b-41d4-a716-446655440001", quantity: 0 },
      ],
      attendee_email: "attendee@example.com",
      idempotency_key: "key-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects attendee_name exceeding 300 chars", () => {
    const result = checkoutSchema.safeParse({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      items: [
        { tier_id: "550e8400-e29b-41d4-a716-446655440001", quantity: 1 },
      ],
      attendee_email: "attendee@example.com",
      attendee_name: "a".repeat(301),
      idempotency_key: "key-456",
    });
    expect(result.success).toBe(false);
  });

  it("does not reject duplicate tier_ids in items", () => {
    const result = checkoutSchema.safeParse({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      items: [
        { tier_id: "550e8400-e29b-41d4-a716-446655440001", quantity: 1 },
        { tier_id: "550e8400-e29b-41d4-a716-446655440001", quantity: 2 },
      ],
      attendee_email: "attendee@example.com",
      idempotency_key: "key-789",
    });
    expect(result.success).toBe(true);
  });

  it("accepts items with 5 different tier_ids", () => {
    const ids = [
      "550e8400-e29b-41d4-a716-446655440001",
      "550e8400-e29b-41d4-a716-446655440002",
      "550e8400-e29b-41d4-a716-446655440003",
      "550e8400-e29b-41d4-a716-446655440004",
      "550e8400-e29b-41d4-a716-446655440005",
    ];
    const items = ids.map((id) => ({ tier_id: id, quantity: 1 }));
    const result = checkoutSchema.safeParse({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      items,
      attendee_email: "attendee@example.com",
      idempotency_key: "key-101112",
    });
    expect(result.success).toBe(true);
  });
});

// checkinSchema

describe("checkinSchema", () => {
  it("accepts valid UUID", () => {
    const result = checkinSchema.safeParse({
      ticket_code: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID", () => {
    const result = checkinSchema.safeParse({
      ticket_code: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty string", () => {
    const result = checkinSchema.safeParse({
      ticket_code: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects null", () => {
    const result = checkinSchema.safeParse({
      ticket_code: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects numeric input", () => {
    const result = checkinSchema.safeParse({
      ticket_code: 12345,
    });
    expect(result.success).toBe(false);
  });
});

// updateProfileSchema

describe("updateProfileSchema", () => {
  it("accepts valid partial update with name only", () => {
    const result = updateProfileSchema.safeParse({ name: "Maria" });
    expect(result.success).toBe(true);
  });

  it("accepts valid partial update with pix_key only", () => {
    const result = updateProfileSchema.safeParse({
      pix_key: "123.456.789-00",
      pix_key_type: "cpf",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (no fields required)", () => {
    const result = updateProfileSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects invalid pix_key_type", () => {
    const result = updateProfileSchema.safeParse({
      pix_key: "chave",
      pix_key_type: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 100 characters", () => {
    const result = updateProfileSchema.safeParse({
      name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid avatar_url", () => {
    const result = updateProfileSchema.safeParse({
      avatar_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("accepts setting pix_key without pix_key_type", () => {
    const result = updateProfileSchema.safeParse({
      pix_key: "chave-pix-123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all fields at once", () => {
    const result = updateProfileSchema.safeParse({
      name: "João",
      pix_key: "123.456.789-00",
      pix_key_type: "cpf",
      avatar_url: "https://example.com/avatar.jpg",
    });
    expect(result.success).toBe(true);
  });

  it("rejects pix_key longer than 100 chars", () => {
    const result = updateProfileSchema.safeParse({
      pix_key: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });
});

// updateEventSchema edge cases

describe("updateEventSchema edge cases", () => {
  it("rejects invalid start_at datetime string", () => {
    const result = updateEventSchema.safeParse({ start_at: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid end_at datetime string", () => {
    const result = updateEventSchema.safeParse({ end_at: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("rejects cover_image_url with invalid URL", () => {
    const result = updateEventSchema.safeParse({ cover_image_url: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("accepts setting cover_image_url to null", () => {
    const result = updateEventSchema.safeParse({ cover_image_url: null });
    expect(result.success).toBe(true);
  });

  it("rejects empty status string", () => {
    const result = updateEventSchema.safeParse({ status: "" });
    expect(result.success).toBe(false);
  });
});