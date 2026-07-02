import { SignJWT, jwtVerify } from "jose";
import type { APIContext } from "astro";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
const SESSION_COOKIE_NAME = "ticket_session";

export async function signToken(payload: { id: string; email: string }): Promise<string> {
  return new SignJWT({ id: payload.id, email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<{ id: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return { id: payload.id as string, email: payload.email as string };
  } catch {
    return null;
  }
}

export async function getAuthUser(
  context: APIContext
): Promise<{ id: string; email: string } | null> {
  const authHeader = context.request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const user = await verifyToken(authHeader.slice(7));
    if (user) return user;
  }

  const sessionCookie = context.cookies.get(SESSION_COOKIE_NAME);
  if (sessionCookie?.value) {
    return await verifyToken(sessionCookie.value);
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