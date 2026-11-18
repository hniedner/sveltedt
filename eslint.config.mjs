// ESLint for the repository's own scripts. The reason for each rule is in docs/decisions/001-quality-tooling.md.
// This file stays JavaScript: ESLint would need a further dependency (jiti) to load a TypeScript config.
import js from "@eslint/js";
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

export default [
  js.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: node },
    linterOptions,
    rules: shared,
  },
  ...ts.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  })),
  {
    files: ["**/*.ts"],
    languageOptions: {
      // The planted canaries sit outside tsconfig.json (relative to this file); they get a default project.
      parserOptions: {
        projectService: { allowDefaultProject: ["scripts/canaries/*/*.ts"] },
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
      // The preset replaces core no-implied-eval with @typescript-eslint/no-implied-eval, which knows types.
      // TypeScript checks undefined names itself; typescript-eslint advises turning this rule off (origin: docs/decisions/001).
      "no-undef": "off",
    },
  },
];
