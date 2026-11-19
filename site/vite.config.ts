import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { join } from "node:path";
import { defineConfig } from "vite";

// Builds site/index.html and site/canary.html and what they load into site/dist, the folder site/server.ts serves. The Svelte options
// come from the repository's one svelte.config.js.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [tailwindcss(), svelte({ configFile: "../svelte.config.js" })],
  build: {
    rollupOptions: {
      input: [
        join(import.meta.dirname, "index.html"),
        join(import.meta.dirname, "canary.html"),
      ],
    },
  },
});
