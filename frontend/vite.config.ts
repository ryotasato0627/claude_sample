import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // /api は backend へプロキシする(コンテナ間通信は BACKEND_URL)
    proxy: {
      "/api": { target: process.env.BACKEND_URL ?? "http://localhost:8080", changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
