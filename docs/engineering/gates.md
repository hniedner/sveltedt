COMPANION to the engineering method ([`method.md`](method.md)), APPROVED by the owner 2026-11-17 11:04 as binding with it; changes only through the method's change log.

# Gates and public intake: the detail behind the method (REV 1)

Companion to `method.md`, 2026-11-17. The method states each rule; this file says how each check
works. Each section later becomes the README of its wrapper or setting. Facts marked *(fetched)* were read from the
named page on 2026-11-17.

## G1. The wrapper contract (every check)

Every gate tool runs behind a small wrapper with:
- a **positive control**: a canary it must find, or the run is *could not check*;
- **proof that it scanned something**: commits, bytes or files scanned are greater than zero whenever the input is
  not empty;
- **distinct exit codes**: 0 pass, 1 finding, 2 tool crash or bad input, 3 could not check;
- **could not check blocks** exactly like a finding, and it is reported under its own name, never as pass;
- two non-blocking states: the first, G6's *not yet tested*, exits 0 and is printed under its own name, never as pass;
- a second non-blocking state, *not applicable*, exits 0 and is printed under its own name with its reason, never as
  pass. A step may report it only when the step itself has established one of two things: nothing of its kind is
  present (no step diff on a push to main; no shipped stylesheet yet; no changed rule in the step's stylesheet diff),
  or the decision belongs to a run this one cannot make (a local run with one browser engine where CI runs three).
  In the second case the CI run decides, and there the same outcome is a finding or *could not check*, never *not
  applicable*.

Each wrapper has its own tests showing it refuse every failure listed in its section.

## G2. `scan-secrets`

- Uses pinned gitleaks. Gitleaks is MIT-licensed and receives security patches only *(fetched, github.com/gitleaks/gitleaks)*.
  It runs with `--exit-code 7` for a finding, so its exit 1 can only mean a crash or bad input.
- The wrapper computes the commit list itself with `git rev-list`, so a wrong range, a hook run from the wrong
  directory, or the first push of a new branch cannot scan nothing and pass. Probe: gitleaks alone exits 0 on a bad
  range and on a directory that is not a repo.
- Bytes scanned must be greater than 0 when the commit list is not empty. The config file must exist.
- Canary: a planted fake token in a temporary copy must be found.
- Runs as the gate step right after the toolchain check, so that a change that fails a later check is still
  scanned, locally and in CI; in pre-commit on the staged files; and at pre-push once that hook is built. GitHub
  secret scanning, free on public repos *(fetched)*, is a second net, not the gate.

## G3. `scan-words` (local only)

- The private word list lives outside the repo; an environment variable gives its path. It holds organisation names,
  hosts, internal URLs, people and former project names.
- The scan covers the pushed diff, commit messages, file names, and author and committer e-mails.
- An allowlist kept beside the word list covers the owner's own name in the licence line.
- Canary: a planted listed word must be found. A missing list returns *could not check*.
- CI never holds the list, because a secret in a public repo can leak through logs.

## G4. `diff-coverage`

- Python: coverage.py with `source = ["src"]`, so never-imported files appear at 0 %, then diff-cover.
- TypeScript: Vitest V8 coverage with `include` set, then diff-cover on the lcov report.
- Rust: cargo-llvm-cov.
- The wrapper returns *could not check* when a changed or added source file is missing from the report, or the
  report is empty. Probe: diff-cover alone passed both.

## G5. `release-links`

- `uv lock --check --no-sources` must pass. Probe: `uv build --no-sources` alone passed a missing package; `uv lock`
  failed it.
- A grep of `package.json`, `pnpm-lock.yaml`, `uv.lock`, `Cargo.toml` and `Cargo.lock` for `workspace:`, `link:`,
  `file:`, `portal:`, `path =` and `editable` must find nothing.
- `pnpm install --frozen-lockfile` and `uv sync --frozen` must pass from a clean clone.
- Canary: a planted `workspace:` entry must be found.

## G6. `trace`

- Reads test results, not test names (JUnit XML, Vitest JSON). Every statement has at least one test that ran and
  passed, except one reported as *not yet tested*.
- *Not yet tested* means that no `@spec` marker in the test sources names the statement; the check reads those
  markers as well as the results. A skipped, stale or failing test is never this state; it fails. A protected
  statement is never this state; with no test it fails.
- Without a mode the check exits 0 on untested statements and prints their ids under the heading `not yet tested`,
  never under pass. On a pull request it also compares the set of untested ids with the base commit's: an id that
  was tested there and is untested now fails, so a deleted test fails. Locally it makes the same comparison with the
  merge base of `origin/main` and `HEAD`; on a push to main there is no base, and only the list is printed.
- `trace --close <ids>` (the ids the milestone's issues name, run by the coordinator before closing the milestone and
  recorded in the closing comment, which no check enforces) exits 1 while any of them is untested; an empty list or
  an id no spec holds is exit 2. `trace --release` runs in the release build: from 1.0 on (a 1.0 release candidate
  counts as 1.0; the 0.1.0 rehearsal prerelease does not) it exits 1 while any statement is untested;
  before 1.0 it exits 0 and prints the untested count for the release notes (closed milestones were checked by
  `--close`).
- Skip, xfail, `.only` and `todo` fail the check.
- Marker: `@spec("TABLE-07", "<first 8 hex of sha256 of the statement text>")`. A hash mismatch makes the test stale, which fails.
  The statement text that is hashed is the raw Markdown source, UTF-8, from the first character of the statement's
  `**ID**` line up to the line before its first `- Reason:` line (example tables and notes before it included),
  followed by its `- Layer:` line, with every run of white space, line breaks included, collapsed to one space and
  the result trimmed. Reason and Traces stay outside, since a changed reason or trace does not change what a test must
  prove. A statement with no `- Reason:` or no `- Layer:` line fails the check. So an added example row or a changed
  layer makes the test stale, which is wanted because the test runs every row at its layer.
- A test id that no spec holds fails.
- A protected statement (`TIER-`, `DEID-`, `AUD-`, `REF-`) with no test marked `negative=True` fails.
- Reads the spec files: a spec header without `Field names: yes|no`, or a `yes` spec whose text does not cite the
  owning field-name statement, fails; a spec folder it cannot read is could-not-check.
- Canary: a planted skipped test must fail it; a planted untested statement must be listed on a pull request and
  must fail `--close` and a 1.0 `--release`; a planted deleted test must fail a pull request; `--close` with an
  empty list must exit 2.

## G7. `red-check`

- Puts the change's new and changed test files onto the parent commit's source and runs them.
- Passes only when the runner reports test failures (pytest exit 1, not 2, 4 or 5; Vitest's equivalent) and every
  failure is an assertion or `expect` mismatch, with no collection or import error.
- Writes its output into the commit message.
- Canaries: an import-error red is refused, and so is a test that passes on the parent.

## G8. `mutation` (at step boundaries)

| Language | Tool | Gateable today? | The wrapper adds |
|---|---|---|---|
| Rust | cargo-mutants `--in-diff <file>` *(fetched, mutants.rs)* | Yes: missed mutants give their own exit code, and a bad diff fails. Each mutant recompiles, so it runs per pull request, plus a full run before release. | A diff that touches only tests runs 0 mutants: reported as "not mutated", never pass |
| TypeScript, Svelte | StrykerJS, Vitest runner. `mutate` accepts `file:start-end` ranges. A score below `thresholds.break` exits 1, and the default `null` never fails *(fetched, stryker-mutator.io)* | Only through the wrapper: Stryker has no git-diff mode | Maps `git diff -U0` to line ranges and sets break = 100. Reads the JSON report: any survivor fails; 0 mutants on changed executable lines = could not check |
| Python | mutmut 3. Selects mutants by name pattern (`mutmut run "pkg.mod.func*"`) and honours `# pragma: no mutate` *(fetched, mutmut.readthedocs.io)* | Not on its own: no documented exit on survivors, mutates only inside functions, needs `fork` (Linux or macOS; Windows only under WSL) | Maps the diff to function names, reads the survivor count from mutmut's results, and lists changed lines outside functions as "not mutated". Report-only until the wrapper's test proves it fails on a planted survivor |

- Equivalent mutants carry their reason on the same line, and a grep checks it: `# pragma: no mutate  # reason`,
  `// Stryker disable next-line <mutator>: reason`, `#[mutants::skip] // reason`. In protected files, every
  equivalent needs the owner's sign-off.
- Frontend: StrykerJS gates .ts, .svelte.ts and .svelte through the wrapper with break 100. A gated file with 0
  mutants is could-not-check unless exempted with a reason; allowEmpty is refused. Logic stays in .ts/.svelte.ts;
  every markup expression has a component test that kills its mutants. Measured 2026-11-17 (StrykerJS 10.1.1,
  vitest-runner, Svelte 5.57.3, Vitest 5.1.0): markup expressions are mutated; a file with 0 mutants and
  `allowEmpty: true` both exit 0, so the wrapper refuses both; `inPlace: true` is needed with @testing-library/svelte.
- Real-browser tests (components and journeys) and static checks are outside mutation scope: Stryker's Vitest runner does not run browser
  tests, and a static check has no behaviour to mutate. Component-level statements (Vitest + Testing Library) are in scope.
- CI runs mutation jobs on Linux only.
- Canary: a planted survivor must fail it.

## G9. Hooks and the gate record

- `./scripts/setup` sets `core.hooksPath` to `.githooks`. The gate's first step checks that this setting is in place
  and the hooks are executable, and otherwise returns *could not check*.
- The local gate writes the commit id, tool versions and every step's exit code. The pusher writes that file, so it
  is not proof.
- The record that counts is CI's `gate` check on the head, written by GitHub and required on main by the ruleset
  (G13 row R1). CI runs every check except `scan-words` (G3): mutation of the step diff on each pull request, the full
  mutation run in the release workflow (G10).
- The reviewer rules on a head only when its `gate` check is green. A missing, pending or cancelled check is *could
  not check*, never a pass.

## G10. CI: what "full use of Actions" means

CI is on in every repo (owner, 2026-11-17 11:06). Sources, read 2026-11-17 and cited below by short name:
- *runners* docs.github.com/en/actions/reference/runners/github-hosted-runners · *limits*
  docs.github.com/en/actions/reference/limits · *secure-use* docs.github.com/en/actions/reference/security/secure-use
  · *lockfiles* docs.github.com/en/actions/concepts/security/workflow-dependency-lockfiles · *syntax*
  docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax · *caching*
  docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching · *concurrency*
  docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency ·
  *environments* docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments ·
  *actions-settings* docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository
- *codeql-default* docs.github.com/en/code-security/code-scanning/enabling-code-scanning/configuring-default-setup-for-code-scanning
  · *codeql-about* docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql
  · *codeql-suites* docs.github.com/en/code-security/code-scanning/managing-your-code-scanning-configuration/codeql-query-suites
- *dep-review* github.com/actions/dependency-review-action · *scorecard* github.com/ossf/scorecard-action ·
  *playwright-ci* playwright.dev/docs/ci · *vitest-browser* vitest.dev/guide/browser · *setup-uv*
  docs.astral.sh/uv/guides/integration/github
- *npm-tp* docs.npmjs.com/trusted-publishers · *npm-prov* docs.npmjs.com/generating-provenance-statements · *pypi-tp*
  docs.pypi.org/trusted-publishers/adding-a-publisher · *pypi-action* github.com/pypa/gh-action-pypi-publish ·
  *crates-tp* blog.rust-lang.org/2025/07/11/crates-io-development-update-2025-07

**Facts and limits.** "Use of the standard GitHub-hosted runners is free and unlimited on public repositories"; public
Linux and Windows runners have 4 CPU and 16 GB; larger runners are billed even on public repos *(fetched, runners;
docs.github.com/en/billing/concepts/product-billing/github-actions)*. 6 h per job, 35 days per run, 20 concurrent
jobs (5 macOS) on the Free plan, 256 matrix jobs, 10 GB cache per repo *(fetched, limits)*. Standard runners only, a
$0 budget, no self-hosted runners.

**Workflows in every repo.**
- `ci.yml`, on `pull_request` and on `push` to main (main's run also fills the cache that pull requests may read
  *(fetched, caching)*). Jobs:
  - `static`: format check, lint, types, the static checks of method §2 (no raw-HTML path, no eval, design tokens
    only, no shipped CSS), `scan-secrets` (G2) over the pull request's commits, and the synthetic-shape check (G11).
    The steps' reports (`reports/`) are uploaded from this job as one artifact, also when the job fails; the job is
    split into the jobs below when its measured time passes 12 of its 15 minutes, and with mutation testing at the
    latest.
  - `test`: every layer that needs no real browser (unit, component in a simulated DOM, HTTP or public interface),
    with coverage; `diff-coverage` (G4) on pull requests.
  - `browser`: real-browser component tests and journey tests, a matrix over `chromium`, `firefox` and `webkit` with
    `fail-fast: false`, so one engine's failure does not hide another's *(inferred)*. Vitest browser mode's Playwright
    provider runs all three *(fetched, vitest-browser)*. Each job installs only its engine with
    `playwright install --with-deps <engine>`; browsers are not cached, as Playwright advises *(fetched, playwright-ci)*.
  - `red-check` (G7) on each commit of the pull request, so the red record in a commit message is re-proven by CI
    *(inferred: G7 needs only the parent commit and that commit's test files)*.
  - `mutation` (G8) on the step diff, Linux only.
  - `trace` (G6) over the result files of the jobs above.
  - `gate`: `needs:` every job above, `if: always()`. It passes only when every needed job's result is `success`;
    `failure` is a finding; `cancelled` or `skipped` is *could not check* (method §6). `gate` is the one `ci.yml` check
    the ruleset requires, so a matrix change never touches the ruleset.
- `dependency-review.yml`, on `pull_request`: `actions/dependency-review-action` v5, supported on public repos
  *(fetched, dep-review)*. `fail-on-severity: low` (its default); `fail-on-scopes: runtime, development`, because
  development packages run in CI and on our machines *(inferred)*; `allow-licenses` from the licence rule of method §8
  (`deny-licenses` is deprecated *(fetched, dep-review)*). No pull-request comment, so `contents: read` is enough.
  Required check `dependency-review`.
- `scorecard.yml`: the OpenSSF Scorecard action on `push` to main and a weekly `schedule` (its supported triggers;
  `pull_request` is experimental), `publish_results: true`, SARIF uploaded to code scanning. When publishing, the
  workflow has no top-level `env` or `defaults` and no workflow-level write permission, runs on Ubuntu, and its job
  uses only `actions/checkout`, `actions/upload-artifact`, `github/codeql-action/upload-sarif`,
  `ossf/scorecard-action` and `step-security/harden-runner`. Rulesets are readable with the default token, so no
  personal token is stored *(all fetched, scorecard)*. Not a merge gate, because it does not run on pull requests;
  its findings arrive as code scanning alerts and are triaged like any finding.
- CodeQL: default setup, no workflow file (G13 row C1).
- `release.yml`, on a `v*` tag (below).

**CodeQL: default setup, `extended` suite, per repo.** Languages `javascript-typescript` and `actions` (the workflow
files) in both repos, plus `python` or `rust` where the server or a component uses it. Why default, not advanced:
- every language here is analysed without our build. JS/TS and Python need none, and default setup uses build mode
  `none` for Rust *(fetched, codeql-default)*, so an advanced workflow adds no analysis we need;
- the only suite that needs advanced setup is `security-and-quality` *(fetched, codeql-suites)*; its maintainability
  queries repeat what the linters in `static` already fail on (method §5, one source);
- default setup has no workflow file to pin and update, and its whole state reads back in one call (G13 row C1).

A repo moves to advanced setup only when a spec statement needs a custom query or a build step, recorded as a
library-first decision (method §8). The ruleset's `code_scanning` rule blocks a merge while CodeQL reports an alert
at or above its threshold, while its analysis is running, or when it is not configured *(fetched, rulesets in G11)*.
Default setup scans pull requests against the default branch or a protected branch, excluding pull requests from
forks *(fetched, docs.github.com/en/code-security/concepts/code-scanning/setup-types)*. Merge protection does not
apply to Dependabot pull requests analysed by default setup *(fetched,
docs.github.com/en/code-security/concepts/code-scanning/merge-protection)*. So a Dependabot pull request can merge
without a CodeQL result, and what the rule does on a pull request from a fork is not confirmed: it is seen on the
first one.

**A matrix only where it proves something.**
- Browser engines: method §2 requires Chromium, Firefox and WebKit for real-browser tests.
- Rust release targets: each prebuilt package (method §7) is built and tested on its own OS and architecture.
- `@hniedner/sveltedt`'s Svelte peer range: its lowest and highest allowed Svelte versions, because the range is a public
  promise *(inferred)*.
- Nothing else. The server pins one Python (3.14, method §8) and the build pins one Node LTS, so a runtime-version
  matrix would test versions nobody runs. No OS matrix for JS or Python: the engines are the variable, and the server
  deploys to one OS. Mutation runs on Linux only (G8).

**Cache, concurrency, artifacts.**
- Cache: `actions/setup-node` with `cache: pnpm` (setup actions create and restore the cache themselves *(fetched,
  caching)*); `astral-sh/setup-uv` with `enable-cache: true` *(fetched, setup-uv)*; Cargo through `actions/cache`
  keyed on `hashFiles('Cargo.lock')` *(inferred)*. Entries unused for 7 days are evicted *(fetched, caching)*. The
  release workflow restores no cache, so nothing a pull request wrote can reach a published package *(inferred)*.
- Concurrency in `ci.yml` and `dependency-review.yml`: group `${{ github.workflow }}-${{
  github.event.pull_request.number || github.run_id }}` with `cancel-in-progress: true`. Only superseded runs of the
  same pull request are cancelled (a branch name would join pull requests from forks whose branches share a name);
  each push to main keeps its own run *(fetched, concurrency)*. A cancelled run leaves `gate` at *could not check*. `release.yml`:
  group `release`, `cancel-in-progress: false`, so a publish is never cut off halfway.
- Artifacts: every job uploads its reports with `actions/upload-artifact` under `if: ${{ !cancelled() }}`, so a
  failed run keeps them *(fetched pattern, playwright-ci)*: JUnit XML, coverage, the trace report, browser reports
  and traces, the mutation report, the gate record. Retention stays at the default 90 days, the most a public repo
  allows *(fetched, actions-settings)*.

**Least-privilege `permissions:`.** Every workflow starts with `permissions: {}`; once any permission is named, every
other one is `none` *(fetched, syntax)*. Jobs add only:

| Job | Permissions |
|---|---|
| every `ci.yml` job; `dependency-review` | `contents: read` |
| `scorecard` | `contents: read`, `security-events: write`, `id-token: write`, `issues: read`, `pull-requests: read`, `checks: read` *(fetched, scorecard)* |
| release `build` | `contents: read` |
| release `publish` | `id-token: write`, plus `contents: read` if it checks out |
| release `github-release` (notes and assets, after `publish`) | `contents: write` |

Pull requests from forks get read-only tokens anyway *(fetched, syntax)*. No `pull_request_target` workflow at all
*(fetched advice, secure-use)*. CI holds no secrets: publishing uses OIDC.

**Actions pinned by full commit SHA.** Every `uses:` names a full SHA with its tag in a comment on the same line
(`@<sha> # v5.0.0`). Dependabot updates SHA pins, and the tag comment when it is on the same line *(fetched,
secure-use)*. The repo setting `sha_pinning_required: true` makes GitHub refuse a tag reference *(fetched,
actions-settings; G13 row A1)*. Gap: Dependabot raises no alert for a vulnerable action pinned by SHA *(fetched,
secure-use)*; the weekly `github-actions` updates and reading each bump's release notes at review cover it. Not
adopted now: the workflow lockfile `.github/workflows/actions.lock`, which "supersedes SHA pinning" *(fetched,
lockfiles)*; the pages read did not show its release status or how Dependabot updates it. Reopen when they do.

**Release workflows: trusted publishing, no stored tokens.** On a `v*` tag. Job `build` (no cache) runs the full
gate, `trace --release` (G6), the full mutation run and `release-links` (G5), and uploads the package. Job
`publish` runs in the environment `release`, whose required reviewer is the owner (method §1: the owner decides
releases); required reviewers are
available on public repos on every plan *(fetched, environments)*.
- npm, `@hniedner/sveltedt`: trusted publishing over OIDC; npm CLI 11.5.1+ and Node 22.14.0+; GitHub-hosted runner; the
  workflow file name entered exactly; provenance is generated automatically for a public package from a public repo
  *(fetched, npm-tp; npm-prov)*. Afterwards the package is set to "Require two-factor authentication and disallow
  tokens". A new trusted publisher must publish within 2 days or it expires *(fetched, npm-tp)*.
- PyPI, if the server is Python and ships as a package: a trusted publisher naming owner, repo, workflow file and
  environment (the environment is "strongly recommended") *(fetched, pypi-tp)*; `pypa/gh-action-pypi-publish` with
  `id-token: write` in the publish job only, the build in a separate job; PEP 740 attestations are on by default
  *(fetched, pypi-action)*.
- crates.io, if Rust: trusted publishing from GitHub Actions with `rust-lang/crates-io-auth-action@v1` and
  `id-token: write`; the first release of a crate is published by hand *(fetched, crates-tp)*.

## G11. Supply chain, Dependabot and public intake

Sources (2026-11-17): *dbot-ecosystems* docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories
· *dbot-options* docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference ·
*dbot-optimize* docs.github.com/en/code-security/dependabot/dependabot-version-updates/optimizing-pr-creation-version-updates
· *dbot-security* docs.github.com/en/code-security/dependabot/dependabot-security-updates/customizing-dependabot-security-prs
· *dbot-actions* docs.github.com/en/code-security/dependabot/working-with-dependabot/automating-dependabot-with-github-actions
· *uv-ga* github.blog/changelog/2025-03-13-dependabot-version-updates-now-support-uv-in-general-availability ·
*rulesets* docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
· *codeowners* docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners

- Lockfiles are committed and installs are frozen: `pnpm install --frozen-lockfile`, `uv sync --frozen`,
  `cargo build --locked`.
- Dependency lifecycle scripts are off, except for an allow-list.
- **Dependabot, `.github/dependabot.yml`: version updates for every ecosystem the repo has.**

  | Ecosystem | `package-ecosystem` | Version updates | Security updates |
  |---|---|---|---|
  | npm and pnpm | `npm` (pnpm uses this value) | yes | yes *(fetched, dbot-ecosystems)* |
  | uv | `uv` | yes, generally available since 2025-03-13 *(fetched, uv-ga)* | *not confirmed*: the table row shows support marks, but its column headings did not render |
  | Cargo | `cargo` | yes | yes *(fetched, dbot-ecosystems)* |
  | GitHub Actions | `github-actions`, directory `/` | yes, SHA pins included (G10) | yes, but no alerts for SHA-pinned actions *(fetched, dbot-ecosystems; secure-use)* |
  | Docker, only if a repo has a Dockerfile | `docker` | yes | no *(fetched, dbot-ecosystems)* |

  - Weekly schedule. `open-pull-requests-limit` stays at its default of 5 *(fetched, dbot-options)*.
  - Groups per ecosystem: one for minor and patch version updates (`update-types: [minor, patch]`), and one with
    `applies-to: security-updates` *(fetched, dbot-options; dbot-security)*. A major update stays its own pull
    request, because it may break and needs its own upgrade note.
  - Cooldown: `default-days: 7`, `semver-major-days: 30`, `semver-minor-days: 7`, `semver-patch-days: 3` *(syntax
    fetched, dbot-optimize)*. It delays version updates only; security updates are never delayed *(fetched,
    dbot-options)*. Reason: a hijacked release is usually found and pulled within days *(inferred)*.
  - Security updates are on (G13 rows D1, D2).
  - pnpm: a `pnpm-lock.yaml` written as two YAML documents is invisible to the dependency graph, so it gets no alerts
    and no security updates *(fetched, dbot-ecosystems)*. G13 row F2 reads the dependency graph back and fails a
    repo whose packages are missing.
  - **No auto-merge.** Dependabot pull requests pass `gate` and the review like any change. Reasons, quality first:
    method §10 has every change reviewed against the method before merge, and auto-merge skips that; a patch release
    is where a hijacked package lands, and green tests do not prove it harmless; auto-merge needs a workflow holding
    `contents: write` and `pull-requests: write` *(fetched, dbot-actions)*, against least privilege. Grouping and the
    cooldown keep the load near one pull request per ecosystem per week *(inferred)*. Changing this is a method
    change for the owner.
- The dependency-review action fails a pull request that adds a vulnerable package (G10).
- `SECURITY.md` points to private vulnerability reporting (G13 row S2).
- Packages are published by trusted publishing with provenance (G10).
- **Main ruleset** (G13 row R1): pull request required; required checks `gate` and `dependency-review`; CodeQL
  results required; force push and deletion blocked; only the merge-commit method allowed. **No "require linear
  history" rule:** it "prevents collaborators from pushing merge commits", leaving only squash or rebase *(fetched,
  rulesets)*, which contradicts the merge commits of method §10.
- **CODEOWNERS** at `.github/CODEOWNERS`. GitHub looks in `.github/`, then the root, then `docs/` and uses the first
  it finds; code owners need write access *(fetched, codeowners)*. It names the owner for `*` and for `/.github/`, so
  a workflow change asks for the owner *(fetched advice, secure-use)*. While the owner is the only person with write
  access it requests review but cannot block (the ruleset needs 0 approvals, G13); raise it to blocking when a second
  maintainer joins *(inferred)*.
- Workflows from **all external contributors** need approval. The default covers only first-time contributors
  *(fetched, actions-settings)*.
- Contributed fixtures pass the synthetic-shape check.
- Contributor sign-off (DCO or none) is the owner's decision. The default is none until outside contributions arrive.
- Commits use the address the owner chose for the project; no other personal, employer or institutional address appears.
- **Stays local only:**
  - `scan-words` (G3), its private word list and its allowlist; CI never holds them.
  - The hooks set by `./scripts/setup` (G9). CI is the second run, not a replacement.
  - `repo-setup` (G13): it needs an admin token, which never goes into CI.
  - Each package's name reservation or first publish, by the owner with two-factor authentication (G10).

## G12. Where each rule lives (nothing dropped in the REV 1 cut)

| Rule | Lives in |
|---|---|
| Roles: owner decides, reviewer reviews and rules, coordinators plan and run, implementers write | method §1 |
| Spec: numbered MUST statements with an example and a reason; what, never how; own earlier work ported through the method, third-party code only through §8 | method §2 |
| `OPEN:` lines go to the owner | method §2 |
| Spec review before tests (testable, no implementation, no conflict, reason) | method §2 |
| One test layer per statement (six layers incl. real-browser component and static check); example tables; one behaviour per statement | method §2; mutation split and failure proof §4, G8 |
| Red for the right reason, by script; re-proven in CI per commit | method §2; G7, G10 |
| Commit unit = one statement, never a failing commit | method §2 |
| Trace by results, statement hash, no skip/only/todo | method §2; G6 |
| PRD first, owner-approved; two-way PRD-statement trace | method §2 steps 0 and 7; G6 |
| Protected categories TIER/DEID/AUD/REF, owner-only, never below a system a spec was derived from | method §3 |
| Negative test for every protected statement | method §3; G6 |
| Security review at protected specs and boundary steps; findings block | method §3 |
| Protected files: mutation break = 100, equivalents need the owner | method §3; G8 |
| One coverage rule: 95 % of changed lines | method §4; G4 |
| Every changed file must appear in the coverage report | method §4; G4 |
| "Can this test fail?" review; a test with no assertion fails lint | method §4 |
| Mutation at step boundaries; per-language gateability | method §4; G8 |
| Equivalent mutants carry a reason on the line | method §4; G8 |
| KISS and DRY checks (second caller, requested setting, complexity, smaller diff, new dependency, duplication, one source) | method §5 |
| Component interface exempt from second caller; internals not | method §5 |
| No check fails open: canary, scanned-something, exit codes, could-not-check blocks | method §6; G1 |
| Each wrapper's own tests show it refusing | method §6; G1 |
| Component repo threshold; folder with an import check until then | method §7 |
| Example SvelteDT, repo `sveltedt`, npm package `@hniedner/sveltedt` | method §7 |
| Semver, 0.x then 1.0, generated changelog, tags | method §7 |
| Local link in development, published pin on main and releases | method §7; G5 |
| Rust components ship prebuilt; release target matrix | method §7; G10 |
| Library-first one-page evaluation; probe beats README; fetched practice before a non-trivial decision | method §8 |
| Synthetic data only, reserved identifier shape, checked | method §9; G11 |
| Secret scan before every push and in CI | method §9; G2, G10 |
| Private word list before every push, local only, allowlist for the owner's name | method §9; G3, G11 |
| No back-references; commits use the owner-chosen project address only | method §9; G11 |
| A pushed leak counts as published: rotate | method §9 |
| Supply chain: frozen installs, scripts off, dependency review, SECURITY.md, approval for all external contributors, sign-off decision | method §9; G11 |
| Dependabot: every ecosystem, groups, cooldown, security updates on, no auto-merge | method §9, §10; G11, G13 |
| Actions pinned by full SHA, enforced by repo setting, kept current by Dependabot | method §9; G10, G13 |
| Trusted publishing with provenance (npm; PyPI, crates.io where used); owner approves each release | method §1, §7; G10 |
| CodeQL default setup, extended suite; Scorecard published | method §9, §10; G10, G13 |
| Main ruleset (PR, required checks, no force push or deletion, merge commits only, no linear history) and CODEOWNERS | method §10; G11, G13 |
| Local gate first, one command | method §10; G9 |
| Hooks installed by setup and verified by the gate | method §10; G9 |
| Gate record not forgeable: CI `gate` check required on main; a missing check is could-not-check | method §10; G9, G13 |
| CI on in every repo from the first workflow; workflows, matrix rule, cache, concurrency, artifacts, least privilege; mutation jobs on Linux | method §10; G10, G8 |
| Each repo set up identically by one fail-closed script with read-back | method §6, §10; G13 |
| Review against the method; finding = severity by impact, rule, trigger; merge commits | method §10 |
| Rust criteria and costs | method §11 |
| Cost: 60-120 min per statement, inferred; measured from the first slice | method §12 |
| Report only what was measured; no reversal without the owner; raise a rule that is being fought | method §13 |

## G13. Repository setup checklist

Every new repo, the component repo and the application repo alike, is set up from this list by one script,
`repo-setup`. **The script comes later**, with its own tests against recorded API responses (per row: the expected
value, a wrong value, 404, 403, a missing field, a timeout), and it **fails closed** (method §6, G1): a read-back
that differs from the expected value is a finding; a call it cannot make or a response it cannot read is *could not
check*; neither is ever reported as pass. It applies each row, then reads it back. It runs from the owner's machine
with an admin token, never in CI. Paths are relative to `https://api.github.com`; `<owner>/<repo>` stands for the
repo. Calls and fields are *(fetched)* from docs.github.com/en/rest: `actions/permissions` (A1-A3), `repos/repos`
(A0, D1, D2, S1, S2, M1, F1), `pages/pages` (P1), `code-scanning/code-scanning` (C1), `repos/rules` (R1),
`deployments/environments` (E1), `dependency-graph/sboms` (F2); exceptions are marked.

**Order.** A0, then A1-A3, D1, D2, S1, S2, M1, P1; then the first commit, holding every file of F1, is pushed to main
and its `ci.yml` run must be green; then C1; then R1 (the `code_scanning` rule blocks every merge while CodeQL is not
configured *(fetched, rulesets)*), then E1 and F2. From R1 on, every change is a pull request, so `gate` is required
from the first workflow on.

| Row | Setting | Call | Read-back and expected values |
|---|---|---|---|
| A0 | Precondition | none | `GET /repos/<owner>/<repo>`: 200, `permissions.admin` true, `visibility` "public". Anything else makes every row *could not check*: without it, a later 404 cannot be read as "off" |
| A1 | Actions on; SHA pins required | `PUT /repos/<owner>/<repo>/actions/permissions` `{"enabled": true, "allowed_actions": "all", "sha_pinning_required": true}` | `GET` same path: `enabled` true, `allowed_actions` "all", `sha_pinning_required` true |
| A2 | Workflow token read-only; cannot approve pull requests | `PUT /repos/<owner>/<repo>/actions/permissions/workflow` `{"default_workflow_permissions": "read", "can_approve_pull_request_reviews": false}` | `GET` same path: `default_workflow_permissions` "read", `can_approve_pull_request_reviews` false |
| A3 | Approval for all outside contributors | `PUT /repos/<owner>/<repo>/actions/permissions/fork-pr-contributor-approval` `{"approval_policy": "all_external_contributors"}` | `GET` same path: `approval_policy` "all_external_contributors" |
| D1 | Dependabot alerts and the dependency graph | `PUT /repos/<owner>/<repo>/vulnerability-alerts`, no body, 204 | `GET` same path: 204 = on; 404 after A0 passed = off (finding); anything else *could not check* |
| D2 | Dependabot security updates | `PUT /repos/<owner>/<repo>/automated-security-fixes`, no body, 204 | `GET` same path: 200 with `enabled` true and `paused` false; 404 = off |
| S1 | Secret scanning and push protection | `PATCH /repos/<owner>/<repo>` `{"security_and_analysis": {"secret_scanning": {"status": "enabled"}, "secret_scanning_push_protection": {"status": "enabled"}}}` | `GET /repos/<owner>/<repo>`: `security_and_analysis.secret_scanning.status`, `.secret_scanning_push_protection.status` and `.dependabot_security_updates.status` all "enabled"; an absent object or key is *could not check* |
| S2 | Private vulnerability reporting | `PUT /repos/<owner>/<repo>/private-vulnerability-reporting`, no body, 204 | `GET` same path: `enabled` true |
| M1 | Merge commits only; issues on; wiki and projects off | `PATCH /repos/<owner>/<repo>` `{"allow_merge_commit": true, "allow_squash_merge": false, "allow_rebase_merge": false, "allow_auto_merge": false, "delete_branch_on_merge": true, "has_issues": true, "has_wiki": false, "has_projects": false}` | `GET /repos/<owner>/<repo>`: the same eight values |
| P1 | Pages off | none while off; if on, `DELETE /repos/<owner>/<repo>/pages`, 204 | `GET /repos/<owner>/<repo>/pages`: 404 = off *(inferred: the page documents 404 only as "Resource not found")*; 200 = on (finding) |
| F1 | Files on main | the first commit: `.github/workflows/ci.yml`, `dependency-review.yml`, `scorecard.yml`, `release.yml`; `.github/dependabot.yml`; `.github/CODEOWNERS`; `SECURITY.md` | `GET /repos/<owner>/<repo>/contents/<path>?ref=main`: 200 and `type` "file" for each *(not checked: the contents endpoint was not read)*; `GET /repos/<owner>/<repo>/codeowners/errors`: 200 with `errors` empty, counted only together with the contents check, because the docs do not say what a missing file returns |
| C1 | CodeQL default setup | `PATCH /repos/<owner>/<repo>/code-scanning/default-setup` `{"state": "configured", "query_suite": "extended", "languages": ["javascript-typescript", "actions"]}`, adding "python" or "rust" where used | `GET` same path: `state` "configured", `query_suite` "extended", `languages` equal as a set to those sent. The documented `languages` values do not include `rust`: a Rust repo whose read-back lacks it is *could not check* |
| R1 | Main ruleset | `POST /repos/<owner>/<repo>/rulesets` with the body below | `GET /repos/<owner>/<repo>/rulesets`: exactly one ruleset named "main"; `GET /repos/<owner>/<repo>/rulesets/<id>`: `enforcement` "active", `bypass_actors` empty, `conditions` and `rules` equal to the body, no `required_linear_history` rule |
| E1 | Release environment | `PUT /repos/<owner>/<repo>/environments/release` `{"reviewers": [{"type": "User", "id": <owner's user id>}], "prevent_self_review": false, "deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}`, then a tag policy for `v*` *(endpoint not checked)* | `GET` same path: a protection rule whose `reviewers` holds the owner's id; `deployment_branch_policy.custom_branch_policies` true. `prevent_self_review` stays false, because the owner both tags and approves |
| F2 | Dependency graph sees every ecosystem | none | `GET /repos/<owner>/<repo>/dependency-graph/sbom/generate-report`: 201 with `sbom_url`; then `GET /repos/<owner>/<repo>/dependency-graph/sbom/fetch-report/<sbom_uuid>`: 302 to the report, which lists packages from every ecosystem in `dependabot.yml`. Still 202 at the script's time limit: *could not check*. The one-call SBOM endpoint is retired after 2026-11-13, and the docs do not say how `sbom_uuid` follows from `sbom_url` *(fetched)*: *could not check* until the script's test pins it |

Body of R1:

```json
{"name": "main", "target": "branch", "enforcement": "active", "bypass_actors": [],
 "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
 "rules": [
  {"type": "deletion"},
  {"type": "non_fast_forward"},
  {"type": "pull_request", "parameters": {"required_approving_review_count": 0, "dismiss_stale_reviews_on_push": true,
    "require_code_owner_review": false, "require_last_push_approval": false, "required_review_thread_resolution": true,
    "allowed_merge_methods": ["merge"]}},
  {"type": "required_status_checks", "parameters": {"strict_required_status_checks_policy": true,
    "do_not_enforce_on_create": false, "required_status_checks": [
      {"context": "gate", "integration_id": 15368}, {"context": "dependency-review", "integration_id": 15368}]}},
  {"type": "code_scanning", "parameters": {"code_scanning_tools": [
      {"tool": "CodeQL", "security_alerts_threshold": "medium_or_higher", "alerts_threshold": "errors"}]}}]}
```

- `integration_id` 15368 is the GitHub Actions app *(fetched, api.github.com/apps/github-actions)*, so no other app
  can post a passing `gate`.
- `required_approving_review_count` is 0 because the owner is the only person with write access and a pull-request
  author cannot approve their own pull request *(not checked)*. The review against the method is recorded on the pull
  request. Raise it to 1, with `require_code_owner_review` and `require_last_push_approval` true, when a second
  maintainer joins.
- `strict_required_status_checks_policy` true: the branch must be up to date with main, so `gate` ran on what will
  merge *(fetched, rulesets)*. The extra runs are free on public repos.
- No bypass actors: the owner's own changes pass the same gate.
- The check name `gate` is the job's name; a job with no matrix reports under that name *(inferred)*.
