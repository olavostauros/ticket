import { describe, it, expect, afterAll } from "vitest";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../lib/validation";
import { buildPasswordResetEmail } from "../lib/email-templates";

// ─── Schema Tests ────────────────────────────────────────────────

describe("forgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    const result = forgotPasswordSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects missing email", () => {
    const result = forgotPasswordSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = forgotPasswordSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("normalizes email with lowercasing", () => {
    const result = forgotPasswordSchema.safeParse({ email: "User@Example.com" });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("User@Example.com");
  });
});

describe("resetPasswordSchema", () => {
  it("accepts a valid token and password", () => {
    const result = resetPasswordSchema.safeParse({
      token: "abc123token",
      password: "newpassword123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty token", () => {
    const result = resetPasswordSchema.safeParse({
      token: "",
      password: "newpassword123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = resetPasswordSchema.safeParse({
      token: "validtoken",
      password: "1234567",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing token", () => {
    const result = resetPasswordSchema.safeParse({ password: "newpassword123" });
    expect(result.success).toBe(false);
  });

  it("rejects missing password", () => {
    const result = resetPasswordSchema.safeParse({ token: "validtoken" });
    expect(result.success).toBe(false);
  });
});

// ─── Email Template Tests ────────────────────────────────────────

describe("buildPasswordResetEmail", () => {
  it("includes the reset URL and email in the HTML", () => {
    const html = buildPasswordResetEmail({
      email: "user@example.com",
      resetUrl: "http://localhost:4321/reset-password?token=abc123",
    });

    expect(html).toContain("user@example.com");
    expect(html).toContain("http://localhost:4321/reset-password?token=abc123");
    expect(html).toContain("Redefinição de senha");
  });

  it("escapes HTML in user-provided values", () => {
    const html = buildPasswordResetEmail({
      email: "<script>alert('xss')</script>",
      resetUrl: "http://evil.com/?q=<script>",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("includes the 1-hour expiry notice", () => {
    const html = buildPasswordResetEmail({
      email: "user@example.com",
      resetUrl: "http://localhost:4321/reset-password?token=abc123",
    });

    expect(html).toContain("1 hora");
  });

  it("includes the ignore-instruction for non-requesters", () => {
    const html = buildPasswordResetEmail({
      email: "user@example.com",
      resetUrl: "http://localhost:4321/reset-password?token=abc123",
    });

    expect(html).toContain("não solicitou");
    expect(html).toContain("ignore este email");
  });
});