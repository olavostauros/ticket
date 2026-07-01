# Milestone 1: Organizer Auth

**Goal:** An organizer can sign up, log in, update their profile, and maintain a session. Auth is delegated to Supabase Auth (email/password).

## Dependencies

- Milestone 0 complete (scaffold, Supabase client, database schema)

## Step-by-step

### 1.1 — Create shared lib utilities

**`src/lib/constants.ts`**
```typescript
export const PLATFORM_FEE_PERCENT = 0.05;       // 5%
export const PLATFORM_FEE_FIXED_CENTS = 50;      // R$ 0,50
export const SITE_NAME = "Ticket";
```

**`src/lib/errors.ts`** — structured API error responses:

```typescript
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function apiError(statusCode: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status: statusCode });
}
```

**`src/lib/api-utils.ts`** — JSON response helpers:

```typescript
import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}
```

### 1.2 — Zod validation schemas

**`src/lib/schemas.ts`**

```typescript
import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  pix_key: z.string().max(100).optional(),
  pix_key_type: z.enum(["cpf", "cnpj", "email", "phone", "random"]).optional(),
  avatar_url: z.string().url().optional(),
});
```

### 1.3 — Auth API routes

**`src/app/api/auth/signup/route.ts`**

```typescript
import { supabase } from "@/lib/supabase";
import { signupSchema } from "@/lib/schemas";
import { err, ok } from "@/lib/api-utils";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return err("validation_error", parsed.error.message, 400);
  }

  const { email, password, name } = parsed.data;

  // Create Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (authError) {
    if (authError.message.includes("already registered")) {
      return err("email_taken", "This email is already registered", 409);
    }
    return err("auth_error", authError.message, 500);
  }

  // Insert into organizers table
  const { error: insertError } = await supabase
    .from("organizers")
    .insert({
      id: authData.user.id,
      email,
      name,
    });

  if (insertError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    return err("db_error", "Failed to create organizer", 500);
  }

  return ok({ organizer: { id: authData.user.id, email, name } }, 201);
}
```

**`src/app/api/auth/login/route.ts`**

```typescript
import { supabase } from "@/lib/supabase";
import { loginSchema } from "@/lib/schemas";
import { err, ok } from "@/lib/api-utils";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return err("validation_error", parsed.error.message, 400);
  }

  const { email, password } = parsed.data;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return err("invalid_credentials", "Invalid email or password", 401);
  }

  const { data: organizer } = await supabase
    .from("organizers")
    .select("*")
    .eq("id", data.user.id)
    .single();

  return ok({
    token: data.session.access_token,
    organizer,
  });
}
```

**`src/app/api/auth/me/route.ts`** — get/update current organizer profile:

```typescript
import { supabase } from "@/lib/supabase";
import { err, ok } from "@/lib/api-utils";
import { getAuthUser } from "@/lib/auth-middleware";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return err("unauthorized", "Not authenticated", 401);

  const { data: organizer } = await supabase
    .from("organizers")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!organizer) return err("not_found", "Organizer not found", 404);
  return ok({ organizer });
}

export async function PATCH(request: Request) {
  const user = await getAuthUser();
  if (!user) return err("unauthorized", "Not authenticated", 401);

  const body = await request.json();
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return err("validation_error", parsed.error.message, 400);
  }

  const { error } = await supabase
    .from("organizers")
    .update(parsed.data)
    .eq("id", user.id);

  if (error) return err("db_error", "Failed to update profile", 500);

  const { data: organizer } = await supabase
    .from("organizers")
    .select("*")
    .eq("id", user.id)
    .single();

  return ok({ organizer });
}
```

### 1.4 — Auth middleware

**`src/lib/auth-middleware.ts`**

```typescript
import { supabase } from "@/lib/supabase";
import { cookies } from "next/headers";

export async function getAuthUser(): Promise<{ id: string; email: string } | null> {
  // Try Authorization header first (API clients)
  const { headers } = await import("next/headers");
  const headersList = await headers();
  const authHeader = headersList.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email! };
  }

  // Fall back to cookie-based session (browser)
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("sb-session");

  if (sessionCookie) {
    const { data, error } = await supabase.auth.getUser(sessionCookie.value);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email! };
  }

  return null;
}
```

