# Release path: release spec

- **Name:** the path from a merged pull request to a published package: the workflows, the repository files they
  depend on (`package.json`, the lockfile and package-manager settings, the Dependabot configuration), the release
  workflow and the release record.
- **Status:** part 1a of the release spec. Later parts add their statements to this file; the trace at the end says
  which requirements the statements so far cover.
- Field names: no
- **Scope:** part 1a: the supply-chain rules for the repository's files (PRD-S5); SUP-09 and SUP-10 extend two of
  them to the consumer project's own folder (`consumer/`, `spec/package.md`). The release workflow, the publishing
  path and the release record (PRD-S7, the rest of PRD-S5) come with part 1b.

## Conventions

- **Statement form.** Each statement is one observable behaviour: an id, one MUST or MUST NOT sentence, an example
  (or an example table: the test runs every row), the reason, the test layer and a `Traces:` line naming the
  requirements of `docs/PRD.md` it serves. It says what happens, never how. Each test carries its statement's id and
  a hash of the statement text.
- **Before its test.** A statement may land before the test that proves it; what an untested statement blocks is
  the method's rule (section 2, step 7). The checks of this part are built in a later step, each only once what it
  reads exists on `main`: the lockfile and the package manager's settings (SUP-05, SUP-06), the release workflow
  (SUP-03's rows for its jobs), and a package manifest that is publishable, without `"private": true`, which the
  packaging change makes it (SUP-04). Nothing obliges the pull request that adds those files to build the check.
- **Test layers.**
  - **static check**: a scan of the repository's files, run in the gate, behind a wrapper that must find a planted
    canary. Each scan reports how many files it read; when it reads none, or a file it needs is missing, it reports
    "could not check", which blocks like a finding (PRD rule 4.0).
- **The workflows** are the files under `.github/workflows/`; the actions of this repository are those under
  `.github/actions/`.
- **Jobs, by workflow file and job id.** `ci.yml`: `static`, `gate`. `dependency-review.yml`: `dependency-review`.
  `scorecard.yml`: `analysis` (**the scorecard job**). `release.yml` (written with part 1b): `tag` (**the tag job**:
  creates the version tag and the GitHub release), `publish` (**the publish job**: runs `npm publish`), `deploy`
  (**the deploy job**: deploys the public site to GitHub Pages).
- **The package manifest** is the `package.json` whose `name` is `@hniedner/sveltedt`; **the lockfile** is
  `pnpm-lock.yaml` at the repository root; **the package manager's settings** are `pnpm-workspace.yaml` at the root.
- **Exact version.** A version written as three numbers, `11.6.2`; `11`, `^11`, `~11.6` and `latest` are not exact.
- **An install** is a step that fetches packages: a package-manager command `install`, `i`, `add`, `ci`, `dlx`,
  `npx` or `corepack prepare`, or the `pnpm/action-setup` action. **A tool install** is one with `--global`, `pnpm
  dlx`, `npx`, `corepack prepare` or the `pnpm/action-setup` action (which installs pnpm itself); the action's
  `run_install: true` and every other install are dependency installs. Commands that fetch nothing (`pnpm run`,
  `pnpm exec`, `pnpm gate`, `corepack enable`, `npm publish`) and a download pinned by a checksum (`curl` and
  `sha256sum`) are not installs.
- **Data.** Example values are synthetic.
- **Ids.** A statement keeps its id while its meaning stays. A new behaviour takes the next free number in its group.
  A requirement id from `docs/PRD.md` is written `PRD-S5`.

## 1. Supply chain (SUP)

**SUP-01** Every action and reusable workflow a workflow uses from outside this repository MUST be pinned by a full
40-character commit SHA, and every container image by its `sha256` digest.
- Examples (the scan reads the workflows and the actions of this repository; the test runs every row as a canary in a
  workflow file):

  | `uses:` value | Result |
  |---|---|
  | `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` | passes |
  | `./.github/actions/setup` (an action in this repository) | passes |
  | `actions/checkout@v4` | finding |
  | `actions/checkout@main` | finding |
  | `actions/checkout@3d3c42e` (a short SHA) | finding |
  | `docker://node:22` | finding |
  | `docker://node@sha256:` followed by 64 hex characters | passes |
  | a job's `uses: hniedner/workflows/.github/workflows/x.yml@v1` (a reusable workflow by tag) | finding |
  | a job's `uses: ./.github/workflows/x.yml` (a reusable workflow in this repository) | passes |
  | a job's `container: node:22` | finding |
  | a job's `services:` entry with `image: postgres:17` | finding |
  | `container:` or `services:` image `node@sha256:` followed by 64 hex characters | passes |
  | image `node:22@sha256:` followed by 64 hex characters (tag and digest, as Dependabot writes it) | passes |

- Reason: a tag or branch can be moved to new code after review; a full SHA or digest cannot.
- Layer: static check.
- Traces: PRD-S5.

**SUP-02** Every workflow MUST grant its token no write scope at the top level.
- Examples (the test runs every row as the top-level `permissions` of a canary workflow):

  | Top-level `permissions` | Result |
  |---|---|
  | `contents: read` | passes |
  | `{}` | passes |
  | `read-all` | passes |
  | missing | finding |
  | `write-all` | finding |
  | `contents: write` | finding |
  | `id-token: write` | finding |

  A job may widen its own permissions; SUP-03 limits where.
- Reason: a job that needs a write scope names it, so every other job runs read-only even if the repository default
  changes.
- Layer: static check.
- Traces: PRD-S5.

**SUP-03** A job-level write scope MUST appear only in the jobs this table names; a scope the table does not name is
allowed in no job.
- Examples (the scan lists every job-level write scope in every workflow and compares it with this table; the test
  plants each canary in turn):

  | Scope | Allowed only in |
  |---|---|
  | `contents: write` | the tag job |
  | `id-token: write` | the publish job, the deploy job (GitHub Pages needs it) and the scorecard job |
  | `pages: write` | the deploy job |
  | `security-events: write` | the scorecard job |

  The scorecard job as it is on `main` (`security-events: write`, `id-token: write`) passes. Canaries:
  `contents: write` in `ci.yml`'s `static` job is a finding; `id-token: write` in the tag job is a finding;
  `pages: write` in the publish job is a finding; `packages: write`, `pull-requests: write`, `issues: write`,
  `actions: write` or `attestations: write` in any job is a finding; a job's `permissions: write-all` is a finding.
- Reason: the token that can create a tag cannot publish, and the token that can publish cannot write to the
  repository; a leak in one job costs only that job's power.
- Layer: static check.
- Traces: PRD-S5.

**SUP-04** The package MUST have no runtime dependency, and `svelte` MUST be its only peer dependency.
- Examples (the scan reads the package manifest among the files git tracks, so copies under `node_modules` or a
  build folder are never read; no manifest, or more than one, is "could not check"; the test runs every row as a
  canary):

  | `package.json` | Result |
  |---|---|
  | no `dependencies`, `peerDependencies` `{ "svelte": "^5.20.0" }` | passes |
  | `dependencies` `{}`, the same peer | passes |
  | `dependencies` `{ "clsx": "^2.0.0" }` | finding |
  | `peerDependencies` `{ "svelte": "^5.20.0", "tailwindcss": "^4.0.0" }` | finding |
  | `optionalDependencies` `{ "x": "1.0.0" }` | finding |
  | no `peerDependencies` | finding |

- Reason: every runtime dependency is code every consumer runs; the PRD allows the Svelte peer only.
- Layer: static check.
- Traces: PRD-S5.

**SUP-05** Every dependency install in a workflow MUST install from the committed lockfile unchanged, and every tool
install MUST name an exact version.
- Examples (the test runs every row as a step of a canary workflow, alone and inside a multi-line `run:` block):

  | Step | Result |
  |---|---|
  | `pnpm install --frozen-lockfile` | passes |
  | `pnpm install` | finding |
  | `pnpm install --no-frozen-lockfile` | finding |
  | `pnpm install --lockfile-only` | finding |
  | `pnpm/action-setup` with `run_install: true` | finding |
  | `pnpm i` | finding |
  | `pnpm add left-pad` | finding |
  | `pnpm add left-pad@1.3.0` (a dependency install, even at an exact version) | finding |
  | `pnpm/action-setup` with `version: 10` | finding |
  | `pnpm/action-setup` with no `version` (it reads the exact `packageManager` of `package.json`) | passes |
  | `curl -fsSL -o x.tgz <url>` then `sha256sum -c` (a checksum-pinned download) | passes |
  | `npm install` | finding |
  | `npm ci` | finding (the repository's lockfile is pnpm's) |
  | `yarn install` | finding |
  | `npm install --global npm@11.6.2` (a tool at a pinned version, not a dependency) | passes |
  | `npm install --global npm@latest` | finding |
  | `npm install --global npm@^11` | finding |
  | `pnpm dlx publint@0.3.12` or `npx publint@0.3.12` | passes |
  | `pnpm dlx publint` or `npx publint` | finding |
  | `npm publish` | passes (not an install) |
  | `pnpm gate`, `pnpm run build`, `pnpm exec playwright test`, `corepack enable` | passes (not installs) |

- Reason: development dependencies stay locked (PRD-S5): an install that may rewrite the lockfile, or a tool at a
  floating version, can pull code nobody reviewed.
- Layer: static check.
- Traces: PRD-S5.

**SUP-06** Dependency install scripts MUST NOT run, except for the packages of the reviewed allow-list.
- Examples (the scan reads the package manager's settings; the test runs every row as a canary):

  | Setting | Result |
  |---|---|
  | no package allowed, and an unlisted package with a script fails the install | passes |
  | `esbuild` allowed, with the reason its script must run beside it | passes |
  | `esbuild` allowed with no reason | finding |
  | every package allowed | finding |
  | an unlisted package with a script only warned about, the install going on | finding |
  | `esbuild` refused (set to `false`) with no reason | passes: refusing needs no reason |

  The allow-list is the settings' build allow-list; each allowed entry carries its reason in a non-empty comment on
  the same line or the line above.
- Reason: an install script runs with the developer's and the runner's rights before any test or review.
- Layer: static check.
- Traces: PRD-S5.

**SUP-07** The Dependabot configuration MUST cover npm for the repository root and GitHub Actions, each with a
cooldown whose every day field is at least 1, and grouped version updates.
- Examples (the scan reads `.github/dependabot.yml`; the test runs every row as a canary):

  | Configuration | Result |
  |---|---|
  | `npm` for directory `/` and `github-actions`, each with a cooldown of at least 1 day and a `groups` entry for version updates | passes |
  | the `npm` entry with `directories: ["/"]` | passes |
  | a `groups` entry with no `applies-to` (it then applies to version updates) | passes |
  | the `npm` entry missing | finding |
  | the `npm` entry for another directory only | finding |
  | the `github-actions` entry without `cooldown` | finding |
  | the `npm` entry without a group for version updates | finding |
  | the `github-actions` entry without a group for version updates | finding |
  | a group with `applies-to: security-updates` only | finding (no group for version updates) |
  | a cooldown of `default-days: 0` | finding |
  | an `npm` cooldown of `semver-patch-days: 3` and no other field | passes |
  | an `npm` cooldown of `default-days: 0` and `semver-patch-days: 3` | finding |

- Reason: grouped, delayed updates keep the review load small and let a bad release be withdrawn before it lands.
- Layer: static check.
- Traces: PRD-S5.

**SUP-08** A job with the id `dependency-review` MUST run the dependency review on every pull request.
- Examples (the test runs every row as a canary):

  | Workflows | Result |
  |---|---|
  | one workflow on `pull_request`, with no filter, whose job `dependency-review` runs a step using `actions/dependency-review-action` | passes |
  | the same with the job id `review` | finding (the ruleset's required check `dependency-review` would never report) |
  | that workflow with a `paths` filter on its `pull_request` trigger | finding (it would skip some pull requests) |
  | that workflow with a `branches` filter on its `pull_request` trigger | finding |
  | that job with an `if:` condition | finding |
  | the review step with an `if:` condition | finding |
  | a `paths-ignore` or `branches-ignore` filter | finding |
  | a `types:` list on `pull_request` that omits any one of `opened`, `synchronize`, `reopened` (for example `[opened, synchronize]`) | finding (that pull request event is not reviewed) |
  | the step or its job with `continue-on-error: true` | finding |
  | the step with `warn-only: true` | finding |
  | the step only in a workflow on `pull_request_target` | finding |
  | no workflow using `actions/dependency-review-action` | finding |
  | the step only in a workflow on `push` | finding |

- Reason: a new or changed dependency is reviewed before it can merge; the `main` ruleset requires a check of that
  name, and the release record of part 1b records that setting.
- Layer: static check.
- Traces: PRD-S5.

**SUP-09** The Dependabot configuration MUST cover npm for the consumer project's folder `/consumer`, with a cooldown
whose every day field is at least 1, and grouped version updates.
- Examples (the scan reads `.github/dependabot.yml`; the test runs every row as a canary; cooldown and group are judged
  as in SUP-07):

  | Configuration | Result |
  |---|---|
  | an `npm` entry for directory `/consumer` with a cooldown of at least 1 day and a `groups` entry for version updates | passes |
  | the `npm` entry with `directories: ["/", "/consumer"]`, cooldown and group as above | passes |
  | no `npm` entry covering `/consumer` | finding |
  | the `/consumer` entry without `cooldown` | finding |
  | the `/consumer` entry without a group for version updates | finding |

  When the repository has no `consumer/package.json`, the check reports "could not check". Break that turns it red:
  the `/consumer` entry removed from the configuration.
- Reason: the consumer project has its own manifest and lockfile (CON-01 of `spec/package.md`), which the root's
  entry does not cover; its framework and build tools need the same delayed, grouped updates as the root's.
- Layer: static check.
- Traces: PRD-S5.

**SUP-10** The consumer project's own package-manager settings MUST let no dependency install script run, except for
the packages of the reviewed allow-list.
- Examples (the scan reads `consumer/pnpm-workspace.yaml`, the consumer's own settings file, which the root's settings
  do not reach because the consumer is not a workspace member; each row is judged as in SUP-06; the test runs every
  row as a canary):

  | `consumer/pnpm-workspace.yaml` | Result |
  |---|---|
  | `esbuild` refused (set to `false`), and an unlisted package with a script fails the install | passes |
  | `esbuild` allowed with no reason | finding |
  | every package allowed | finding |
  | an unlisted package with a script only warned about, the install going on | finding |
  | the file missing | could not check |

  Break that turns it red: `esbuild: true` with no reason in the consumer's settings.
- Reason: without settings of its own the consumer's install refuses `esbuild`'s script (MEASURED in this project's
  probe), and settings that allow every script would run code nobody reviewed before any test; SUP-06 reads only the
  root's file.
- Layer: static check.
- Traces: PRD-S5.

## Trace

### Statement -> PRD

| Statement | PRD ids |
|---|---|
| SUP-01 | PRD-S5 |
| SUP-02 | PRD-S5 |
| SUP-03 | PRD-S5 |
| SUP-04 | PRD-S5 |
| SUP-05 | PRD-S5 |
| SUP-06 | PRD-S5 |
| SUP-07 | PRD-S5 |
| SUP-08 | PRD-S5 |
| SUP-09 | PRD-S5 |
| SUP-10 | PRD-S5 |

### PRD must -> statements

| PRD id | Statements | Coverage |
|---|---|---|
| PRD-S5 | SUP-01, SUP-02, SUP-03, SUP-04, SUP-05, SUP-06, SUP-07, SUP-08, SUP-09, SUP-10 | in part: "development dependencies locked, installs frozen" is SUP-05; the repository settings (secret scanning with push protection, Dependabot alerts and security updates, read-only default token, the required checks) are read by the owner into the release record of part 1b |

PRD musts of the release path left to later parts: PRD-S7, and PRD-K3's changelog and version rules.
