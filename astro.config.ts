import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import path from "path";
import { fileURLToPath } from "url";
import { validateEnv } from "./src/lib/env";

validateEnv();

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
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