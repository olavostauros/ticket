import { defineConfig } from "vitest/config";
import path from "path";

/**
 * DB test config — runs tests/db/ tests sequentially against a real Postgres.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/db/**/*.test.ts", "tests/e2e/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    setupFiles: [],  // don't use the default setup (mock env vars)
    fileParallelism: false,
    pool: "forks",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});