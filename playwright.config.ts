import { defineConfig, devices } from "@playwright/test";

// The real-browser layer (spec/site.md): the site's build served by its own server on its one address, in the three
// engines (the browser step requires these three names). A further browser instance (reduced motion, say) is one
// more entry of ENGINES with its own `use`.
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
  // Never a server already listening: it would test whatever holds the port, not this build
  webServer: {
    command: "node site/server.ts",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: false,
  },
});
