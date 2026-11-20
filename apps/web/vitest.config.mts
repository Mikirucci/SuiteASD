import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    // Rendering a whole page with its dialogs can take more than the default 5 s on a busy machine or a CI runner.
    testTimeout: 15_000,
    // The app calls a relative /api/v1; the fetch stubs of the tests parse absolute URLs.
    env: { NEXT_PUBLIC_API_URL: "http://localhost:3000/api/v1" },
  },
});
