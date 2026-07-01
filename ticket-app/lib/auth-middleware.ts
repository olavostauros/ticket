/**
 * Auth middleware utilities for API routes.
 *
 * Extracts the authenticated user from:
 *   1. Authorization: Bearer <token> header (API clients)
 *   2. ticket_session cookie (browser, set by login/signup API routes)
 *
 * Uses the server-side Supabase client (service_role key).
 */
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME } from "@/lib/constants";

/**
 * Get the currently authenticated user from the request context.
 * Designed to be called inside API route handlers.
 *
 * Tries Authorization header first, then falls back to session cookie.
 */
export async function getAuthUser(): Promise<{ id: string; email: string } | null> {
  const supabase = createServerClient();

  // Try Authorization header first (API clients / programmatic calls)
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data.user) {
        return { id: data.user.id, email: data.user.email! };
      }
      if (error) {
        console.warn("getAuthUser: Bearer token verification failed:", error.message);
      }
    }
  } catch (err) {
    console.error("getAuthUser: headers() threw unexpectedly:", err);
  }

  // Fall back to session cookie (browser requests)
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    if (sessionCookie?.value) {
      const { data, error } = await supabase.auth.getUser(sessionCookie.value);
      if (!error && data.user) {
        return { id: data.user.id, email: data.user.email! };
      }
      if (error) {
        console.warn("getAuthUser: cookie session verification failed:", error.message);
      }
    }
  } catch (err) {
    console.error("getAuthUser: cookies() threw unexpectedly:", err);
  }

  return null;
}