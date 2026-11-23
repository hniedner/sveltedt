import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";

// Writes the package's stylesheet to the build folder as the file the package ships, unbundled and unminified: the host
// pages of THEME-10 link it as a static file
const packageStylesheet = (): Plugin => ({
  name: "package-stylesheet",
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "sdt/styles.css",
      source: readFileSync(join(import.meta.dirname, "../src/lib/styles.css")),
    });
  },
});

// Builds the pages of site/ (index, canary, sort and the four host pages) and what they load into site/dist, the folder site/server.ts serves.
// The Svelte options come from the repository's one svelte.config.js.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    tailwindcss(),
    svelte({ configFile: "../svelte.config.js" }),
    packageStylesheet(),
  ],
  build: {
    rollupOptions: {
      input: [
        join(import.meta.dirname, "index.html"),
        join(import.meta.dirname, "canary.html"),
        join(import.meta.dirname, "sort.html"),
        join(import.meta.dirname, "host-none.html"),
        join(import.meta.dirname, "host-bootstrap.html"),
        join(import.meta.dirname, "host-none-app.html"),
        join(import.meta.dirname, "host-bootstrap-app.html"),
      ],
    },
  },
});
