// The one Svelte config: svelte-check gets it with --config, so it imports no other svelte.config.* or vite.config.*.
// The Vite plugin reads it too (vitest.config.ts at the root; site/vite.config.ts names it), so every tool compiles
// the components the same way: runes only (PRD-K1, Svelte 5).
export default { compilerOptions: { runes: true } };
