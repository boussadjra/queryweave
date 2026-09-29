import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/docs-browser",
  fullyParallel: true,
  workers: 4,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4322",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter @queryweave/docs preview --host 127.0.0.1 --port 4322",
    // Keep Astro's agent-aware CLI attached to Playwright's managed child process.
    env: { ASTRO_PREVIEW_BACKGROUND: "1" },
    port: 4322,
    reuseExistingServer: !process.env.CI,
  },
});
