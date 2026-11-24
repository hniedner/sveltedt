# Contributing to SvelteDT

Thank you for your interest. The project is pre-release: the README's Status says what is built so far, and its
section "See it running" starts the test site. Every change follows
[the engineering method](docs/engineering/method.md); [the companion](docs/engineering/gates.md) says how each check
works. This page is the short version.

## The gate

An unreviewed branch's `pnpm install` and `pnpm gate` run its code as you, wherever they run: leave them to CI, which
runs a pull request with a read-only token and no secrets. Read such a branch with `git fetch` and
`git diff origin/main...<ref>`, and check it out, merge it or pull it only in a separate clone without
`core.hooksPath`, or with `git -c core.hooksPath=/dev/null` in front of the checkout, merge or pull command. That
option covers only the command it precedes: every later git command in that clone (a commit, a merge, a pull) runs the
hooks of the checked-out tree again. With the setting in place, git runs any hook the branch puts in `.githooks/`, such
as post-checkout on a checkout or post-merge on any merge or pull, a fast-forward included (measured), and commit-msg
on a merge commit (Git hooks and commit headers). A tracked hooks folder runs what the checked-out tree holds, as in
every project that tracks its hooks; the gate's `hooks` step refuses a file there that is not one of the three shims, in
CI too.

One command runs every check that exists today, in order, stopping at the first finding or could-not-check:

```sh
./scripts/setup   # once per clone: the `hooks` step fails until it has run
pnpm install --frozen-lockfile
pnpm gate
```

