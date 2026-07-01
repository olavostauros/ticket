export function validateEnv(): void {
  const required = [
    "DATABASE_URL",
    "JWT_SECRET",
    "ABACATEPAY_API_KEY",
    "RESEND_API_KEY",
    "PUBLIC_APP_URL",
  ] as const;

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}