---
paths:
  - "**/*.svelte"
  - "**/*.svelte.ts"
  - "**/*.css"
---

# Svelte 5 and Tailwind 4

- The yardstick is the official practice: https://svelte.dev/docs/svelte/best-practices for Svelte, and the
  Tailwind CSS 4 documentation (https://tailwindcss.com/docs) for styling. A departure from either is recorded with
  its reason and is the owner's decision.
- Runes only; no legacy Svelte syntax.
- Before designing a feature, study how vetted open implementations and the ARIA Authoring Practices solve it, then
  write our own; no code is copied from them. The owner's own earlier work is ported where it fits, as new work
  through the method; third-party code enters only through a library-first decision (method section 8).
- Logic lives in `.ts` and `.svelte.ts` files; markup stays thin, so mutation testing reaches it (method section 4).
- Nothing may need an inline style, an inline script or `eval`; text renders as text.
