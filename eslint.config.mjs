// ESLint for the repository's scripts and Svelte components. The reasons are in
// docs/decisions/001-quality-tooling.md or beside the rule.
// This file stays JavaScript: ESLint would need a further dependency (jiti) to load a TypeScript config.
import js from "@eslint/js";
import compat from "eslint-plugin-compat";
import svelte from "eslint-plugin-svelte";
import ts from "typescript-eslint";
import vitest from "@vitest/eslint-plugin";

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

// Markup a component may not use. PRD-G2(b): forms the mutation tool does not mutate. PRD-S1: a style attribute
// in any case on any element (the plugin's svelte/no-inline-styles, not enabled, checks only lowercase style on plain
// HTML elements), the {style} shorthand and style, link or script elements. PRD-S1 and PRD-B19: no svelte:head.
// PRD-T3: no <style> block. PRD-S2: no srcdoc, innerHTML or outerHTML attribute.
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
  [
    "SvelteStyleElement",
    "<style> block (PRD-T3): no CSS ships; use Tailwind classes",
  ],
  [
    "SvelteElement[kind='html'][name.name=/^(style|link|script)$/i]",
    "style, link or script element (PRD-S1)",
  ],
  [
    "SvelteElement[name.name='svelte:element'] > SvelteStartTag > SvelteAttribute[key.name='this'][value.0.value=/^(style|link|script)$/i]",
    "svelte:element as style, link or script (PRD-S1)",
  ],
  [
    "SvelteSpecialDirective[kind='this'][expression.value=/^(style|link|script)$/i]",
    "svelte:element this={...} as style, link or script (PRD-S1)",
  ],
  [
    ":matches(SvelteAttribute, SvelteShorthandAttribute)[key.name=/^srcdoc$/i]",
    "srcdoc attribute (PRD-S2)",
  ],
  [
    ":matches(SvelteAttribute, SvelteShorthandAttribute)[key.name=/^(innerHTML|outerHTML)$/]",
    "innerHTML or outerHTML attribute (PRD-S2): a custom element sets it as a property",
  ],
].map(([selector, message]) => ({ selector, message }));
// Code no file may hold: every .js, .mjs and .ts file and every component, the repository's scripts included.
// PRD-S1: no injected style, link or script. PRD-S2: no raw HTML, through a property, an object literal, an
// attribute, or an inserting or parsing call. PRD-T3 (with PRD-S1): no constructed or inserted style sheet.
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
    "CallExpression[callee.property.name='createElementNS'][arguments.1.value=/^(style|link|script)$/]",
    "createElementNS of style, link or script (PRD-S1)",
  ],
  [
    "CallExpression[callee.property.name='setAttribute'][arguments.0.value=/^(srcdoc|on\\w+)$/i]",
    "setAttribute srcdoc or an on* handler (PRD-S1, PRD-S2): script or markup from a string",
  ],
  [
    "AssignmentExpression:matches([left.property.name=/^(innerHTML|outerHTML|srcdoc)$/], [left.property.value=/^(innerHTML|outerHTML|srcdoc)$/])",
    "assigning innerHTML, outerHTML or srcdoc (PRD-S2)",
  ],
  [
    "ObjectExpression > Property:matches([key.name=/^(innerHTML|outerHTML|srcdoc)$/], [key.value=/^(innerHTML|outerHTML|srcdoc)$/])",
    "innerHTML, outerHTML or srcdoc in an object literal (PRD-S2)",
  ],
  [
    "Identifier[name=/^(setHTMLUnsafe|parseHTMLUnsafe|createContextualFragment)$/]",
    "setHTMLUnsafe, parseHTMLUnsafe or createContextualFragment (PRD-S2)",
  ],
  ["Identifier[name='DOMParser']", "DOMParser (PRD-S2)"],
  [
    "Identifier[name=/^(setHTML|createRawSnippet)$/]",
    "setHTML or createRawSnippet (PRD-S2): markup from a value",
  ],
  [
    "Identifier[name=/^(CSSStyleSheet|adoptedStyleSheets)$/]",
    "constructed or inserted style sheet (PRD-S1, PRD-T3)",
  ],
  [
    "MemberExpression[property.name=/^(insertRule|addRule)$/]",
    "a rule inserted into a style sheet (PRD-S1, PRD-T3)",
  ],
  [
    "MemberExpression[property.name=/^(write|writeln)$/]:matches([object.name=/^(document|ownerDocument|contentDocument)$/], [object.property.name=/^(document|ownerDocument|contentDocument)$/])",
    "document.write (PRD-S2)",
  ],
  ["Identifier[name='insertAdjacentHTML']", "insertAdjacentHTML (PRD-S2)"],
  [
    "CallExpression[callee.property.name='execCommand'][arguments.0.value=/^inserthtml$/i]",
    "execCommand insertHTML (PRD-S2)",
  ],
  [
    "MemberExpression[property.name='parseHTML']:matches([object.name='Document'], [object.property.name='Document'])",
    "Document.parseHTML (PRD-S2): markup from a value",
  ],
  // Every sink name of the bans above, in brackets, except innerHTML, outerHTML and srcdoc, whose bans read the quoted
  // form themselves (reading them is allowed): keep the list in step with them.
  [
    "MemberExpression[computed=true][property.value=/^(insertAdjacentHTML|setHTML|setHTMLUnsafe|parseHTML|parseHTMLUnsafe|createContextualFragment|createRawSnippet|DOMParser|write|writeln|execCommand|setAttribute|createElement|createElementNS|CSSStyleSheet|adoptedStyleSheets|insertRule|addRule)$/]",
    "a sink name in brackets (PRD-S1, PRD-S2, PRD-T3): write it with a dot, so the bans can read it",
  ],
].map(([selector, message]) => ({ selector, message }));

export default [
  js.configs.recommended,
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: { globals: node },
    linterOptions,
    rules: { ...shared, "no-restricted-syntax": ["error", ...scriptBans] },
  },
  {
    // The test site's plain scripts, served as they are (Vite's public folder): browser globals, listed by hand
    files: ["site/public/**/*.js"],
    languageOptions: { globals: { window: "writable", document: "readonly" } },
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
  {
    // The site's test files read the site's own build with DOMParser: PRD-S2 keeps raw HTML out of the component and
    // the site's source, not out of a test of the build. Only that one ban is lifted (reviewer's ruling, 2026-11-18).
    files: ["site/**/*.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...scriptBans.filter((ban) => ban.message !== "DOMParser (PRD-S2)"),
      ],
    },
  },
  // After the TypeScript blocks: the Svelte parser reads components and .svelte.ts runes, TypeScript inside them.
  ...svelte.configs.recommended,
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: { parserOptions: { parser: ts.parser } },
    // No PostCSS: for a <style lang="postcss"> block the plugin would load, and so run, any PostCSS config from the
    // working directory up to the home directory, untracked ones included.
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
  // Vitest's rules fire on test calls imported from "vitest" or used as globals; calls imported from node:test
  // (scripts/) are left alone. Not scoped by path: a block for test files only would give them a configuration
  // canary.ts does not prove, which the lint step's self-proof refuses; the rules are silent where no Vitest test is.
  {
    files: ["**/*.ts"],
    plugins: { vitest },
    rules: {
      // Method section 4: a test without an assertion, a skipped test or an expect without a matcher cannot fail,
      // and a focused test stops the others in its file from running.
      "vitest/expect-expect": "error",
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "error",
      "vitest/valid-expect": "error",
    },
  },
];
