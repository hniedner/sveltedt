// ESLint for the repository's own scripts. The reasons are in docs/decisions/001-quality-tooling.md or beside the rule.
// This file stays JavaScript: ESLint would need a further dependency (jiti) to load a TypeScript config.
import js from "@eslint/js";
import compat from "eslint-plugin-compat";
import svelte from "eslint-plugin-svelte";
import ts from "typescript-eslint";

// The Node globals the .mjs scripts use, listed by hand instead of a package: a missing name fails loudly.
const node = {
  Buffer: "readonly",
  URL: "readonly",
  console: "readonly",
  process: "readonly",
  setTimeout: "readonly",
  structuredClone: "readonly",
};

// Method section 5 (complexity) and PRD-S1 (no eval, new Function or string timers), for every script.
// For .ts the preset brings @typescript-eslint/no-implied-eval, which knows types, in place of the core rule.
const shared = {
  complexity: ["error", 20],
  "no-eval": "error",
  "no-implied-eval": "error",
  "no-new-func": "error",
};
// No inline configuration: a comment cannot switch a rule off (the lint canary plants one).
const linterOptions = {
  noInlineConfig: true,
  reportUnusedDisableDirectives: "error",
};

// Markup a component may not use. PRD-G2(b): forms the mutation tool does not mutate. PRD-S1: inline styles, in
// every element and through the {style} shorthand (svelte/no-inline-styles checks only plain HTML elements).
const markupBans = [
  [
    "SvelteDirective[kind='Class']",
    "class: directive (PRD-G2 b): use a class attribute expression",
  ],
  ["SvelteDirective[kind='Action']", "use: action (PRD-G2 b)"],
  [
    "SvelteDirective[kind='Binding']:not([key.name.name='this'])",
    "bind: other than bind:this (PRD-G2 b)",
  ],
  ["SvelteStyleDirective", "style: directive (PRD-G2 b, PRD-S1)"],
  ["SvelteSpreadAttribute", "spread attribute (PRD-G2 b)"],
  ["SvelteAttachTag", "{@attach} (PRD-G2 b)"],
  ["SvelteAttribute[key.name=/^style$/i]", "style attribute (PRD-S1)"],
  [
    "SvelteShorthandAttribute[key.name=/^style$/i]",
    "{style} shorthand (PRD-S1)",
  ],
  [
    "SvelteElement[kind='special'][name.name='svelte:head']",
    "svelte:head (PRD-S1, PRD-B19)",
  ],
].map(([selector, message]) => ({ selector, message }));
// Code a component may not run, in TypeScript and in components. PRD-S1: no injected style, link or script.
// PRD-S2: no raw HTML.
const scriptBans = [
  [
    "CallExpression[callee.property.name='setAttribute'][arguments.0.value=/^style$/i]",
    "setAttribute style (PRD-S1): set el.style properties",
  ],
  [
    "CallExpression[callee.property.name='createElement'][arguments.0.value=/^(style|link|script)$/i]",
    "createElement of style, link or script (PRD-S1)",
  ],
  [
    "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]",
    "innerHTML or outerHTML (PRD-S2)",
  ],
  [
    "CallExpression[callee.property.name='insertAdjacentHTML']",
    "insertAdjacentHTML (PRD-S2)",
  ],
].map(([selector, message]) => ({ selector, message }));

export default [
  js.configs.recommended,
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: { globals: node },
    linterOptions,
    rules: shared,
  },
  ...ts.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.svelte"],
  })),
  {
    files: ["**/*.ts", "**/*.svelte"],
    languageOptions: {
      // The planted canaries sit outside tsconfig.json (relative to this file); they get a default project.
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "scripts/canaries/*/*.ts",
            "scripts/canaries/*/*.svelte",
          ],
        },
        extraFileExtensions: [".svelte"],
      },
    },
    linterOptions,
    rules: {
      complexity: shared.complexity,
      "no-eval": shared["no-eval"],
      "no-new-func": shared["no-new-func"],
      // node:test's test() and describe() return a promise the runner awaits; typescript-eslint's documented way.
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            {
              from: "package",
              package: "node:test",
              name: ["test", "describe", "it", "suite"],
            },
          ],
        },
      ],
      // TypeScript checks undefined names itself; typescript-eslint advises turning this rule off (origin: docs/decisions/001).
      "no-undef": "off",
      "no-restricted-syntax": ["error", ...scriptBans],
    },
  },
  // After the TypeScript blocks: the Svelte parser reads components and .svelte.ts runes, TypeScript inside them.
  ...svelte.configs.recommended,
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: { parserOptions: { parser: ts.parser } },
    // No PostCSS: the plugin would load any postcss config from the folder upward, untracked ones included.
    settings: { svelte: { compileOptions: { postcss: false } } },
    linterOptions,
    rules: {
      // An HTML comment (<!-- eslint-disable -->) would switch rules off despite noInlineConfig (measured).
      "svelte/comment-directive": "off",
      "no-restricted-syntax": ["error", ...scriptBans, ...markupBans],
    },
  },
  // PRD-E1: browser APIs above the support floor, in TypeScript and components (the Node scripts use none). It flags only part of
  // them (docs/decisions/001-quality-tooling.md, Browser floor).
  {
    ...compat.configs["flat/recommended"],
    files: ["**/*.ts", "**/*.svelte"],
    settings: {
      browsers: [
        "chrome >= 111",
        "edge >= 111",
        "firefox >= 128",
        "safari >= 16.4",
      ],
    },
  },
];
