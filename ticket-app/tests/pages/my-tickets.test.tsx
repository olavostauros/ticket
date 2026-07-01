// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";

let user: UserEvent;

describe("MyTicketsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    user = userEvent.setup();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the search form", async () => {
    const MyTicketsPage = (await import("@/app/my-tickets/page")).default;
    render(<MyTicketsPage />);
    expect(screen.getByText(/Meus Ingressos/)).toBeDefined();
    expect(screen.getByPlaceholderText(/Seu email/)).toBeDefined();
    expect(screen.getByPlaceholderText(/pedido/i)).toBeDefined();
    expect(screen.getByText("Buscar ingressos")).toBeDefined();
  });

  it("shows error on API failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Order not found" }),
    }));

    const MyTicketsPage = (await import("@/app/my-tickets/page")).default;
    render(<MyTicketsPage />);

    await user.type(screen.getByPlaceholderText(/Seu email/), "test@test.com");
    await user.type(screen.getByPlaceholderText(/pedido/i), "TCK-UNKNOWN");
    await user.click(screen.getByText("Buscar ingressos"));

    expect(await screen.findByText("Order not found")).toBeDefined();
  });

  it("shows tickets on successful lookup", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: {
          order_reference: "TCK-ABC1234",
          attendee_name: "Joao Silva",
          tickets: [
            {
              id: "ticket-1",
              unique_code: "uuid-1234",
              holder_name: "Joao Silva",
              tier_name: "VIP",
              checked_in_at: null,
            },
            {
              id: "ticket-2",
              unique_code: "uuid-5678",
              holder_name: "Joao Silva",
              tier_name: "General",
              checked_in_at: "2026-07-01T20:00:00Z",
            },
          ],
        },
      }),
    }));

    const MyTicketsPage = (await import("@/app/my-tickets/page")).default;
    render(<MyTicketsPage />);

    await user.type(screen.getByPlaceholderText(/Seu email/), "joao@test.com");
    await user.type(screen.getByPlaceholderText(/pedido/i), "TCK-ABC1234");
    await user.click(screen.getByText("Buscar ingressos"));

    expect(await screen.findByText("TCK-ABC1234")).toBeDefined();
    expect(screen.getByText("VIP")).toBeDefined();
    expect(screen.getByText("General")).toBeDefined();
    expect(screen.getAllByText(/Titular: Joao Silva/)).toHaveLength(2);
    expect(screen.getAllByText(/Check-in realizado/)).toHaveLength(1);
  });

  it("shows error on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const MyTicketsPage = (await import("@/app/my-tickets/page")).default;
    render(<MyTicketsPage />);

    await user.type(screen.getByPlaceholderText(/Seu email/), "test@test.com");
    await user.type(screen.getByPlaceholderText(/pedido/i), "TCK-TEST");
    await user.click(screen.getByText("Buscar ingressos"));

    expect(await screen.findByText(/unexpected error occurred/)).toBeDefined();
  });

  it("disables submit button while loading", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    const MyTicketsPage = (await import("@/app/my-tickets/page")).default;
    render(<MyTicketsPage />);

    await user.type(screen.getByPlaceholderText(/Seu email/), "test@test.com");
    await user.type(screen.getByPlaceholderText(/pedido/i), "TCK-LOADING");
    await user.click(screen.getByText("Buscar ingressos"));

    const button = screen.getByRole("button");
    expect(button.textContent).toBe("Buscando...");
    expect(button).toBeDisabled();
  });
});