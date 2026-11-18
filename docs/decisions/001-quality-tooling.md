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
  - ESLint's `complexity` stays at its documented default of 20 (eslint.org, rules/complexity) and is an error.
- **Reopens when:** Biome's Svelte support is stable and has the rules the Svelte checks need.

## Duplication

- **Need:** copy detection, a new block repeating an existing one fails (method section 5).
- **Candidates:**
  - jscpd 5 (native, MIT, no install script: `npm view jscpd` shows only optional platform packages);
  - fallow 3 (native, MIT; duplication plus complexity and dead code; its diff mode needs a base ref).
- **Decision:** jscpd over every non-test script (the dupes class), any clone fails.
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

**The allowed list**, stated once here; `dependency-review.yml`'s `allow-licenses` is equal to it: Apache-2.0,
BlueOak-1.0.0, BSD-2-Clause, BSD-2-Clause-Views, BSD-3-Clause, CC0-1.0, ISC, MIT. Another Category A licence or a listed Category B one
joins both in one commit. Measured with `pnpm licenses list`: every development dependency today is one of these.
The gate's licences step reads the list there and fails a licence pnpm cannot detect. Known limit: a licence written
as an SPDX expression (`MIT OR CC0-1.0`) fails its exact match, though dependency-review accepts it (issue #7).

BSD-2-Clause-Views joined the list by the owner's decision, 2026-11-17, for uri-js 4.4.1 (through ajv under eslint;
development only). It is BSD-2-Clause plus a disclaimer that the views are the authors' own. Category A as a variant
of "BSD (without advertising clause)" (INFERRED: the ASF page names that family's variants but not this one).

Category B licences in use: none today. Expected:

- MPL-2.0 (lightningcss, under Tailwind 4 and Vite 8);
- CC-BY-4.0 (caniuse-lite, under the browser-floor check).
  Both are development-only and listed here when they enter.

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
  request can already cause. A svelte-check bump re-opens this claim: the probe is run again first.
- **Covers** every path that brings in an affected picomatch (<= 4.0.7): a pull request that adds such a path to
  `pnpm-lock.yaml` is a ruling request. A runtime path cannot merge: the gate fails any runtime dependency but a
  `svelte` peer.
- **Removed when** no picomatch at or below 4.0.7 is left in `pnpm-lock.yaml` (`pnpm why picomatch`), or a fixed
  version is released: the commit that moves the lockfile removes the id from `dependency-review.yml` and this entry.

## Overrides

- **minimatch 11.0.8 under @typescript-eslint/typescript-estree** (`pnpm-workspace.yaml`), for GHSA-g3hv-75wg-m249
  (minimatch >= 7.0.0, < 11.0.1, fixed in 11.0.1). typescript-estree 8.72.2 asks for `^10.2.2`; between v8.72.2 and
  v8.73.0 its only minimatch change is that range, to `^11.0.1`. 8.73.0 is younger than the release age.
- **Removed** after 2026-11-19 17:15 UTC: a typescript-eslint >= 8.73.0 bump, Dependabot's too, merges only without it.

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
- **Decision:** the header rule, with the types `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`,
  `refactor`, `revert`, `style` and `test`.
- **Reopens when:** the release workflow's changelog generator is chosen; its parser then sets the rule.

## Reuse check against ontoprism

The owner's public repository github.com/hniedner/ontoprism (Apache-2.0) was read at its `main` (`e4f05c25`):
`frontend/eslint.config.js`, `frontend/vite.config.ts`, `frontend/vitest-setup-client.ts`,
`frontend/playwright.config.ts`, `.github/dependabot.yml` and the `web-tests` job of `.github/workflows/ci.yml`.

**Taken now:**

- Dependabot's `commit-message.prefix` per ecosystem (`ci` for GitHub Actions, `build` for npm), with
  `include: scope`: the commit-message check, from the next pull request (issue #6), needs conventional headers;
- `no-undef` off for TypeScript files, as typescript-eslint advises (`eslint.config.mjs`).

**To take with the layer that needs it:**

- with the first component test:
  - Vitest's `expect.requireAssertions: true` (method section 4: a test without an assertion fails);
  - the split into a Node project and a jsdom project with `resolve.conditions: ['browser']`;
  - a setup file with the jest-dom matchers and `cleanup()` after each test;
  - a Dependabot group that moves `vitest` and `@vitest/*` together, because they pin one another;
- with the Svelte lint: the Svelte block with `projectService`, `extraFileExtensions: ['.svelte']` and the
  TypeScript parser;
- with the real-browser tests: Playwright's `forbidOnly` in CI, and a `webServer` that builds the site and serves it.

**Left, with the reason:**

- ESLint ignores read from `.gitignore`: here the class table alone selects files.
- The `globals` package: a hand list is enough.
- Cooldowns of 14 and 7 days: the companion's G11 values and the 3-day release age decided in the review of this change stand.
- Playwright retries in CI: a flaky test is a defect to find, not to retry.
- Chromium only in CI: the method requires Chromium, Firefox and WebKit.
