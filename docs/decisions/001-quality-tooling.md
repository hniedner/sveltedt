# 001: Quality tooling

Library-first evaluations (method section 8) for the repository's own checks. Facts were read on 2026-11-17 from the
pages named, or measured with the command named.

## Hook runner

- **Need:** hooks installed by a setup step, verified by the gate (method section 10; companion G9).
- **Candidates:**
  - git's own `core.hooksPath` with our hook files;
  - husky 9 (a `prepare` script sets `core.hooksPath`);
  - lefthook 2 and simple-git-hooks 2 (both install from a `postinstall` script).
- **Decision:** `core.hooksPath`, no runner.
  - The setup step is `./scripts/setup`, a POSIX shell script that runs `git config core.hooksPath .githooks`; the
    gate's `hooks` step fails until it has run, and prints it. It stops when another `core.hooksPath` is set, as
    lefthook's install does unless forced (read 2026-11-18, lefthook.dev/usage/commands/install: it stops when
    `core.hooksPath` is set), instead of replacing it silently.
  - Each hook is a two-line shim into `scripts/check-repo.ts`, the layout husky 9 uses for `.husky/` (read
    2026-11-18, typicode.github.io/husky/get-started.html).
  - pre-commit refuses a staged file that was changed again, instead of hiding the unstaged change in a stash and
    restoring it after, which is lint-staged's default (read 2026-11-18, github.com/lint-staged/lint-staged). The
    checks read the work tree, so it must match what is committed, and a hook that changes no file cannot lose an
    unstaged change.
  - The companion already prescribes it.
  - husky only wraps the same setting.
  - lefthook and simple-git-hooks need an install-script exception that PRD-S5 forbids. pnpm blocks dependency
    build scripts by default, and lefthook's own docs say its hooks are then not installed (lefthook.dev,
    installation for Node).
- **Reopens when:** a hook needs a feature we would have to build ourselves.

## Formatter and linter

- **Need:** formatting and lint in the gate (method section 10, PRD-G3), complexity as a failing check (method
  section 5), no `eval`, `new Function` or string timers (PRD-S1).
- **Candidates:**
  - Biome 2: its Svelte parsing, formatting and linting are marked "Experimental" (biomejs.dev, language support);
  - Prettier 3 with prettier-plugin-svelte, plus ESLint 10 with eslint-plugin-svelte.
- **Decision:** Prettier formats and ESLint lints; ESLint carries no formatting rule.
  - Prettier reads `.editorconfig` (prettier.io, configuration), so editors and the formatter share one file.
  - The gate fixes Prettier's config to the `prettier` key of the root `package.json`: a Prettier config file
    anywhere else is not read, so it cannot change what "formatted" means in its folder or run code.
  - A `.editorconfig` outside the root has no file class, so the gate and the pre-commit hook refuse it as a file of
    no class (the `text` step names it): the format rules of a folder are not changed by a file the gate does not
    classify.
  - ESLint's `complexity` stays at its documented default of 20 (eslint.org, rules/complexity) and is an error.
- **Reopens when:** Biome's Svelte support is stable and has the rules the Svelte checks need.

## Browser floor

- **Need:** PRD-E1: JavaScript APIs above the support floor (Chrome and Edge 111, Firefox 128, Safari 16.4) are
  flagged, and the support statement says the floor is covered by that check only.
- **Decision:** eslint-plugin-compat 7.0.2, recommended, with the floor in `settings.browsers` (no browserslist file
  to classify), on every `.ts` and `.svelte` file; the TypeScript scripts run on Node and raise nothing, and the
  `.mjs` and `.js` files (scripts and configuration) are not checked by it.
- **Measured limit** (eslint-plugin-compat 7.0.2, 2026-11-17): it flags `new IdleDetector()` and
  `new PaymentRequest()` in `.ts`, `.mjs` and `.svelte`, but not `navigator.share`, `showOpenFilePicker`,
  `new CloseWatcher()`, `Promise.withResolvers()` or `[].toSorted()`, even with `lintAllEsApis`. The support
  statement says so; the real-browser tests of PRD-E1 are the proof for the floor browsers.

