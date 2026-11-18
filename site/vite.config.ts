import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// Builds site/index.html and what it loads into site/dist, the folder site/server.ts serves. The Svelte options
// come from the repository's one svelte.config.js.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [svelte({ configFile: "../svelte.config.js" })],
});
