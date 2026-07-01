import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { ok } from "@/lib/api-utils";

/**
 * POST /api/auth/logout — Clear the session cookie.
 * Returns a redirect if the client is a browser (form POST) or JSON for API clients.
 */
export async function POST(request: NextRequest) {
  const isFormSubmission = request.headers
    .get("accept")
    ?.includes("text/html");

  const response = isFormSubmission
    ? NextResponse.redirect(
        new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
      )
    : ok({ logged_out: true });

  // Override cookies on the redirect response too
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}
