import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [svelte()],
  resolve: { conditions: ["browser"] },
  test: {
    environment: "jsdom",
    // The gate's own node:test files under scripts/ are not Vitest tests
    include: ["src/**/*.test.ts", "site/**/*.test.ts"],
    setupFiles: ["./test/vitest-setup.ts"],
    expect: { requireAssertions: true },
  },
});
