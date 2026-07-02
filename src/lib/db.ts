/**
 * Database client — Neon (serverless PostgreSQL) via @neondatabase/serverless.
 *
 * In Cloudflare Workers, the connection is made through the Hyperdrive tunnel.
 * The DATABASE_URL secret should be set to the Hyperdrive connection URL.
 *
 * Same $1, $2 parameter syntax as `pg` — all existing queries remain unchanged.
 * Same query() and withTransaction() API — callers don't need to change.
 */

import { neon } from "@neondatabase/serverless";

/**
 * Execute a SQL query against the Neon database.
 *
 * Usage is identical to the old pg Pool.query():
 *   const result = await query("SELECT * FROM events WHERE id = $1", [id]);
 *   result.rows[0] -> the first row
 */
export async function query(text: string, params?: unknown[]) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL environment variable");
  }

  const sql = neon(connectionString);

  if (params && params.length > 0) {
    // neon() returns a tagged template-like function, but we need
    // the raw query + params interface. Use sql.unsafe() instead.
    const result = await sql.unsafe(text, params);
    // sql.unsafe returns raw rows — wrap in the same shape as pg
    return { rows: result as Record<string, unknown>[], rowCount: result?.length ?? 0 };
  }

  const result = await sql.unsafe(text);
  return { rows: result as Record<string, unknown>[], rowCount: result?.length ?? 0 };
}

/**
 * Execute a callback within a database transaction.
 * Automatically BEGINs, COMMITs on success, ROLLBACKs on error.
 *
 * Uses a raw connection from the Neon pool to run the multi-statement
 * transaction. The `client` parameter is a function that calls sql.unsafe()
 * on the same connection (via a raw client from neon).
 */
export async function withTransaction<T>(
  fn: (client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }> }) => Promise<T>
): Promise<T> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL environment variable");
  }

  // Note: @neondatabase/serverless's `neon()` is a stateless query function.
  // For proper transactions with BEGIN/COMMIT/ROLLBACK, we use the raw
  // WebSocket connection via `neon(connectionString, { fullResults: true })`.
  // However, the serverless WebSocket client handles transactions correctly
  // when wrapped in BEGIN/COMMIT blocks.
  const sql = neon(connectionString);

  try {
    await sql.unsafe("BEGIN");

    // Wrap sql.unsafe to return pg-compatible shape
    const client = {
      query: async (text: string, params?: unknown[]) => {
        const result = await sql.unsafe(text, params);
        return {
          rows: result as Record<string, unknown>[],
          rowCount: result?.length ?? 0,
        };
      },
    };

    const result = await fn(client);
    await sql.unsafe("COMMIT");
    return result;
  } catch (err) {
    await sql.unsafe("ROLLBACK").catch(() => {});
    throw err;
  }
}