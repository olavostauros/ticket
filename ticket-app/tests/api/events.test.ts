import { describe, it, expect } from "vitest";
import {
  createEventSchema,
  addTierSchema,
  updateEventSchema,
} from "@/lib/validation";

// createEventSchema

describe("createEventSchema", () => {
  it("accepts minimal valid input (required fields only)", () => {
    const result = createEventSchema.safeParse({
      title: "Minimal Event",
      slug: "minimal-event",
      start_at: "2025-12-01T18:00:00Z",
      end_at: "2025-12-01T23:00:00Z",
      timezone: "America/Sao_Paulo",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("");
      expect(result.data.venue_name).toBe("");
      expect(result.data.venue_address).toBe("");
      expect(result.data.cover_image_url).toBeNull();
    }
  });

  it("accepts full event input with all optional fields", () => {
    const result = createEventSchema.safeParse({
      title: "Full Event",
      slug: "full-event",
      description: "An amazing event with lots of details",
      venue_name: "Centro de Convenções",
      venue_address: "Av. Paulista, 1000",
      start_at: "2025-12-01T18:00:00Z",
      end_at: "2025-12-01T23:00:00Z",
      timezone: "America/Sao_Paulo",
      cover_image_url: "https://example.com/image.jpg",
    });
    expect(result.success).toBe(true);
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

  it("rejects slug with uppercase letters", () => {
    const result = createEventSchema.safeParse({
      title: "Bad Slug",
      slug: "Bad-Slug",
      start_at: "2025-12-01T18:00:00Z",
      end_at: "2025-12-01T23:00:00Z",
      timezone: "America/Sao_Paulo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects slug with spaces", () => {
    const result = createEventSchema.safeParse({
      title: "Bad Slug",
      slug: "bad slug",
      start_at: "2025-12-01T18:00:00Z",
      end_at: "2025-12-01T23:00:00Z",
      timezone: "America/Sao_Paulo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects slug with leading hyphen", () => {
    const result = createEventSchema.safeParse({
      title: "Bad Slug",
      slug: "-my-event",
      start_at: "2025-12-01T18:00:00Z",
      end_at: "2025-12-01T23:00:00Z",
      timezone: "America/Sao_Paulo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects slug with trailing hyphen", () => {
    const result = createEventSchema.safeParse({
      title: "Bad Slug",
      slug: "my-event-",
      start_at: "2025-12-01T18:00:00Z",
      end_at: "2025-12-01T23:00:00Z",
      timezone: "America/Sao_Paulo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid start_at datetime", () => {
    const result = createEventSchema.safeParse({
      title: "Bad Date",
      slug: "bad-date",
      start_at: "not-a-date",
      end_at: "2025-12-01T23:00:00Z",
      timezone: "America/Sao_Paulo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid end_at datetime", () => {
    const result = createEventSchema.safeParse({
      title: "Bad Date",
      slug: "bad-date",
      start_at: "2025-12-01T18:00:00Z",
      end_at: "also-not-a-date",
      timezone: "America/Sao_Paulo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects title longer than 300 characters", () => {
    const result = createEventSchema.safeParse({
      title: "a".repeat(301),
      slug: "long-title",
      start_at: "2025-12-01T18:00:00Z",
      end_at: "2025-12-01T23:00:00Z",
      timezone: "America/Sao_Paulo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects cover_image_url that is not a valid URL", () => {
    const result = createEventSchema.safeParse({
      title: "Event",
      slug: "my-event",
      start_at: "2025-12-01T18:00:00Z",
      end_at: "2025-12-01T23:00:00Z",
      timezone: "America/Sao_Paulo",
      cover_image_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

// updateEventSchema

describe("updateEventSchema", () => {
  it("rejects empty object (refine guard requires at least one field)", () => {
    const result = updateEventSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts single field update: title", () => {
    const result = updateEventSchema.safeParse({ title: "New Title" });
    expect(result.success).toBe(true);
  });

  it("accepts single field update: description", () => {
    const result = updateEventSchema.safeParse({ description: "Updated desc" });
    expect(result.success).toBe(true);
  });

  it("accepts status change to published", () => {
    const result = updateEventSchema.safeParse({ status: "published" });
    expect(result.success).toBe(true);
  });

  it("accepts status change to canceled", () => {
    const result = updateEventSchema.safeParse({ status: "canceled" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status value", () => {
    const result = updateEventSchema.safeParse({ status: "archived" });
    expect(result.success).toBe(false);
  });

  it("accepts partial update with multiple fields", () => {
    const result = updateEventSchema.safeParse({
      title: "Updated",
      venue_name: "New Venue",
      timezone: "America/Manaus",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid slug in update", () => {
    const result = updateEventSchema.safeParse({
      slug: "Invalid Slug With Spaces",
    });
    expect(result.success).toBe(false);
  });

  it("accepts setting cover_image_url to null", () => {
    const result = updateEventSchema.safeParse({ cover_image_url: null });
    expect(result.success).toBe(true);
  });
});

// addTierSchema

describe("addTierSchema", () => {
  it("accepts valid tier input (required fields only)", () => {
    const result = addTierSchema.safeParse({
      name: "General Admission",
      price_cents: 2500,
      quantity_total: 500,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("");
      expect(result.data.sale_start_at).toBeNull();
      expect(result.data.sale_end_at).toBeNull();
    }
  });

  it("accepts tier with optional fields", () => {
    const result = addTierSchema.safeParse({
      name: "Early Bird",
      description: "Compra antecipada com desconto",
      price_cents: 1500,
      quantity_total: 100,
      sale_start_at: "2025-11-01T00:00:00Z",
      sale_end_at: "2025-11-30T23:59:59Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = addTierSchema.safeParse({
      name: "",
      price_cents: 2500,
      quantity_total: 500,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero price", () => {
    const result = addTierSchema.safeParse({
      name: "Free",
      price_cents: 0,
      quantity_total: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative price", () => {
    const result = addTierSchema.safeParse({
      name: "Negative",
      price_cents: -100,
      quantity_total: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero quantity", () => {
    const result = addTierSchema.safeParse({
      name: "No Tickets",
      price_cents: 2500,
      quantity_total: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    const result = addTierSchema.safeParse({
      name: "Negative",
      price_cents: 2500,
      quantity_total: -5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer price_cents", () => {
    const result = addTierSchema.safeParse({
      name: "Fractional",
      price_cents: 25.5,
      quantity_total: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer quantity_total", () => {
    const result = addTierSchema.safeParse({
      name: "Fractional",
      price_cents: 2500,
      quantity_total: 50.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 200 characters", () => {
    const result = addTierSchema.safeParse({
      name: "a".repeat(201),
      price_cents: 2500,
      quantity_total: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid sale_start_at", () => {
    const result = addTierSchema.safeParse({
      name: "Bad Window",
      price_cents: 2500,
      quantity_total: 100,
      sale_start_at: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid sale_end_at", () => {
    const result = addTierSchema.safeParse({
      name: "Bad Window",
      price_cents: 2500,
      quantity_total: 100,
      sale_end_at: "also-not-a-date",
    });
    expect(result.success).toBe(false);
  });
});