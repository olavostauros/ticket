import type { APIRoute } from "astro";
export const prerender = false;

import { query } from "../../../lib/db";
import { signToken } from "../../../lib/auth";
import { verifyPassword } from "../../../lib/password";
import { loginSchema } from "../../../lib/validation";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "../../../lib/constants";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../../../lib/rate-limit";
import { ok, err } from "../../../lib/api-utils";

export const POST: APIRoute = async (context) => {
  try {
    const ip = getClientIp(context.request);
    const kv = (context.locals as any)?.runtime?.env?.RATE_LIMIT as KVNamespace | undefined;
    const { allowed, resetAt } = await checkRateLimit(`login:${ip}`, 5, 60_000, kv);
    if (!allowed) return rateLimitResponse(resetAt);

    const body = await context.request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return err("Validation failed: " + parsed.error.issues.map((i: any) => i.message).join("; "), 400, "validation_error");
    }

    const { email, password } = parsed.data;

    const result = await query("SELECT id, email, name, avatar_url, password_hash FROM organizers WHERE email = $1", [email.toLowerCase()]);
    const organizer = result.rows[0];
    if (!organizer) return err("Email ou senha incorretos.", 401, "auth_failed");

    const valid = await verifyPassword(password, organizer.password_hash);
    if (!valid) return err("Email ou senha incorretos.", 401, "auth_failed");

    const token = await signToken({ id: organizer.id, email: organizer.email });

    const { password_hash, ...safeOrganizer } = organizer;
    const response = ok({ organizer: safeOrganizer });

    context.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (caughtErr) {
    console.error("Login error:", caughtErr);
    return err("Internal server error", 500);
  }
};