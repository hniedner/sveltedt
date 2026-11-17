// ESLint for the repository's own scripts. The reason for each rule is in docs/decisions/001-quality-tooling.md.
import js from "@eslint/js";

// The Node globals the scripts use, listed by hand instead of a package: a missing name fails loudly.
const node = {
  Buffer: "readonly",
  URL: "readonly",
  console: "readonly",
  process: "readonly",
  setTimeout: "readonly",
  structuredClone: "readonly",
};

export default [
  js.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: node },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      complexity: ["error", 20],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
];
