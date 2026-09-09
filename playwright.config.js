import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  outputDir:
    process.env.VERIFY_OUTPUT_DIR ??
    join(tmpdir(), `growordie-playwright-${process.pid}`),
  reporter: [["list"], ["./scripts/playwright-progress.js"]],
  use: { browserName: "chromium", headless: true, trace: "retain-on-failure" },
});
