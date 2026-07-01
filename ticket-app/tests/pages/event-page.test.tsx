// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock next/navigation
const mockNotFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}));

// Mock Supabase server client
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}));

// Use real getAvailableTiers
vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
  return actual;
});

describe("EventPage server component", () => {
  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const publishedEvent = {
    id: "evt-1",
    title: "Show do Artista",
    slug: "show-do-artista",
    status: "published",
    description: "Um show incrível!",
    venue_name: "Espaço Cultural",
    venue_address: "Rua das Artes, 100",
    start_at: "2026-07-15T20:00:00Z",
    end_at: "2026-07-16T02:00:00Z",
    timezone: "America/Sao_Paulo",
    cover_image_url: "https://example.com/capa.jpg",
    tiers: [
      {
        id: "tier-1",
        name: "VIP",
        description: "Acesso prioritário",
        price_cents: 10000,
        quantity_total: 50,
        quantity_sold: 10,
        sale_start_at: null,
        sale_end_at: null,
      },
      {
        id: "tier-2",
        name: "General",
        description: null,
        price_cents: 5000,
        quantity_total: 200,
        quantity_sold: 50,
        sale_start_at: null,
        sale_end_at: null,
      },
    ],
  };

  async function renderEventPage(slug = "show-do-artista") {
    const EventPage = (await import("@/app/events/[slug]/page")).default;
    // Server component is an async function. Call it to get the JSX tree,
    // then render that tree with @testing-library/react.
    const element = await EventPage({ params: Promise.resolve({ slug }) });
    render(element);
  }

  it("renders event title and description", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: publishedEvent, error: null }),
    });

    await renderEventPage();
    expect(screen.getByText("Show do Artista")).toBeDefined();
    expect(screen.getByText("Um show incrível!")).toBeDefined();
  });

  it("renders venue information", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: publishedEvent, error: null }),
    });

    await renderEventPage();
    expect(screen.getByText(/Espaço Cultural/)).toBeDefined();
    expect(screen.getByText(/Rua das Artes/)).toBeDefined();
  });

  it("renders available ticket tiers", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: publishedEvent, error: null }),
    });

    await renderEventPage();
    expect(screen.getByText("VIP")).toBeDefined();
    expect(screen.getByText("General")).toBeDefined();
    expect(screen.getByText("Acesso prioritário")).toBeDefined();
  });

  it("renders cover image when available", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: publishedEvent, error: null }),
    });

    await renderEventPage();
    const img = screen.getByAltText("Show do Artista") as HTMLImageElement;
    expect(img).toBeDefined();
    expect(img.src).toBe("https://example.com/capa.jpg");
  });

  it("shows sold-out message when no tickets available", async () => {
    const soldOutEvent = {
      ...publishedEvent,
      tiers: [
        { ...publishedEvent.tiers[0], quantity_sold: 50, quantity_total: 50 },
        { ...publishedEvent.tiers[1], quantity_sold: 200, quantity_total: 200 },
      ],
    };

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: soldOutEvent, error: null }),
    });

    await renderEventPage();
    expect(screen.getByText("Nenhum ingresso disponível no momento.")).toBeDefined();
  });

  it("throws notFound for non-existent event", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
    });

    await expect(renderEventPage("unknown-slug")).rejects.toThrow("NOT_FOUND");
  });

  it("shows available ticket counts", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: publishedEvent, error: null }),
    });

    await renderEventPage();
    expect(screen.getByText(/40 disponíveis/)).toBeDefined();
    expect(screen.getByText(/150 disponíveis/)).toBeDefined();
  });
});