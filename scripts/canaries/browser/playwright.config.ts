import { defineConfig } from "@playwright/test";

// The browser step's canary: one planted failing test that needs no browser, which the run must report
export default defineConfig({ testDir: ".", forbidOnly: true, retries: 0 });
