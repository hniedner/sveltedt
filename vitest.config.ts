import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [svelte()],
  // Svelte resolves to its client build under jsdom, not its server build (decision 001)
  resolve: { conditions: ["browser"] },
  test: {
    environment: "jsdom",
    // The gate's own node:test files under scripts/ are not Vitest tests
    include: ["src/**/*.test.ts", "site/**/*.test.ts"],
    setupFiles: ["./test/vitest-setup.ts"],
    // A test without an assertion fails in local runs too; the gate forces the same flag (decision 001)
    expect: { requireAssertions: true },
  },
});