## Duplication

- **Need:** copy detection, a new block repeating an existing one fails (method section 5).
- **Candidates:**
  - jscpd 5 (native, MIT, no install script: `npm view jscpd` shows only optional platform packages);
  - fallow 3 (native, MIT; duplication plus complexity and dead code; its diff mode needs a base ref).
- **Decision:** jscpd over every non-test script (the dupes class), any clone fails. Svelte components are not in
  the class: jscpd 5.4.3 counts a component as several sources and names none (measured, 2026-11-17), so the step
  cannot prove each one analysed. Review guards duplicated markup until that is solved (issue #7, the remaining
  gate checks).
  - The scripts start at zero clones, so "no clone in them" equals "no new block repeats an existing one"
    without a base ref.
  - fallow's complexity check would repeat ESLint's (method section 5, one source).
- **Measured on jscpd 5.4.3:**
  - a file shorter than the 50-token minimum is not counted as a source; such a file cannot hold a clone;
  - `--fail-on-empty` exits 1 when no file is analysed (not used: the step demands every file in the report);
  - reported paths are basenames unless `--absolute` is given.
- **Reopens when:** the repository must accept a known clone.

## pnpm settings

- **pnpm 12.19.0**, pinned in `packageManager`.
- **`pmOnFail: ignore`.** Without it pnpm 12 writes a leading boot document into `pnpm-lock.yaml` (pnpm.io,
  package_json). Measured: the same install without the setting produced a lockfile of two YAML documents. A
  two-document lockfile is invisible to GitHub's dependency graph (companion G11), so the gate's `toolchain` step
  checks the pnpm version instead.
- **No allowed build scripts; `strictDepBuilds: true`** (PRD-S5).
- **`minimumReleaseAge: 4320`** (3 days).
  - pnpm re-applies the age to every lockfile entry on each install (pnpm.io, settings, `trustLockfile`). It
    therefore equals Dependabot's shortest npm cooldown, so Dependabot never proposes a version pnpm refuses.
  - A security fix younger than that is listed under `minimumReleaseAgeExclude` with its GHSA id on the same line,
    and the gate checks it. Decided in the review of this change: the cooldown guards against a poisoned release, and a security fix is
    not held back by policy.

## Licences

- **What ships** (the npm tarball, `dependencies`, `peerDependencies`): Apache Software Foundation Category A only.
  The gate asserts there is no runtime dependency and no peer but `svelte` (PRD-S5).
- **Development dependencies:**
  - Category A or CC0-1.0;
  - or a Category B licence listed here by name with its package.
- **Category X**, or a licence on no list, stops the work.
- **Programs the checks only run** are outside this rule, whatever their licence: they are never linked, bundled or
  distributed, and they are not packages in the lockfile. The ASF page draws the same line: "using a GPL'ed tool
  during the build is okay, but including GPL'ed source code is not" (https://www.apache.org/legal/resolved.html).
  Today: git, Node, pnpm, gitleaks, actionlint, shellcheck and zizmor; with later checks, the browsers that
  `playwright install` downloads.

Source: apache.org/legal/resolved.html. Category B "may be, under certain conditions, included".

