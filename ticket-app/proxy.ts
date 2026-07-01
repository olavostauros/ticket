import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Proxy (formerly middleware) for route protection.
 *
 * - Protects /dashboard/* — redirects to /login if not authenticated
 * - Redirects authenticated users away from /login and /signup to /dashboard
 * - Verifies the session token via Supabase Auth (not just shape-checking)
 *
 * NOTE: This makes an HTTP call to Supabase on each navigation for verified auth.
 * For an MVP this is acceptable; for production, consider a local JWT verification
 * using SUPABASE_JWT_SECRET to eliminate the network roundtrip.
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Rate limiting for auth and checkout endpoints
  if (pathname.startsWith("/api/auth") || pathname === "/api/checkout") {
    const ip = getClientIp(request);
    const maxAttempts = pathname === "/api/checkout" ? 10 : 60;
    const { allowed, resetAt } = checkRateLimit(`mw:${ip}:${pathname}`, maxAttempts, 60_000);
    if (!allowed) {
      return rateLimitResponse(resetAt);
    }
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);

  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup");
  const isDashboard = pathname.startsWith("/dashboard");

  // Early exit — no cookie at all, only protect dashboard
  if (!sessionCookie?.value) {
    if (isDashboard) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // Verify the session token via Supabase.
  // This is async but runs at the edge — ~50-100ms per request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // Middleware should not set cookies — handled by API routes
        },
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser(
    sessionCookie.value
  );

  const isAuthenticated = !error && !!user;

  if (isDashboard && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth pages
  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup", "/api/auth/:path*", "/api/checkout"],
};