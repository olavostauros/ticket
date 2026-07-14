import type { APIRoute } from "astro";
export const prerender = false;

import { query } from "../../../lib/db";
import { signToken } from "../../../lib/auth";
import { hashPassword } from "../../../lib/password";
import { signupSchema } from "../../../lib/validation";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "../../../lib/constants";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../../../lib/rate-limit";
import { ok, err } from "../../../lib/api-utils";
import { sendEmail } from "../../../lib/email";
import { buildWelcomeEmail } from "../../../lib/email-templates";

export const POST: APIRoute = async (context) => {
  try {
    const ip = getClientIp(context.request);
    const kv = (context.locals as any)?.runtime?.env?.RATE_LIMIT as KVNamespace | undefined;
    const { allowed, resetAt } = await checkRateLimit(`signup:${ip}`, 3, 60_000, kv);
    if (!allowed) return rateLimitResponse(resetAt);

    const body = await context.request.json();
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return err("Validation failed: " + parsed.error.issues.map((i: any) => i.message).join("; "), 400, "validation_error");
    }

    const { email, password, name } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    // Check for existing user
    const existing = await query("SELECT id FROM organizers WHERE email = $1", [normalizedEmail]);
    if (existing.rows[0]) return err("Já existe uma conta com este email", 409, "email_exists");

    const passwordHash = await hashPassword(password);

    const result = await query(
      "INSERT INTO organizers (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, avatar_url, created_at",
      [normalizedEmail, name, passwordHash]
    );
    const organizer = result.rows[0];

    // Send welcome email (non-blocking)
    const appUrl = process.env.PUBLIC_APP_URL || "http://localhost:4321";
    sendEmail({
      to: normalizedEmail,
      subject: "Bem-vindo ao Ticket! 🎟️",
      html: buildWelcomeEmail({ name, appUrl }),
    }).catch((err: Error) => console.error(`Failed to send welcome email to ${normalizedEmail}:`, err));

    const token = await signToken({ id: organizer.id, email: organizer.email });
    const response = ok({ organizer }, 201);

    context.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (caughtErr) {
    console.error("Signup error:", caughtErr);
    return err("Internal server error", 500);
  }
};