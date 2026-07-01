const requiredVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ABACATEPAY_API_KEY",
  "RESEND_API_KEY",
  "NEXT_PUBLIC_APP_URL",
] as const;

const missing = requiredVars.filter((key) => !process.env[key]);

if (missing.length > 0) {
  const msg = `Missing required environment variables: ${missing.join(", ")}`;
  if (process.env.NODE_ENV === "production") {
    throw new Error(msg);
  }
  if (process.env.NODE_ENV === "test") {
    // In tests, env vars are set in setup.ts beforeAll. Don't throw here
    // because module hoisting may evaluate this before beforeAll runs.
    console.warn(`[env] ${msg}`);
  } else {
    throw new Error(msg);
  }
}