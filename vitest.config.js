import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,js}"],
    exclude: ["tests/e2e/**"],
    reporters: ["verbose", "./scripts/vitest-progress.js"],
  },
});
