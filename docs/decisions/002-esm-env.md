# 002: Development-only output (`esm-env`)

Library-first evaluation (method section 8) for the one runtime dependency of the package. Facts were read on
2026-11-23 from the pages named, or measured with the command named; each is marked fetched or measured.

## Development-only output

- **Need:** SUP-04 of `spec/release.md` (the package's `dependencies` are exactly `esm-env`); RND-17 of
  `spec/table.md` (the console line for invalid input: the full text in development, the code only in production);
  CON-14 of `spec/package.md` (the production client build holds no fault text and no warning text); STK-10 later
  uses the same switch.
- **Constraints:** a library for Svelte 5 that runs in any bundler and under Node's server rendering; MIT; no
  install script (PRD-S5); no inline script or `eval` (PRD-S1); a production bundle must be able to drop what only
  development shows.
- **Candidates:**
  - `esm-env` 1.2.2: `DEV`, `BROWSER` and `NODE` decided by package export conditions.
  - `import.meta.env.DEV`: a bundler feature; `@sveltejs/package` warns against it in library code (fetched:
    github.com/sveltejs/kit/issues/11414 quotes "Avoid usage of `import.meta.env` in your code. It requires a
    bundler to work." and "Consider using packages like `esm-env` instead which provide cross-bundler-compatible
    environment variables.").
  - A check of `process.env.NODE_ENV` written by hand: browsers have no `process`, and a bundler replaces it only
    when told to; that fallback is what `esm-env` itself keeps behind the export conditions (measured: its
    `dev-fallback.js` reads `globalThis.process?.env?.NODE_ENV`).
  - Build the switch ourselves: export conditions in our own `package.json` and a file per condition, which is what
    `esm-env` is; the consumer would also need to name our conditions in its bundler.
  - No switch: log the full line always, which puts all fault texts into every production bundle.
- **`esm-env` against the criteria** (measured with the commands named, or fetched):
  - **Licence:** MIT (registry, fetched with `curl https://registry.npmjs.org/esm-env`).
  - **Maintenance:** latest release 1.2.2 on 2025-01-08, about 22 months before 2026-11-23; 9 releases in all, none
    in the 12 months before that date (registry); one maintainer on the registry; Svelte itself depends on it (its `package.json` declares
    `esm-env: ^1.2.1`, measured in the installed 5.57.3), so a defect would reach Svelte's own users first. A
    package that small and unchanged for a year is stable, not abandoned; the reopening trigger below covers a
    change.
  - **Size:** 10 files, 3,784 bytes unpacked (registry); each of the files the bundler reads is under 150 bytes
    gzipped (measured with `gzip -c`: `index.js` 116, `true.js` 49, `false.js` 51, `dev-fallback.js` 142);
    **zero** transitive dependencies (registry: no `dependencies`). Svelte already depends on it, so the range
    `^1.2.1` that Svelte declares adds no package to a consumer's tree (measured: the lockfile resolves one
    `esm-env@1.2.2` for Svelte and for us).
  - **Security:** no advisory (fetched: `POST https://api.osv.dev/v1/query` for npm `esm-env` returned `{}`). No
    OpenSSF Scorecard is published for the repository (measured: `curl -s -o /dev/null -w "%{http_code}"
https://api.securityscorecards.dev/projects/github.com/benmccann/esm-env` prints 404 on 2026-11-23).
  - **Install script:** none (registry: no `scripts` entry; PRD-S5).
  - **Fit:** met for SUP-04, RND-17 and CON-14. How `DEV` is decided (fetched: the package's own README, "Uses
    export conditions to return environment information"; the root entry re-exports `DEV` from the `./development` export of
    the installed package, whose map is `"development": "./true.js", "production": "./false.js", "default":
"./dev-fallback.js"`): under a `development` condition true, under `production` false, otherwise true unless
    `NODE_ENV` is unset or starts with "prod" (`dev-fallback.js`), so false in a browser that has neither. Vitest sets `NODE_ENV=test`, so component tests see it true.
  - **Own cost:** a hand-built switch is the same files plus the consumer's configuration, and a second source of
    truth beside the one Svelte already uses.
  - **Exit cost:** one import in one module (`DEV` read where the console line is written); replacing it touches
    that module and SUP-04's check.
- **How the practice divides** (fetched): Svelte's own warnings write the full text under `DEV` and a link that
  holds the code otherwise (installed `svelte/src/internal/client/warnings.js`); AG Grid's console line is "warning #id" or
  "error #id" with a link, the full message only with its validation module registered (github.com/ag-grid/ag-grid,
  `packages/ag-grid-community/src/validation/logging.ts`); MUI X's `warnOnce` is a no-op in production
  (github.com/mui/mui-x, `packages/x-internals/src/warning/index.ts`). RND-17 follows the first two.
- **Decision:** `esm-env`, as the one runtime dependency, at the range Svelte declares (SUP-04). The owner chose it on
  2026-11-19 for development-only output; this is its first use, for RND-17.
- **Dependabot:** `esm-env` is a runtime dependency, so Dependabot may propose a new range for it. That pull request
  fails the `lockfile` step on purpose: SUP-04 requires the range the installed Svelte declares. The fix is a visible
  hand step, as for the Playwright image: set the range in `package.json` to the one Svelte's own manifest declares,
  usually together with a Svelte bump. No `ignore` entry is added, because it would also block a security update of
  `esm-env`.
- **Reopens when:** Svelte drops `esm-env` (SUP-04's check would then report "could not check"), the package has an
  advisory, or its license changes.
