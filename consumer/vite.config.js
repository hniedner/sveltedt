// SvelteKit 3 reads its options from here, not from a svelte.config.js. Nonce mode makes the framework's own bootstrap
// script carry a fresh nonce per response; the one style-src-attr hash allows only the route announcer's style
// (PRD-W8, CON-04 of spec/package.md).
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";

export default {
  plugins: [
    sveltekit({
      adapter: adapter(),
      compilerOptions: { runes: true },
      csp: {
        mode: "nonce",
        directives: {
          "default-src": ["self"],
          "script-src": ["self"],
          "style-src": ["self"],
          "style-src-attr": [
            "unsafe-hashes",
            "sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo=",
            "report-sample",
          ],
        },
      },
    }),
  ],
};
