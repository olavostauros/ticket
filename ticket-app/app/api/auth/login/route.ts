import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/constants";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { ok, err } from "@/lib/api-utils";

/**
 * POST /api/auth/login — Authenticate an organizer.
 *
 * Uses a public anon-key client for signInWithPassword (service_role cannot do user auth),
 * then fetches the organizer record with the service_role client.
 * Sets an httpOnly session cookie for the proxy middleware to validate.
 * Rate limited to 5 attempts per IP per minute.
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting: 5 attempts per IP per minute
    const ip = getClientIp(request);
    const { allowed, resetAt } = checkRateLimit(`login:${ip}`, 5, 60_000);
    if (!allowed) {
      return rateLimitResponse(resetAt);
    }

    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return err(
        "Validation failed: " + parsed.error.issues.map((i) => i.message).join("; "),
        400,
        "validation_error"
      );
    }

    const { email, password } = parsed.data;

    // Use anon-key client for sign-in (service_role cannot do user-facing auth)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return err("Email ou senha incorretos.", 401, "auth_failed");
    }

    // Fetch organizer record (use service_role to bypass RLS)
    const admin = createServerClient();
    const { data: organizer } = await admin
      .from("organizers")
      .select("id, email, name, avatar_url, pix_key, pix_key_type")
      .eq("id", data.user.id)
      .single();

    const response = ok({ organizer });

    // Set httpOnly session cookie
    response.cookies.set(SESSION_COOKIE_NAME, data.session.access_token, {
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
}