### 1.5 — Sign-up page

**`src/app/(auth)/signup/page.tsx`**
- Email, password, name fields
- Client-side form validation
- Calls `POST /api/auth/signup`
- On success, redirects to login with a success message
- Error display for duplicate email, weak password, etc.

### 1.6 — Login page

**`src/app/(auth)/login/page.tsx`**
- Email and password fields
- Client-side validation
- Calls `POST /api/auth/login`
- Stores token in cookie via Supabase SSR
- Redirects to `/dashboard` on success

### 1.7 — Organizer profile page

**`src/app/dashboard/profile/page.tsx`**
- Fetch current organizer via `GET /api/auth/me`
- Form to edit name, PIX key, PIX key type
- Save via `PATCH /api/auth/me`

### 1.8 — Middleware for protected routes

**`src/middleware.ts`**

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get("sb-session");

  // Protect /dashboard routes
  if (request.nextUrl.pathname.startsWith("/dashboard")) {
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // Redirect logged-in users away from auth pages
  if (request.nextUrl.pathname.startsWith("/login") && sessionCookie) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup"],
};
```

### 1.9 — Tests

**`tests/api/auth.test.ts`**

```typescript
import { describe, it, expect } from "vitest";

describe("POST /api/auth/signup", () => {
  it("rejects missing fields");
  it("rejects invalid email");
  it("rejects short password");
  it("creates a new organizer with valid data");
  it("rejects duplicate email with 409");
});

describe("POST /api/auth/login", () => {
  it("rejects invalid credentials");
  it("returns token and organizer on success");
});

describe("GET /api/auth/me", () => {
  it("returns 401 without token");
  it("returns organizer profile with valid token");
});

describe("PATCH /api/auth/me", () => {
  it("updates profile fields");
  it("rejects invalid pix_key_type");
});
```

**`tests/lib/schemas.test.ts`** — unit tests for Zod schema validation:

```typescript
import { describe, it, expect } from "vitest";
import { signupSchema, loginSchema, updateProfileSchema } from "@/lib/schemas";

describe("signupSchema", () => {
  it("accepts valid input", () => {
    const result = signupSchema.safeParse({
      email: "test@example.com",
      password: "password123",
      name: "Test User",
    });
    expect(result.success).toBe(true);
  });

  it("rejects short password", () => {
    const result = signupSchema.safeParse({
      email: "test@example.com",
      password: "1234567",
      name: "Test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = signupSchema.safeParse({
      email: "not-an-email",
      password: "password123",
      name: "Test",
    });
    expect(result.success).toBe(false);
  });
});
```

## Files to create

| File | Type |
|---|---|
| `src/lib/constants.ts` | create |
| `src/lib/errors.ts` | create |
| `src/lib/api-utils.ts` | create |
| `src/lib/schemas.ts` | create |
| `src/lib/auth-middleware.ts` | create |
| `src/app/api/auth/signup/route.ts` | create |
| `src/app/api/auth/login/route.ts` | create |
| `src/app/api/auth/me/route.ts` | create |
| `src/app/(auth)/signup/page.tsx` | create |
| `src/app/(auth)/login/page.tsx` | create |
| `src/app/dashboard/page.tsx` | create |
| `src/app/dashboard/profile/page.tsx` | create |
| `src/middleware.ts` | create |
| `tests/api/auth.test.ts` | create |
| `tests/lib/schemas.test.ts` | create |

## Verification checklist

- [ ] `npm test` passes
- [ ] Sign-up flow: navigate to `/signup`, fill in form, submit -> success
- [ ] Duplicate email returns 409 with meaningful error
- [ ] Login flow: navigate to `/login`, fill in form, submit -> redirects to `/dashboard`
- [ ] Invalid credentials return 401
- [ ] Profile page loads with organizer data
- [ ] Can update name and PIX key via profile page
- [ ] `/dashboard/*` redirects to `/login` when unauthenticated
- [ ] `/login` redirects to `/dashboard` when already authenticated
- [ ] `npm run build` succeeds with no TypeScript errors
