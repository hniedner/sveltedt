import { defineConfig, devices } from "@playwright/test";

// The real-browser layer (spec/site.md): the site's build served by its own server on its one address, in the three
// engines (the browser step requires these three names). A test that needs another setting (reduced motion, say) sets
// it for its describe with `test.use`, in each of the three engines.
const ENGINES = [
  { name: "chromium", use: devices["Desktop Chrome"] },
  { name: "firefox", use: devices["Desktop Firefox"] },
  { name: "webkit", use: devices["Desktop Safari"] },
];

export default defineConfig({
  testDir: "site/browser",
  // A focused test must not pass for the whole run; a flaky test is a defect to find, not to retry (decision 001)
  forbidOnly: true,
  retries: 0,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4173" },
  projects: ENGINES,
  // Never a server already listening: it would test whatever holds the port, not this build. The consumer's servers
  // (4174 production, 4175 development) come from one copy the command prepares itself: Playwright starts a webServer
  // before any global setup.
  webServer: [
    {
      command: "node site/server.ts",
      url: "http://127.0.0.1:4173/",
      reuseExistingServer: false,
    },
    {
      command: "node scripts/consumer-serve.ts",
      url: "http://127.0.0.1:4174/",
      reuseExistingServer: false,
      timeout: 180_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    },
  ],
});