**The allowed list**, stated once here; `dependency-review.yml`'s `allow-licenses` is equal to it: 0BSD, Apache-2.0,
BlueOak-1.0.0, BSD-2-Clause, BSD-2-Clause-Views, BSD-3-Clause, CC-BY-4.0, CC0-1.0, ISC, MIT, MPL-2.0. Another
Category A licence or a listed Category B one
joins both in one commit. Measured with `pnpm licenses list` on 2026-11-17: every development dependency is one of these.
The gate's licences step reads the list there and fails a licence pnpm cannot detect. Known limit: a licence written
as an SPDX expression (`MIT OR CC0-1.0`) fails its exact match, though dependency-review accepts it (issue #7).

BSD-2-Clause-Views joined the list by the owner's decision, 2026-11-17, for uri-js 4.4.1 (through ajv under eslint;
development only). It is BSD-2-Clause plus a disclaimer that the views are the authors' own. Category A as a variant
of "BSD (without advertising clause)" (INFERRED: the ASF page names that family's variants but not this one).

Three more joined the list by the owner's decision, 2026-11-17, all development only:

- CC-BY-4.0 (Category B, READ): caniuse-lite, through browserslist under eslint-plugin-compat; needed from the
  pull request that brings the Svelte checks on.
- MPL-2.0 (Category B, READ): lightningcss, through Vite and @tailwindcss/node; needed from the first build of the
  component on.
- 0BSD (Category A, READ: "Zero-Clause BSD"): tslib, through an optional WebAssembly part of Vite's bundler; needed
  from the first build of the component on.

A licence on this list lets any later development tool under it pass. What keeps such a tool out of the published
package is the gate's rule that nothing ships but a `svelte` peer.

## Test toolchain

Development dependencies, exact versions, MIT, no install script (`allowBuilds: {}`); their advisories are the
picomatch entry below.

- **vitest 5.1.0:** runs PRD-G1 and G2 and the companion's component layer (gates.md).
- **@vitest/coverage-v8 5.1.0:** the Vitest team's V8 coverage provider, exact peer `vitest` 5.1.0; the shared test
  run writes the lcov report `diff-coverage` reads (gates.md G4). It adds ten packages, all MIT and none with an
  install script: @babel/parser, @babel/types and @babel/helper-string-parser 7.29.14, @bcoe/v8-coverage 1.0.2,
  @vitest/istanbul-lib-coverage and @vitest/istanbul-lib-report 2.1.1, ast-v8-to-istanbul 1.0.8, js-tokens 10.0.0,
  magicast 0.5.5, tinyrainbow 3.2.0. Dependabot moves it with vitest in one group (G11).
- **@vitest/eslint-plugin 1.6.28:** the Vitest team's lint rules; four are used (no test without an assertion, no
  expect without a matcher, no focused and no skipped test), each with a canary.

## Component toolchain (build 1a)

Development dependencies on the same terms as the test toolchain.

- **vite 8.3.8, jsdom 31.0.1, tailwindcss 4.3.5, @testing-library/svelte 5.4.2:** chosen before this build: Vite
  builds PRD-P3's size probe, Tailwind 4 is PRD-T3's, jsdom is the component layer of risk R3, and Vitest with
  Testing Library is the companion's component layer (gates.md, mutation).
