// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock Next.js navigation hooks
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

describe("Login page", () => {
  it("renders login form heading", async () => {
    const LoginPage = (await import("@/app/(auth)/login/page")).default;
    render(<LoginPage />);
    expect(screen.getAllByText("Entrar").length).toBeGreaterThanOrEqual(2);
  });

  it("renders email input field", async () => {
    const LoginPage = (await import("@/app/(auth)/login/page")).default;
    render(<LoginPage />);
    expect(screen.getByLabelText("Email")).toBeDefined();
  });

  it("renders password input field", async () => {
    const LoginPage = (await import("@/app/(auth)/login/page")).default;
    render(<LoginPage />);
    expect(screen.getByLabelText("Senha")).toBeDefined();
  });

  it("renders signup link", async () => {
    const LoginPage = (await import("@/app/(auth)/login/page")).default;
    render(<LoginPage />);
    expect(screen.getByText("Criar conta")).toBeDefined();
  });
});

describe("Signup page", () => {
  it("renders signup form heading", async () => {
    const SignupPage = (await import("@/app/(auth)/signup/page")).default;
    render(<SignupPage />);
    expect(screen.getAllByText("Criar conta").length).toBeGreaterThanOrEqual(2);
  });

  it("renders name input field", async () => {
    const SignupPage = (await import("@/app/(auth)/signup/page")).default;
    render(<SignupPage />);
    expect(screen.getByLabelText("Nome")).toBeDefined();
  });
});

describe("Privacy page", () => {
  it("renders privacy policy heading", async () => {
    const PrivacyPage = (await import("@/app/privacy/page")).default;
    render(<PrivacyPage />);
    expect(screen.getByText(/Política de Privacidade/)).toBeDefined();
  });
});