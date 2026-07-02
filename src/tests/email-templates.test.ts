import { describe, it, expect } from "vitest";
import { buildWelcomeEmail, buildConfirmationEmail } from "../lib/email-templates";

// ─── Welcome Email ───────────────────────────────────────────────

describe("buildWelcomeEmail", () => {
  it("includes the organizer name in the greeting", () => {
    const html = buildWelcomeEmail({ name: "Alice" });

    expect(html).toContain("Alice");
    expect(html).toContain("Bem-vindo");
  });

  it("includes a CTA button to create the first event", () => {
    const html = buildWelcomeEmail({ name: "Bob" });

    expect(html).toContain("Criar primeiro evento");
    expect(html).toContain("/dashboard/events/new");
  });

  it("links to the default app URL when none is provided", () => {
    const html = buildWelcomeEmail({ name: "Test" });

    expect(html).toContain("https://ticket.app");
    expect(html).toContain("/dashboard");
  });

  it("uses the provided appUrl when given", () => {
    const html = buildWelcomeEmail({
      name: "Test",
      appUrl: "https://mytickets.example.com",
    });

    expect(html).toContain("https://mytickets.example.com");
    expect(html).not.toContain("https://ticket.app");
  });

  it("escapes HTML in the organizer name", () => {
    const html = buildWelcomeEmail({
      name: "<script>alert('xss')</script>",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in the app URL", () => {
    const html = buildWelcomeEmail({
      name: "Test",
      appUrl: "http://evil.com/?q=<script>",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

// ─── Confirmation Email ──────────────────────────────────────────

describe("buildConfirmationEmail", () => {
  it("includes the attendee name and order reference", () => {
    const html = buildConfirmationEmail({
      attendeeName: "João Silva",
      orderReference: "TCK-ABCD1234",
      ticketUrls: ["https://ticket.app/tickets/uuid-1"],
    });

    expect(html).toContain("João Silva");
    expect(html).toContain("TCK-ABCD1234");
    expect(html).toContain("Compra confirmada");
  });

  it("includes all ticket URLs as links", () => {
    const html = buildConfirmationEmail({
      attendeeName: "Maria",
      orderReference: "TCK-1234",
      ticketUrls: [
        "https://ticket.app/tickets/uuid-1",
        "https://ticket.app/tickets/uuid-2",
      ],
    });

    expect(html).toContain("https://ticket.app/tickets/uuid-1");
    expect(html).toContain("https://ticket.app/tickets/uuid-2");
  });

  it("shows the QR code hint", () => {
    const html = buildConfirmationEmail({
      attendeeName: "Test",
      orderReference: "TCK-0000",
      ticketUrls: ["https://ticket.app/tickets/uuid-1"],
    });

    expect(html).toContain("QR code");
  });

  it("escapes HTML in all user-provided values", () => {
    const html = buildConfirmationEmail({
      attendeeName: "<b>Bad</b>",
      orderReference: "<i>ref</i>",
      ticketUrls: ["http://evil.com/?q=<script>"],
    });

    expect(html).not.toContain("<b>Bad</b>");
    expect(html).not.toContain("<i>ref</i>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;b&gt;Bad&lt;/b&gt;");
    expect(html).toContain("&lt;i&gt;ref&lt;/i&gt;");
    expect(html).toContain("&lt;script&gt;");
  });

  it("handles an empty ticket list gracefully", () => {
    const html = buildConfirmationEmail({
      attendeeName: "Test",
      orderReference: "TCK-EMPTY",
      ticketUrls: [],
    });

    expect(html).toContain("TCK-EMPTY");
    expect(html).not.toContain("href=");
  });
});