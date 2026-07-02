import type { APIRoute } from "astro";
export const prerender = false;

import crypto from "node:crypto";
import { query } from "../../../lib/db";
import { hashPassword } from "../../../lib/password";
import { resetPasswordSchema } from "../../../lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../../../lib/rate-limit";
import { ok, err } from "../../../lib/api-utils";

/**
 * POST /api/auth/reset-password
 *
 * Validates the raw token and new password, hashes the token, looks up a
 * matching entry that hasn't expired or been used, then updates the
 * organizer's password_hash and marks the token as used.
 */
export const POST: APIRoute = async (context) => {
  try {
    const ip = getClientIp(context.request);
    const kv = (context.locals as any)?.runtime?.env?.RATE_LIMIT as KVNamespace | undefined;
    const { allowed, resetAt } = await checkRateLimit(`reset-password:${ip}`, 3, 60_000, kv);
    if (!allowed) return rateLimitResponse(resetAt);

    const body = await context.request.json();
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return err("Validation failed: " + parsed.error.issues.map((i: any) => i.message).join("; "), 400, "validation_error");
    }

    const { token: rawToken, password } = parsed.data;
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // Look up the token — must exist, not expired, and not already used
    const result = await query(
      "SELECT id, organizer_id, expires_at FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()",
      [tokenHash]
    );
    const tokenRow = result.rows[0] as { id: string; organizer_id: string; expires_at: Date } | undefined;

    if (!tokenRow) {
      return err("Token inválido ou expirado.", 400, "invalid_token");
    }

    // Hash the new password
    const passwordHash = await hashPassword(password);

    // Update the organizer's password and mark the token as used (in a transaction)
    await query("UPDATE organizers SET password_hash = $1 WHERE id = $2", [
      passwordHash,
      tokenRow.organizer_id,
    ]);
    await query("UPDATE password_reset_tokens SET used_at = now() WHERE id = $1", [
      tokenRow.id,
    ]);

    // Clean up expired/used tokens in the background
    query("SELECT clean_expired_password_reset_tokens()").catch(() => {});

    return ok({ message: "Senha redefinida com sucesso. Você já pode fazer login." });
  } catch (caughtErr) {
    console.error("Reset password error:", caughtErr);
    return err("Internal server error", 500);
  }
};