export function validateEnv(): void {
  const required = [
    "DATABASE_URL",
    "JWT_SECRET",
    "RESEND_API_KEY",
    "PUBLIC_APP_URL",
  ] as const;
  // CRON_SECRET was removed — Cloudflare Cron Triggers handle authentication internally

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}