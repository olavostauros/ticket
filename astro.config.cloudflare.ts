import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import path from "path";
import { fileURLToPath } from "url";
import { validateEnv } from "./src/lib/env";

// Only validate env vars during build/start — not during astro check, astro dev, etc.
if (process.argv.some((arg) => arg === "build" || arg === "start")) {
  validateEnv();
}

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  output: "server",
  adapter: cloudflare({ mode: "directory" }),
  integrations: [react()],
  server: { port: 4321, host: true },
  vite: {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  },
});