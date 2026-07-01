import jwt from "jsonwebtoken";
import type { APIContext } from "astro";

const JWT_SECRET = process.env.JWT_SECRET!;
const SESSION_COOKIE_NAME = "ticket_session";

export function signToken(payload: { id: string; email: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): { id: string; email: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; email: string };
  } catch {
    return null;
  }
}

export async function getAuthUser(
  context: APIContext
): Promise<{ id: string; email: string } | null> {
  const authHeader = context.request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const user = verifyToken(authHeader.slice(7));
    if (user) return user;
  }

  const sessionCookie = context.cookies.get(SESSION_COOKIE_NAME);
  if (sessionCookie?.value) {
    return verifyToken(sessionCookie.value);
  }

  return null;
}

export async function requireAuth(Astro: APIContext) {
  const user = await getAuthUser(Astro);
  if (!user) {
    return Astro.redirect("/login?redirect=" + Astro.url.pathname);
  }
  return user;
}

export async function redirectIfAuthenticated(Astro: APIContext) {
  const user = await getAuthUser(Astro);
  if (user) return Astro.redirect("/dashboard");
}