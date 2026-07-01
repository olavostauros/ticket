import type { APIRoute } from "astro";
export const prerender = false;

import { SESSION_COOKIE_NAME } from "../../../lib/constants";
import { ok } from "../../../lib/api-utils";

export const POST: APIRoute = async (context) => {
  const isFormSubmission = context.request.headers
    .get("accept")
    ?.includes("text/html");

  if (isFormSubmission) {
    const appUrl = process.env.PUBLIC_APP_URL || "http://localhost:4321";
    context.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return context.redirect(appUrl);
  }

  context.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return ok({ logged_out: true });
};