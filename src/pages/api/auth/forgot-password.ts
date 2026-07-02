import type { APIRoute } from "astro";
export const prerender = false;

import crypto from "node:crypto";
import { query } from "../../../lib/db";
import { forgotPasswordSchema } from "../../../lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../../../lib/rate-limit";
import { ok, err } from "../../../lib/api-utils";
import { sendEmail } from "../../../lib/email";
import { buildPasswordResetEmail } from "../../../lib/email-templates";

/**
 * POST /api/auth/forgot-password
 *
 * Validates the email, generates a reset token, stores its hash, and sends
 * the password reset email. Returns 200 regardless of whether the email
 * exists (to prevent email enumeration).
 */
export const POST: APIRoute = async (context) => {
  try {
    const ip = getClientIp(context.request);
    const kv = (context.locals as any)?.runtime?.env?.RATE_LIMIT as KVNamespace | undefined;
    const { allowed, resetAt } = await checkRateLimit(`forgot-password:${ip}`, 3, 60_000, kv);
    if (!allowed) return rateLimitResponse(resetAt);

    const body = await context.request.json();
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return err("Validation failed: " + parsed.error.issues.map((i: any) => i.message).join("; "), 400, "validation_error");
    }

    const { email } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    // Look up the organizer — don't reveal whether the email exists
    const result = await query("SELECT id, email FROM organizers WHERE email = $1", [normalizedEmail]);
    const organizer = result.rows[0] as { id: string; email: string } | undefined;

    if (organizer) {
      // Generate a cryptographically secure random token
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      // Token expires in 1 hour
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      // Store the hashed token
      await query(
        "INSERT INTO password_reset_tokens (organizer_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        [organizer.id, tokenHash, expiresAt]
      );

      // Send the email with the raw token in the URL
      const appUrl = process.env.PUBLIC_APP_URL || "http://localhost:4321";
      const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

      sendEmail({
        to: normalizedEmail,
        subject: "Redefinição de senha — Ticket 🔐",
        html: buildPasswordResetEmail({ email: normalizedEmail, resetUrl }),
      }).catch((err: Error) => console.error(`Failed to send password reset email to ${normalizedEmail}:`, err));
    }

    // Always return 200 — whether or not the email exists
    return ok({
      message: "Se o email existir, você receberá um link para redefinir sua senha.",
    });
  } catch (caughtErr) {
    console.error("Forgot password error:", caughtErr);
    return err("Internal server error", 500);
  }
};