- **@sveltejs/vite-plugin-svelte 7.3.1:** the Svelte team's plugin that compiles components for Vite and Vitest; the
  alternative is none (Svelte's own compiler has no Vite integration of its own).
- **@tailwindcss/vite 4.3.5:** Tailwind's own Vite integration for version 4 (the PostCSS route would add a PostCSS
  config, which the Svelte lint's settings keep out).
- **parse5 8.1.1:** POL-03's scan reads the site's built HTML with the WHATWG parser that jsdom (already here)
  uses; it was in the lockfile through jsdom, so the pin adds no package. jsdom from `scripts/` would need a
  second type package and a whole DOM; a regular expression does not parse HTML as a browser does. A jsdom bump
  that needs another parse5 moves this pin with it.
- **`import.meta.main` in `site/server.ts`:** the documented way for an ES module to know it is the program's entry
  (Node 24.2 and later; "Stability: 1.0 - Early development" in the Node.js v26.13.1 documentation, read
  2026-11-18). An early-development feature may change in a minor release: when the Node pin moves, the site
  server's start is checked against that release's notes.

- **postcss 8.5.33 and postcss-selector-parser 7.2.1** (MIT, exact pins): the stylesheet checks (THEME-01, 02, 04,
  12 and 13) read `src/lib/styles.css` with the parser Vite and the Svelte lint already use, and count specificity
  with the selector parser. Both were in the lockfile (through eslint-plugin-svelte and vite), so the pins add no
  package and change no resolved version (6 lockfile lines, the importer block). Checked 2026-11-23 against the
  registry: released 2026-11-13 and 2026-11-12, past the cooldown. lightningcss, also in the tree, drops comments
  (THEME-13 reads them) and has no specificity; css-tree adds two packages and its colour data lags. Values are read
  with postcss's own `list.space` and `list.comma`, so no value parser is added. Dependabot moves both in
  `npm-minor-and-patch`.

- **@sveltejs/package 3.0.3, publint 0.3.25 and @arethetypeswrong/cli 0.18.5** (MIT, exact pins): the package step
  (PKG-01 to 05 and 07) builds `src/lib` with `svelte-package`, packs with `pnpm pack` and reads the tarball; publint
  and attw run on it. 60 packages are added to the lockfile, none removed or re-resolved; every licence is on the allow
  list. Docs read 2026-11-23: the Svelte packaging guide (`.ts` files are imported with a `.js` ending; `files` takes
  `!dist/**/*.test.*`), the attw README (`--pack` uses npm only, so the pnpm tarball is passed as a path) and publint's
  `--help` (a tarball path is accepted). Measured the same day: svelte-package leaves `.ts` specifiers inside `.svelte`
  files, so the two components import with `.js` and PKG-07 keeps it so; publint passes a package whose consumer build
  fails on that. attw runs with the `esm-only` profile (the package is ESM only), without `./styles.css`
  (a CSS file is not a module) and with `internal-resolution-error` ignored (node16 on the `.svelte` re-exports;
  Svelte consumers resolve with `bundler`, green); CON-04 proves the types for a real consumer.
  The repository's own `exports` stay at `src/lib` for the site's workspace link; the dist exports are
  `publishConfig.exports`, which pnpm (not npm) replaces when it packs, so every statement reads the tarball and the
  release publishes that tarball (#171). The Svelte peer is `^5.20.0`: the Svelte changelog's `## 5.20.0` lists
  "feat: SSR-safe ID generation with `$props.id()` (#15185)", which the table's ids need. Limit: no CI run exists at
  that floor yet (#159), and later fixes to `$props.id()` (5.39.5, 5.45.4) are above it.

- **@sveltejs/kit 3.4.0 and @sveltejs/adapter-node 6.0.5** (MIT, exact pins, `consumer/package.json` only; nothing
  ships): the consumer project (CON statements of `spec/package.md`) is a SvelteKit app built for Node, installed with
  its own lockfile and settings (SUP-10). Both are the latest releases past the 3-day cooldown on 2026-11-23 (Kit
  published 2026-11-18); the rest of its tree is the root's pins (vite 8.3.8, vite-plugin-svelte 7.3.1, svelte 5.57.3,
  typescript 6.0.3, svelte-check 4.7.8); Kit's peers (`svelte ^5.57.1`, `vite ^8.0.12`) are met. A scratch install
  resolved 56 packages, 71 MB, every licence on the allow list. Measured the same day with this tree: in nonce mode
  Kit sends exactly the header CON-04 states and its route announcer style hashes to the hash CON-04 names; Kit 3 reads
  its options from `vite.config.js` (a `kit:` namespace is an error) and writes the generated tsconfig under
  `node_modules/$app/tsconfig.json`.

## Real-browser toolchain (build 2a)

- **@playwright/test 1.65.1** (Apache-2.0, exact pin; with playwright and playwright-core 1.65.1, Apache-2.0, no install
  script): runs the real-browser layer against the built test site in Chromium, Firefox and WebKit, behind the gate's
  `browser` step. Vitest browser mode was left: it injects inline code into the page under test, which the strict
  policy of PRD-S1 refuses on the very page the tests read; Playwright's component testing was left as well (its own
  bundler, not the site's build that POL-04 proves).
- **The browsers** come from `playwright install`, from Playwright's download hosts over TLS with no hash pinned by
  this repository: they are programs the checks run (Licences, above). A Playwright bump changes them, so its pull
  request is read with the release notes.

## Accepted advisories

- **GHSA-fc5q-39xc-vjpf** (picomatch <= 4.0.7, ReDoS from a crafted glob pattern, high, no fixed version), reached
  through typescript-eslint (typescript-estree, tinyglobby, fdir) and svelte-check (fdir); development only. Owner's
  decision, 2026-11-17: allowed by its id in `dependency-review.yml`. Why, measured on 2026-11-17 with svelte-check
  4.7.8: no pattern reaches the vulnerable picomatch 4.0.7 that dependency-review reports. Through typescript-eslint,
  `allowDefaultProject` goes to minimatch. Through svelte-check, the installed fdir and picomatch are never run:
  svelte-check bundles its own fdir and picomatch 4.0.3 (found by comparing with the published versions), inside the
  advisory's range and NOT visible to dependency-review, and that copy is only loaded: no glob call exists in it and
  all its file filters are predicates. Patterns reach prettier's bundled picomatch 2.3.2 only from a Prettier config
  file in the tree, which a pull request can add in any folder. The effect is at most a hung gate, which a pull
  request can already cause. A svelte-check bump re-opens this claim: before it merges, the bundled picomatch is
  instrumented again and svelte-check run with extglob patterns in tsconfig.json's include and exclude.
  Measured on 2026-11-18 with vite 8.3.8 and vitest 5.1.0: vite, vitest and their plugins run the vulnerable
  picomatch 4.0.7 itself, with no vendored copy. Every pattern that reaches it in our set-up comes from vite's and
  vitest's fixed defaults or from our own tracked config; `import.meta.glob` turns extglobs off, Tailwind's `@source`
  is scanned in Rust, and a package's `sideEffects` patterns never reach picomatch in vite 8. Only a pull request
  that writes an extglob into a Vite, Vitest or Svelte config and adds a matching file name can slow it down; the
  effect is at most a hung test step, bounded by the job timeout, which that pull request can already cause. How it
  was measured: a module hook that replaced `picomatch` with a wrapper logging every pattern, its `noextglob` flag,
  its caller and any match slower than 50 ms, run with a test run, the site build and the dev server. Not run under
  it, and inferred to take their patterns from the same tracked config: coverage (its include is the gate's fixed
  `src/**/*.{ts,svelte}`, no extglob), a mutation runner once it is added, and vite's server-side resolve paths. A
  bump of vite, vitest, @sveltejs/vite-plugin-svelte or @tailwindcss/vite re-opens this claim: before it merges,
  picomatch is logged again the same way.
- **Covers** every path that brings in an affected picomatch (<= 4.0.7): a pull request that adds such a path to
  `pnpm-lock.yaml` is a ruling request. A runtime path cannot merge: the gate fails any runtime dependency but a
  `svelte` peer.
- **Removed when** no picomatch at or below 4.0.7 is left in `pnpm-lock.yaml` (`pnpm why picomatch`), or a fixed
  version is released: the commit that moves the lockfile removes the id from `dependency-review.yml` and this entry.

## Overrides

Two, both for `@stryker-mutator/core` 10.1.1 (the `mutation` step, #136), set in `pnpm-workspace.yaml`:

- `@stryker-mutator/core>minimatch` to 11.0.1 (core asks for `~10.2.4`): GHSA-g3hv-75wg-m249, fixed in 11.0.1. 11.0.1 was
  published 2026-10-27, past the 3-day release age.
- `typed-rest-client>qs` to 6.16.1 (typed-rest-client 2.3.1 pins 6.15.1): GHSA-q8mj-m7cp-5q26, GHSA-x5fp-wj9c-mxmx,
  GHSA-4mjr-xmp4-gh2g and GHSA-6pq8-jhm2-2vcw, all fixed by 6.16.1 (published 2026-10-14).

Why: without them `pnpm audit` reports 5 moderate advisories added by the two packages, and dependency-review fails
on any. Measured 2026-11-22: a whole-`src` Stryker run (668 mutants keyed by file, position, mutator and replacement)
gives the same status for every mutant with and without the overrides, and `pnpm audit` after them reports no known
vulnerabilities. Neither package is reached by the step's use: minimatch matches the `mutate` globs, qs belongs to the
dashboard reporter, which the step does not use.

Removal: when `@stryker-mutator/core` no longer resolves a vulnerable minimatch or qs; Dependabot's `stryker` group
shows it. The earlier override (minimatch 11.0.8 under typescript-estree) came out with typescript-eslint 8.73.0.

## Pinned programs

- **zizmor runs offline** (`--offline`): its online audits (does a pinned SHA belong to its tag, is an action known
  to be vulnerable) do not run, and the `pins` step checks a pin's shape only. Whether CI runs it online with the
  workflow token is a later ruling.
- **The `scripts/<name>.version` pins** (actionlint, zizmor, gitleaks) are not watched by Dependabot. A maintainer
  moves one by hand, in a `build:` commit that changes the version and its sha256 lines together, when a release
  is at least 7 days old (the actions' cooldown) or at once for a security fix.

## Commit messages

- **Need:** the changelog is generated from commit messages (method section 7, PRD-K3).
- **Candidates:**
  - commitlint 21 with its conventional config (8 direct dependencies; body lines over 100 characters are errors,
    which Dependabot's bodies exceed);
  - a header rule in the gate's runner.
- **Decision:** the header rule. The allowed types are listed once, in `TYPES` in `scripts/check-repo.ts`; a
  header of the wrong shape is refused with that list. No document copies the list.
- **Reopens when:** the release workflow's changelog generator is chosen; its parser then sets the rule, and a
  test proves that the types its configuration knows equal `TYPES`.

## Reuse check against ontoprism

The owner's public repository github.com/hniedner/ontoprism (Apache-2.0) was read at its `main` (`e4f05c25`):
`frontend/eslint.config.js`, `frontend/vite.config.ts`, `frontend/vitest-setup-client.ts`,
`frontend/playwright.config.ts`, `.github/dependabot.yml` and the `web-tests` job of `.github/workflows/ci.yml`.

**Taken now:**

- Dependabot's `commit-message.prefix` per ecosystem (`ci` for GitHub Actions, `build` for npm), with
  `include: scope`: the `commits` step needs conventional headers;
- `no-undef` off for TypeScript files, as typescript-eslint advises (`eslint.config.mjs`);
- with the Svelte lint: the Svelte block with `projectService`, `extraFileExtensions: ['.svelte']` and the
  TypeScript parser.

**To take with the layer that needs it:**

- with the first component test (taken in build 1a): `expect.requireAssertions: true` for local runs (the gate forces
  it, and refuses `projects`; method section 4), `resolve.conditions: ['browser']`, and a setup file with `cleanup()`
  after each test;
- with the real-browser tests: Playwright's `forbidOnly` in CI, and a `webServer` that builds the site and serves it.

**Left, with the reason:**

- The split into a Node and a jsdom project: the site server's test file names the Node environment in its first
  line (`// @vitest-environment node`).
- The jest-dom matchers: the tests assert with Vitest's own `expect`.
- ESLint ignores read from `.gitignore`: here the class table alone selects files.
- The `globals` package: a hand list is enough.
- Cooldowns of 14 and 7 days: the companion's G11 values and the 3-day release age decided in the review of this change stand.
- Playwright retries in CI: a flaky test is a defect to find, not to retry.
- Chromium only in CI: the method requires Chromium, Firefox and WebKit.
