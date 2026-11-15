import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

// В разработке API берётся из запущенного gateway (docker compose), тот же origin через прокси.
const gateway = process.env.GATEWAY_URL ?? "http://localhost:8090";

export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: gateway, changeOrigin: true },
      "/health": { target: gateway, changeOrigin: true },
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 400,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
