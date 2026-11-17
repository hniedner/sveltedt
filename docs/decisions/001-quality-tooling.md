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
- **Decision:** jscpd over the whole repository, any clone fails.
  - The repository starts at zero clones, so "no clone anywhere" equals "no new block repeats an existing one"
    without a base ref.
  - fallow's complexity check would repeat ESLint's (method section 5, one source).
- **Measured on jscpd 5.4.3:**
  - a file shorter than the 50-token minimum is not counted as a source; such a file cannot hold a clone;
  - `--fail-on-empty` exits 1 when no file is analysed;
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
    and the gate checks it. Reviewer ruling: the cooldown guards against a poisoned release, and a security fix is
    not held back by policy.

## Licences

- **What ships** (the npm tarball, `dependencies`, `peerDependencies`): Apache Software Foundation Category A only.
  The gate asserts there is no runtime dependency and no peer but `svelte` (PRD-S5).
- **Development dependencies:**
  - Category A or CC0-1.0;
  - or a Category B licence listed here by name with its package.
- **Category X**, or a licence on no list, stops the work.

Source: apache.org/legal/resolved.html. Category B "may be, under certain conditions, included", and "using a GPL'ed
tool during the build is okay, but including GPL'ed source code is not".

Measured with `pnpm licenses list`: every development dependency today is MIT, Apache-2.0, BlueOak-1.0.0,
BSD-2-Clause, BSD-3-Clause or ISC, all Category A. `dependency-review.yml` allows exactly these.

Category B licences in use: none today. Expected:

- MPL-2.0 (lightningcss, under Tailwind 4 and Vite 8);
- CC-BY-4.0 (caniuse-lite, under the browser-floor check).
  Both are development-only and listed here when they enter.

## Commit messages

- **Need:** the changelog is generated from commit messages (method section 7, PRD-K3).
- **Candidates:**
  - commitlint 21 with its conventional config (8 direct dependencies; body lines over 100 characters are errors,
    which Dependabot's bodies exceed);
  - a header rule in the gate's runner.
- **Decision:** the header rule, with the types `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`,
  `refactor`, `revert`, `style` and `test`.
- **Reopens when:** the release workflow's changelog generator is chosen; its parser then sets the rule.
