import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { signupSchema } from "@/lib/validation";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/constants";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { ok, err } from "@/lib/api-utils";
import { sendEmail } from "@/lib/email";
import { buildWelcomeEmail } from "@/lib/email-templates";

/**
 * POST /api/auth/signup — Create an organizer account.
 *
 * Creates a Supabase Auth user + organizer record, signs in,
 * and sets an httpOnly session cookie.
 * Rate limited to 3 attempts per IP per minute.
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting: 3 signup attempts per IP per minute
    const ip = getClientIp(request);
    const { allowed, resetAt } = checkRateLimit(`signup:${ip}`, 3, 60_000);
    if (!allowed) {
      return rateLimitResponse(resetAt);
    }

    const body = await request.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      return err(
        "Validation failed: " + parsed.error.issues.map((i) => i.message).join("; "),
        400,
        "validation_error"
      );
    }

    const { email, password, name } = parsed.data;
    const admin = createServerClient();

    // Create auth user in Supabase
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return err(authError.message, 409, "auth_error");
    }

    // Insert organizer record
    const { error: insertError } = await admin.from("organizers").insert({
      id: authData.user.id,
      email,
      name,
    });

    if (insertError) {
      // Clean up — delete the auth user if organizer insert fails.
      // Wrap in try/catch because the deleteUser call itself can fail
      // (network issue, rate limit), leaving a dangling auth user.
      try {
        await admin.auth.admin.deleteUser(authData.user.id);
      } catch (cleanupErr) {
        console.error(
          `Failed to clean up auth user ${authData.user.id} after organizer insert failure: ${cleanupErr}` +
            " — account partially created, contact support"
        );
      }
      return err("Failed to create organizer account", 500, "db_error");
    }

    // Send welcome email synchronously (simple single API call — no need to queue)
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ticket.app";
      await sendEmail({
        to: email,
        subject: "Bem-vindo ao Ticket! 🎟️",
        html: buildWelcomeEmail({ name, appUrl }),
      });
    } catch (emailErr) {
      // Non-blocking: don't fail signup if email fails, but log it
      console.error(`Failed to send welcome email to ${email}:`, emailErr);
    }

    // Sign in immediately so the user gets a session token
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: sessionData, error: sessionError } =
      await anonClient.auth.signInWithPassword({ email, password });

    // Check if email is confirmed before issuing a session
    const isEmailConfirmed =
      !sessionError &&
      sessionData?.user?.email_confirmed_at !== null &&
      sessionData?.user?.email_confirmed_at !== undefined;
    const isFullySignedUp =
      !sessionError &&
      sessionData?.session?.access_token &&
      isEmailConfirmed;

    const response = ok(
      {
        id: authData.user.id,
        email,
        name,
        needs_login: !isFullySignedUp,
      },
      201
    );

    // Set httpOnly session cookie only if email is confirmed
    if (isFullySignedUp) {
      response.cookies.set(SESSION_COOKIE_NAME, sessionData.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE,
        path: "/",
      });
    }

    return response;
  } catch (caughtErr) {
    console.error("Signup error:", caughtErr);
    return err("Internal server error", 500);
  }
}