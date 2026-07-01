// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

describe("Home page", () => {
  it("renders the hero heading", async () => {
    const Home = (await import("@/app/page")).default;
    render(Home());
    expect(screen.getByText(/Venda ingressos para seus eventos/)).toBeDefined();
  });

  it("renders the platform description", async () => {
    const Home = (await import("@/app/page")).default;
    render(Home());
    expect(screen.getByText(/Crie, publique e venda ingressos online/)).toBeDefined();
  });

  it("renders a link to sign up", async () => {
    const Home = (await import("@/app/page")).default;
    render(Home());
    const link = screen.getByText("Criar conta grátis");
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/signup");
  });

  it("renders a link to login", async () => {
    const Home = (await import("@/app/page")).default;
    render(Home());
    const links = screen.getAllByText("Entrar");
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it("renders links to my-tickets", async () => {
    const Home = (await import("@/app/page")).default;
    render(Home());
    const links = screen.getAllByText("Meus ingressos");
    expect(links.length).toBe(2);
    links.forEach((link) => {
      expect(link.getAttribute("href")).toBe("/my-tickets");
    });
  });

  it("renders a link to privacy policy", async () => {
    const Home = (await import("@/app/page")).default;
    render(Home());
    const link = screen.getByText("Política de Privacidade");
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/privacy");
  });

  it("renders the organizer card", async () => {
    const Home = (await import("@/app/page")).default;
    render(Home());
    expect(screen.getByText("Sou organizador")).toBeDefined();
  });

  it("renders the attendee card", async () => {
    const Home = (await import("@/app/page")).default;
    render(Home());
    expect(screen.getByText("Sou participante")).toBeDefined();
  });
});