It needs Node (the major version in `.node-version`), pnpm (the version in `package.json`'s `packageManager`),
and the pinned programs the checks run: actionlint with shellcheck, zizmor and gitleaks (each version in
`scripts/<name>.version`). On macOS: `brew install actionlint shellcheck zizmor gitleaks`; on Linux, the release
archives that `.github/workflows/ci.yml` installs, checked against the sha256 lines in `scripts/<name>.version`, and shellcheck from
the package manager (CI uses the runner's copy). Any other version than the pin, older or newer, makes the gate
answer `COULD NOT CHECK` until the pin moves; Prettier, ESLint, TypeScript and jscpd are pinned by `package.json`.
The browser step also needs the browsers of the pinned Playwright (`pnpm exec playwright install`; on Linux with
`--with-deps`; CI uses Playwright's image instead, whose tag a Playwright bump must move too, see the gate's finding)
and 127.0.0.1:4173 free: stop `pnpm site:serve` first.
The gate reads tracked files: a new file counts once it is added with `git add`.

Each check ends with one line: `PASS`, `FINDING`, `COULD NOT CHECK`, or `NOT APPLICABLE` when there is nothing of
its kind to check (such as no commit after `origin/main`). "Could not check" blocks exactly like a finding (method
section 6). CI runs the same command; its `gate` check is required on
`main`.

The checks today:

- **toolchain:** Node's major version, pnpm's version and the gitleaks version are the pinned ones.
- **secrets:** gitleaks scans the branch's commits (after `origin/main` locally; the pull request's or the pushed
  range in CI). It runs right after `toolchain`, so a later failing step does not skip it.
- **hooks:** each hook in `.githooks/` is the executable two-line shim and no other file is tracked there (checked in
  CI too); in a clone, `core.hooksPath` is `.githooks` as well (in CI, where no clone-local git config exists, that part
  is not checked, and the pass line says so).
- **files:** the required files are tracked; LICENSE, NOTICE and `.gitignore` hold what the project needs.
- **selftest:** every `scripts/*.test.ts` and `*.test.mjs` file runs in its own process and must pass, each with its
  own count; as many files run at once as the machine has cores. `GATE_SHARD=n` runs only shard n of
  `scripts/shards.ts` (CI runs the three shards as the matrix job `selftest`; a new test file is added to a shard in
  `scripts/shards.ts`, and `scripts/shards.test.ts` fails locally while one is in none or in two, or while an entry is
  not a tracked file; in CI the step fails too. A fourth shard also needs the matrix of the job `selftest` in
  `.github/workflows/ci.yml`, which gate-needs checks).
- **lockfile:** one lockfile document; exact development versions; what ships is `esm-env` (the range Svelte
  declares) and a `svelte` peer, nothing else (SUP-04); each workspace package in `pnpm-workspace.yaml` (one
  indented `- <folder>` per line) has only `workspace:*` links as dependencies, optional or
  peer dependencies, and exact development versions;
  every package from the registry by hash; pnpm's release age equals Dependabot's shortest npm cooldown, and every
  exception names exact versions and its advisory.
- **licences:** every installed package's licence is on the allow list in `dependency-review.yml`; one pnpm cannot
  detect is a finding.
- **text, format, lint, types, dupes:** every tracked file has a class in `scripts/check-repo.ts` that names the
  steps that check it; a file of no class blocks the gate. Prettier formats, `.svelte` through its Svelte plugin
  (named in `package.json`; fix with
  `pnpm exec prettier --write <file>`), ESLint lints the scripts and components (no `class:`, `style:`, `use:`,
  `{@attach}`, spread attribute, `bind:` other than `bind:this`, a `style` attribute in any case or `{style}`,
  `svelte:head`, a `<style>` block or a `style`, `link` or `script` element, written or through `svelte:element`
  with a literal `this`; no style, `srcdoc` or `on*` handler set by `setAttribute`, no `style`, `link` or `script`
  created by
  `createElement` or `createElementNS`, no `innerHTML`, `outerHTML` or `srcdoc` assigned, in an object literal or
  as an attribute, no `{@html}` (the plugin's `svelte/no-at-html-tags`), no `insertAdjacentHTML`, `setHTML`, `setHTMLUnsafe`, `parseHTMLUnsafe`, `Document.parseHTML`,
  `createContextualFragment`, `createRawSnippet`, `DOMParser`, `execCommand("insertHTML")` or `document.write`, no
  constructed or inserted style sheet, no sink name in brackets: PRD-G2, PRD-S1, PRD-S2, PRD-T3 and PRD-B19; and no
  browser API above the PRD-E1 floor, as far as eslint-plugin-compat knows it). One exception: the site's test files
  (`site/**/*.test.ts`) may use `DOMParser`, to read the site's own build; PRD-S2 keeps raw HTML out of the component
  and the site's source, not out of a test of the build. The bans read names as written
  (with a dot, in brackets as a plain string, or bare) and plain string arguments. They do not catch a name built at
  run time or written as a template literal; a cast or non-null assertion on the object a ban reads
  (`(document as Document).write`, `iframe.contentDocument!.write`) or on an argument (`setAttribute("style" as
string, s)`); an alias under a name no ban reads (`const d = document; d.write`, `const { write } = document`);
  `setAttribute`, `createElement`, `createElementNS` or `execCommand` reached through `.call`, `.apply` or
  `Reflect.apply`; `Reflect.set`, `Object.defineProperty`, `setAttributeNS`, `setAttributeNode`; or a computed
  `svelte:element` `this`: review is the guard for these. The lint step also resolves the configuration of every
  linted file and of a path in `src/lib` and `site/src` (`CONFIG_PROBES` in `scripts/check-repo.ts`: a new top-level
  source folder is not probed until it is added there), and blocks when a rule the canaries prove, the settings, the
  linter options, the processor or the parser differ from its extension's canary, or a script ban the `.ts` canary
  proves is missing. A processor or parser that keeps the real one's name and version, or has none, while changing
  what is linted, is not seen by this comparison (measured with eslint-plugin-svelte 3.24.1 and ESLint 10.15.0). TypeScript
  type-checks `scripts/` through `scripts/tsconfig.json`, jscpd finds copied
  code outside tests and components (a file under its 50 tokens or, measured with jscpd 5.4.3, 5 lines cannot hold a clone: it is set
  aside and named with jscpd's own count, or as blank). The three owner-approved texts (the method, its companion and the PRD) are never reformatted:
  they change only through their owner. Nor are the spec files (`spec/**/*.md`): their sentences are hashed from
  the raw source, so a formatter would turn every test stale.
- **svelte:** svelte-check type-checks, strict and through the root `tsconfig.json`, every tracked `.svelte`
  component and all TypeScript outside `scripts/` except declaration files (a name with `.d.` has no class and
  blocks): TypeScript that imports a component is checked against the component's
  real type, which tsc does not know. Every component carries a `<script lang="ts">` block, and each of its scripts is
  TypeScript: svelte-check type-checks no markup and no script of a component without one (measured with
  svelte-check 4.7.8), so the step reports such a component as a finding. A component Svelte's compiler cannot parse is a finding too,
  with Svelte's message and line: svelte-check drops some parse errors (one that says "expected" when `svelte.config.js` has no
  `preprocess` and the component has a `lang` attribute; measured with svelte-check 4.7.8). A file outside the program, or a script
  in it as well as in tsc's, blocks the
  gate, since svelte-check would skip the first silently and the two checkers could disagree on the second. TypeScript outside
  `scripts/` with no component at all cannot be checked: svelte-check refuses a program without a component (its
  error 100001, measured with svelte-check 4.7.8), a limit of the tool, not a rule of ours. With nothing of its own tracked the step is NOT
  APPLICABLE, after its planted errors were found. It names `svelte.config.js` as the one
  config: otherwise svelte-check imports, and so runs, every `svelte.config.*` and `vite.config.*` below the root
  (gitignored folders such as `tmp/` too, not `node_modules` or dot-folders), and with no root config those above
  it (measured with svelte-check 4.7.8). A second Svelte config is not added; that file is edited. The two Vite
  configs (`vitest.config.ts`, `site/vite.config.ts`) load it through the Svelte plugin; svelte-check, given
  `--config`, imports neither.
- **site:** Vite builds the test site (`vite build --config site/vite.config.ts`, the same build as `pnpm site:build`)
  into `site/dist`, before the test step: the site's HTTP tests read that folder (run `pnpm site:build` before
  running them on their own). It removes `site/dist` first, so an earlier build never passes for this one. The plain
  scripts directly in `site/public/` (served as they are) are formatted, linted with browser globals and checked for
  copies; a deeper file there has no class. A build that fails is a finding; a
  build that leaves no HTML page in `site/dist` cannot be checked. Without a tracked `site/vite.config.ts` the step
  is NOT APPLICABLE.
- **inline:** after the site step, parse5 reads every `.html` file in `site/dist` and its folders; a `script`
  element of any type with any text (blank, or beside a `src`, too), any attribute whose name starts with `on`, a
  `javascript:` URL in `href`, `src`, `action`, `formaction` or `data`, or a `style` element is a finding (POL-03).
  Not read: a `template`'s content, `noscript`, `iframe` `srcdoc`, a `meta` refresh; a `style` attribute is left to
  the browser tests. Each planted page in `scripts/canaries/inline/` must first raise its own finding, or the step
  cannot be checked; it likewise cannot be checked when `site/dist` holds no HTML file. Without a tracked
  `site/vite.config.ts` it is NOT APPLICABLE.
- **stylesheet:** `scripts/check-stylesheet.ts` reads the tracked `src/lib` stylesheet with postcss and
  postcss-selector-parser, and `docs/styling.md`. THEME-01: every colour is a `--sdt-*` property with a system-colour
  fallback. THEME-02: the token table lists exactly the names read. THEME-04: one stylesheet, no `@layer` or `@import`,
  no `<style>` block in a component. THEME-12: no selector above one class, no `!important`. THEME-13: each rule has
  a marker naming a real-browser statement of the spec. It first runs every canary row of those statements and
  cannot be checked if one gives another result; it also cannot be checked with no spec, no guide, no token table or
  0 declarations, selectors or rules read. Limits: a colour keyword used as a custom identifier in a non-colour
  property (`font-family: Tan`) reads as a colour; a `var()` of a width inside a `border` or `outline` shorthand is judged as a
  colour (stricter, never open); the tarball's half of THEME-04 is PKG-03 of the `package` step. With nothing tracked
  under `src/lib` it is NOT APPLICABLE.
- **package:** `scripts/check-package.ts` builds `src/lib` with `svelte-package` into `dist/` (not tracked), packs it with
  `pnpm pack` and reads the tarball, never the repository's `package.json`: PKG-01 root export under `./dist/`, PKG-02
  publint and attw (profile `esm-only`, without `./styles.css`, `internal-resolution-error` ignored, reasons in the
  code) clean, PKG-03 only the listed files, PKG-04 `LICENSE` and `NOTICE` equal the repository's, PKG-05 the
  `./styles.css` export, PKG-07 no relative `.ts` import in a `.svelte` or `.js` file (every relative import inside a
  `.svelte.ts` module, and every import of one, uses the `.js` ending, as in `./request.js`: `svelte-package` leaves
  them as written, and its docs say to import `.ts` files "using a `.js` file ending, not a `.ts` file ending",
  svelte.dev/docs/kit/packaging). Findings come first, then every canary row on a copy of the real contents; it cannot
  be checked if one gives another result, the build or pack fails,
  or no `.svelte` or `.js` file is read. Limits: no CI run at the Svelte peer floor (#159); attw skips node16 on the
  `.svelte` re-exports (CON-04 proves the types); PKG-06 waits for the connection export. NOT APPLICABLE with nothing
  tracked under `src/lib`.
- **consumer:** `scripts/check-consumer.ts` packs the package like the `package` step, copies the files git tracks under
  `consumer/` (a SvelteKit 3 app with its own lockfile and settings) into a temporary folder, installs from the
  lockfile, adds the tarball with `pnpm add -D --prefer-offline`, builds it and runs its production server on a free port.
  CON-01: the copy holds exactly the tarball's files under `node_modules/.pnpm/`, its lockfile records the tarball, the
  committed consumer files do not name the package and are unchanged. CON-02: `GET /` holds one table "Orders" with
  the 20 rows in order. CON-03: no `style` attribute in `GET /` or the 404 page. CON-04: each answer carries the strict
  policy with one fresh nonce. CON-09: `svelte-check` reports no error, and one on a page that passes `rows={42}`.
  CON-11: `pnpm peers check` names no issue of the package, and one for a tarball asking for `svelte ^6.0.0`. Findings
  come first, then every canary row. CON-05: the list page loads `/csp-listener.js` from its own origin as a plain script
  before every other script. It needs the registry or a warm store for the install: with neither it is COULD NOT
  CHECK, as it is when the build, the server or a tool gives no report. The consumer tree's licence and cooldown checks
  are #176. NOT APPLICABLE without a tracked `consumer/package.json`.
- **test:** Vitest runs with the one `vitest.config.ts`, at the version `package.json` pins; every tracked test file
  outside `scripts/` (`*.test.ts`, `*.spec.ts`) must be in that run with at least one passing test, no test may
  fail, and vitest itself must exit 0 (an unhandled error is not in the JSON report). With no test file and no `.ts`
  or `.svelte` file under `src/` or `site/` the step is NOT APPLICABLE, after its planted failing test was reported;
  such code with no test file cannot be checked. A skipped or `test.todo` test beside a passing one is a finding; a
  tracked file whose tests were all skipped cannot be checked. The step overrides four config settings on the
  command line (each flag wins, measured with Vitest 5.1.0): an unhandled error fails the run, a test with no
  assertion fails, the tests run rather than only being type-checked, and a snapshot with nothing stored fails
  instead of being written (outside CI, vitest would write it and pass). The same run writes V8 coverage as an lcov
  report to `reports/test/coverage` for `diff-coverage` (provider, reporter, `src/**/*.{ts,svelte}` and the folder
  set on the command line). A stored snapshot that a file still in the
  run no longer uses fails too; a limit, measured: an orphan `.snap` whose test file is gone passes. The expect and
  typecheck flags do not reach a project in `test.projects` (measured), so the step refuses a `vitest.config.ts`
  that names `projects`; it also refuses one that names `coverage`, whose options could take lines out of
  `diff-coverage`'s count. The lint step adds Vitest's `expect-expect`, `valid-expect`,
  `no-focused-tests` and `no-disabled-tests`; a bare `expect(a === b)` counts as an assertion at run time, so only
  `valid-expect` catches it. Limits, measured: no flag overrides an `onUnhandledError` function, so the step refuses
  a `vitest.config.ts` that names it. The names are read as text in that file only, so a name in a module it
  imports (such as `vite.config.ts` through `mergeConfig`) or built at run time is not seen; a process-level
  `unhandledRejection` listener in a setup file still hides an unhandled error; and a `test.each` table that is empty
  at run time makes no test and fails nothing. A test from a `test.extend` fixture imported from another module is
  not seen by `expect-expect`, `no-focused-tests` or `no-disabled-tests` (measured); at run time one with no
  assertion still fails, and a skipped one still stops the step.
- **trace:** ties each spec statement (`spec/*.md`) to the tests that prove it, through `@spec("<id>", "<hash>")`
  markers in a leading comment of a test under `src/`, `site/` or `test/`; it reads the results of the same Vitest run
  as `test`. A marker whose hash no longer matches its statement, a marked test that is skipped or failing, a marker
  with no test under it, and a marker outside its one position are findings; a marked file absent from the results, a
  marker in a `scripts/` test (node:test results are not read) and a test file outside those folders are could not
  check; statements no marker names are listed as not yet tested (gates.md G6). A marker in a browser spec
  (`site/browser/**/*.spec.ts`) is checked the same way, but its results are the `browser` step's: trace counts it
  as left to that step, never as tested nor as not yet tested, and writes no file to `reports/trace/` for it. The
  site policy tests (`site/policy.test.ts`) read the site's build, so a `test` or `trace` run on its own needs
  `node scripts/check-repo.ts site` first (the gate runs it first); without the build they report skipped and
  failed. On a pull request, and locally against the merge base with `origin/main`, an id marked at the base whose
  statement still exists and which no marker names now is a finding; a base that cannot be named or read is could not
  check.
- **diff-coverage:** at least 95 % of the changed lines under `src/` (`.ts` and `.svelte`, test files left out) that the
  test run's lcov report has data for must be covered; the finding names every uncovered `file:line`, and the output
  counts the changed lines without data. The changed lines are the new side of `git diff -U0 -M` from the base `trace`
  uses to the working tree, so a new file counts once it is tracked. A changed file missing from the report, a report
  that lists no file, no report, or a path the reader cannot read is could not check; with no changed line under `src/`,
  and on a push to `main` (checked on its pull request), the step is NOT APPLICABLE. Its planted diff in
  `scripts/canaries/diff-coverage/` must first give a finding. Limits, measured (gates.md G4): `site/` and `scripts/`
  are not counted, a line proven only in a real browser reads as uncovered, and a change to static Svelte markup alone
  carries no data.
- **red-check:** each commit's new and changed Vitest test files run on its parent's tree (gates.md G7). A commit
  that changes source needs, per statement that gains tests, one new test red for the right reason: an `expect` or
  Testing Library mismatch, or the code under test throwing; a test file that does not load (unless it imports a file
  the commit adds) or a test that throws by itself is refused. A commit that changes only tests must pass on its
  parent, so a test and its code belong in one commit. New tests that pass on the parent are listed by name. Its
  planted results in `scripts/canaries/red-check/` must first be refused.
- **mutation:** every mutant StrykerJS makes on a changed line under `src/` (`.ts`, `.svelte.ts`, `.svelte`, test files
  left out; the changed lines are the same as `diff-coverage`'s) must be killed by the tests (gates.md G8). A Survived
  or NoCoverage mutant is a finding naming `file:line mutator`; an invalid mutant (it does not compile or run) is
  listed and not judged; no judged mutant on the changed lines is could not check, unless no mutant of any kind sits on them while the changed
  files hold mutants elsewhere (an import or a comment changed): not applicable; a `Stryker disable` comment
  without a reason after its colon is a finding. Stryker runs in a temporary copy of the tracked files with an offline
  install, never in your checkout, and the JSON report is kept in `reports/mutation/`. The whole of each changed file is
  mutated (7 to 13 seconds for one component, 52 for all of `src`, measured locally). In CI it is its own job `mutation`. Mutants of
  lines no change touches are not judged. A planted survivor in `scripts/canaries/mutation/` must be in the same run's
  report first.
- **browser:** Playwright, at the version `package.json` pins, runs `playwright.config.ts`: the specs in
  `site/browser/` in Chromium, Firefox and WebKit, against the site's build served on 127.0.0.1:4173 by its own server
  (never one already running), after the test step so that address is never shared. The planted failing spec in
  `scripts/canaries/browser/` must be reported first, through the same reading as the real run. A failed or skipped
  test, or one marked `test.fail`, is a finding that names its engine. Then the specs' `@spec` markers are read with
  trace's own reading: a marker with no test under it in the report is a finding, and one whose tests did not run in
  each engine cannot be checked; the planted spec's marker must come back as not passed, or the step cannot be
  checked. It cannot be checked when a tracked spec did not run in each of the three engines, 127.0.0.1:4173 is
  taken, a browser is not installed, the report is unreadable or its totals differ from the tests read, or Playwright
  reports any other error outside the tests. With no tracked spec under `site/browser/` the step is NOT APPLICABLE;
  a spec without `playwright.config.ts` cannot be checked. `site/browser/consumer.spec.ts` (CON-06 hydration in place,
  CON-08 no hydration warning on the development server) runs against the consumer's servers on 4174 and 4175, which
  `scripts/consumer-serve.ts` starts from one prepared copy (the webServer command prepares, because Playwright starts
  it before any global setup); the preparation and both servers must answer within 3 minutes (each server within 60 s), and a server that dies, or a
  taken port, cannot be checked; the output of a failed server is in the message. A failed consumer test keeps its
  Playwright trace in `test-results/`, beside `consumer-serve.log`, a timed log of both servers with the copy's path
  replaced (the same files are in the artifact `browser-results` of a CI run). Copy `test-results/` aside before
  rerunning, since the next browser run, and the selftest of consumer-serve, replace the log. Never attach a local trace
  or log to an issue (they can hold local paths): quote text from them after both scans. In CI the static job leaves it
  to the job `browser`
  through the variable `GATE_BROWSER`, which gate-needs allows only outside that job and only beside a job `browser`
  that runs the step.
- **commits:** every commit of the branch (the same range as `secrets`), merges left out, has a conventional header
  (see Git hooks and commit headers).
- **pins, gate-needs, links, actionlint, workflows:** the workflow and documentation checks; zizmor looks for
  injection, dangerous triggers and over-broad permissions. It runs offline, so whether a pinned SHA belongs to its
  tag is not checked (docs/decisions/001-quality-tooling.md).

Every tool step first runs on a planted violation (files in `scripts/canaries/`, or one the step builds) and must
find it, so a tool that silently checks nothing cannot pass.

## Git hooks and commit headers

The `commits` step judges every non-merge commit of the branch by its header: the first non-blank line, without its
trailing blanks and carriage return.

- The header is `<type>(<scope>): <subject>`, at most 100 characters (UTF-16 code units: a character outside the
  Basic Multilingual Plane, such as most emoji, counts as two). The scope is optional, in lower-case letters, digits
  and hyphens; `!` before the colon marks a breaking change; the subject starts right after one space. The types are
  the list `TYPES` in `scripts/check-repo.ts`; a header of the wrong shape is refused with that list. The changelog
  will be generated from these headers (PRD-K3).
- git's own `Revert "<header>"` and `Reapply "<header>"` pass when the header they wrap does, or wraps git's own
  `Merge ...` (a reverted pull request). The 100 characters count the header as written, wrapping included: reword a
  revert of a long header.
- `fixup!`, `squash!` and `amend!` commits are refused: squash them before the pull request.
- A suggestion applied or a file edited on GitHub's website asks for a commit message: give it a conventional header.
- Real merge commits are left out, whatever their message; a one-parent commit that only looks like a merge is judged.
- Locally the range starts after the merge base with `origin/main`: fetch first, or commits already on main are judged
  as the branch's own.

The hooks run before each commit and push once this clone has been set up, which the gate's `hooks` step checks:

```sh
./scripts/setup
```

It sets `core.hooksPath` to `.githooks` for this clone, and stops without changing anything, naming the value and
where it is set, when another `core.hooksPath` is already set, in any file git reads (this clone, global, system or an
include; `git config --show-origin --get core.hooksPath` shows it). To use `.githooks` in this clone anyway, run
`git config core.hooksPath .githooks`: a local value replaces the other one here, and the hooks it named then stop
running in this clone.

git then runs `.githooks/commit-msg` when `git commit` (also `--amend`) writes a message or `git merge` makes a merge
commit, and `.githooks/pre-commit` before `git commit` writes it, a commit that concludes a conflicted merge included.
A `git merge` that needs no conflict resolution runs no pre-commit hook (measured, git 2.56.0: it runs
`pre-merge-commit`, for which this project has no hook, then commit-msg). The hooks need the Node version of
`.node-version` first on the `PATH` that git sees, which a desktop git client may not share with your shell;
pre-commit also needs the installed dependencies (`pnpm install`, in every new worktree too, or it cannot run
Prettier and ESLint) and gitleaks. The setting replaces the hooks in `.git/hooks` for this clone and those of a
global `core.hooksPath`, and there is no supported place for a hook of your own yet: do not copy one into the tracked
`.githooks/`, and run your own checks, such as a secret scan, by hand.

- **pre-commit**, on the staged files: `text` on all of them, `format` and `lint` on the files of their class;
  `lockfile` when `package.json`, the lockfile, `pnpm-workspace.yaml` or `dependabot.yml` is staged; `workflows` when
  a file under `.github/` is; then gitleaks on the staged files (symlinks and empty files have nothing to scan). A
  staged file of no class stops the commit at `text`, which names it, as in the gate. A staged file changed again
  before the commit stops it, which includes staging part of a file (`git add -p`): stage the whole file, or set the
  unstaged part aside and commit the rest. The hook never stashes or re-stages anything.
- **commit-msg** applies the rules above to the message git hands it, before git's own clean-up:
  - Lines starting with `#` (git's editor template) are not read, nor anything below git's scissors line
    (`commit -v`). A message with nothing else is refused as empty.
  - A header starting with `Merge ` or with `fixup! `, `squash! ` or `amend! ` passes the hook, whatever its length;
    the `commits` step refuses the autosquash ones at the pull request.
  - The message, comment lines included, is also scanned for secrets with gitleaks (the range scan of a push reads
    messages through gitleaks' git mode, which was measured to miss a token in a body); a finding blocks the commit.
  - Limits, caught only by the `commits` step: the hook does not tell git's own `Merge ...` header from a typed one
    on an ordinary commit; `git revert`, `git cherry-pick` and `git rebase --autosquash` run no commit-msg hook
    (measured); git keeps a `#` line of a message given with `-m` or `-F`, so `git commit -m "# x" -m "feat: y"`
    passes the hook (which judges `feat: y`) while git stores `# x` as the header; a comment character other than `#`
    (`core.commentChar`) is not known to the hook.
- **pre-push**, for each pushed ref with new commits (a new branch, a tag with commits no remote ref holds, or an update
  whose old tip is not an ancestor: those after the remote's `main`; an update: those after the remote's commit; a
  deletion or a tag with nothing new: nothing): gitleaks on those commits and on their messages, then the private
  word scan when this clone names it. The hook runs the scans only: they read the pushed commits, so the work tree
  may be on another branch or have changes. The gate runs before a pull request is opened, and CI's `gate` check is
  required on main. A pushed secret or private word counts as published, so these scans block the push.
  - Limits: a new branch, a tag with new commits or a force-push to a remote with no fetched `main` (an empty new
    repository, a default branch of another name, a push to a URL) is blocked, and fetching does not help; an update
    of a branch the remote already has goes through. The message of an annotated tag is not scanned, only the commits
    it brings and their messages. The scanner, its configuration and the pinned program are those of the checked-out
    tree, not of the pushed commits.

Maintainers' clones also name, in git config, the owner-only word scan (`sveltedt.wordScan`, the scan program;
`sveltedt.wordList` and `sveltedt.wordAllow`, its lists). A clone without it skips the word scan.

A hook that refuses is answered by fixing what it names (rewording the message, or correcting the staged files),
never by skipping the hook (`--no-verify`). The path is
relative: in any worktree of the clone, git runs the hooks in `.githooks/` of the branch checked out there, which are
code from that branch.

## How a change is made

- **Requirements first.** A behaviour is a numbered statement in a spec before it is code (method section 2).
- **Test first, from the outside in.** The acceptance test is written at the outermost layer that can prove the
  statement and is shown failing for the right reason before the code is written (method section 2, steps 4-6).
- **One statement, one commit**, holding its tests and its code, so no commit holds a failing test.
- **Coverage and mutation:** at least 95 % of changed lines covered, and mutation testing at step boundaries
  (method section 4).
- **Synthetic data only.** No real data, names or hosts in code, tests or fixtures (method section 9).
- **Pull requests** merge with a merge commit after review against the method. Nothing merges automatically.

## Not built yet

These checks are part of the method but do not exist in this repository yet:

- `release-links` (it arrives with the first code that needs it).
- `red-check` for the node:test files under `scripts/` (#153) and the Playwright specs (#154).

## Known limits of the merge rules

- A pull request can change its own gate: the workflow and the scripts it runs come from the pull request. Review
  and code ownership cover it; a check that the gate job runs the gate unchanged is planned.
- Inline suppressions: the `text` step refuses `svelte-ignore`, `@ts-expect-error`, `@ts-nocheck`, `jscpd:ignore`,
  `prettier-ignore` and the coverage hints the V8 provider reads (`v8`, `c8`, `istanbul` or `node:coverage`, then
  `ignore`) in code; typescript-eslint's `ban-ts-comment` refuses `@ts-ignore` (its lint canary plants one); ESLint
  ignores its inline configuration (HTML comments in components included), gitleaks ignores its allow comments, and the
  scan refuses a folder holding a `.gitleaksignore`. A zizmor ignore comment in a workflow is not yet refused.

- CodeQL merge protection does not apply to Dependabot pull requests analysed by CodeQL default setup.
- CodeQL default setup does not scan pull requests from forks.

Both are GitHub's documented behaviour (see the companion, G10). Review covers them.
