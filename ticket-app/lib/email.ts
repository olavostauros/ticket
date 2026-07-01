/**
 * Email client — wraps the Resend API.
 *
 * Usage:
 *   import { sendEmail } from "@/lib/email";
 *   await sendEmail({ to: "user@example.com", subject: "...", html: "..." });
 *
 * Requires RESEND_API_KEY env var.
 * The sender address is configured via RESEND_FROM_EMAIL (defaults to
 * "Ticket <noreply@ticket.app>" — must be verified in Resend).
 */
import { RESEND_FROM_EMAIL } from "./constants";

const RESEND_API_URL = "https://api.resend.com/emails";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send a transactional email via Resend.
 * Throws on non-2xx responses.
 */
export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY environment variable");
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown");
    throw new Error(`Resend error (${response.status}): ${errorText}`);
  }
}