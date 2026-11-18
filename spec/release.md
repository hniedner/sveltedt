# Release path: release spec

- **Name:** the path from a merged pull request to a published package: the release workflow, the repository files
  it depends on (workflows, `package.json`, the lockfile and package-manager settings, the Dependabot
  configuration) and the release record.
- **Status:** part 1 of the release spec. Later parts add their statements to this file; the trace at the end says
  which requirements the statements so far cover.
- **Scope:** part 1: what the workflow files, the package metadata and the dependency settings must and must not
  contain (PRD-S5, PRD-S7), how the next version and its notes are worked out (PRD-K3, PRD-S7), when a run may
  publish (PRD-S7: rehearsal, approval, break-glass) and what each release record holds (rule 4.0, PRD-S5, PRD-S7,
  release criterion 7). The Pages deploy of PRD-W10 appears only as the one job that may write to Pages; the site
  spec covers what it deploys.

## Conventions

- **Statement form.** Each statement is one observable behaviour: an id, one MUST or MUST NOT sentence, an example
  (or an example table: the test runs every row), the reason, the test layer and a `Traces:` line naming the
  requirements of `docs/PRD.md` it serves. It says what happens, never how. Each test carries its statement's id and
  a hash of the statement text.
- **Before its test.** A statement may land before the test that proves it; what an untested statement blocks is
  the method's rule (section 2, step 7).
- **Test layers.**
  - **static check**: a scan of the repository's files, run in the gate, behind a wrapper that must find a planted
    canary. Each scan reports how many files it read; when it reads none, or a file it needs is missing, it reports
    "could not check", which blocks like a finding (rule 4.0).
  - **unit**: a step of the release path run by a test against a temporary git repository holding the tags and
    commits the example gives; no network, no registry, no GitHub.
  - **release record**: a field of the release record, written by the workflow or the owner and read by a static
    check; a field left empty is "could not check".
- **The release workflow** is the workflow file `.github/workflows/release.yml`; its file name is part of the
  trusted-publisher configuration on npm and is case-sensitive (PRD-S7 step 2).
- **The publish job** is the job of the release workflow that runs `npm publish`. **The tag job** creates the version
  tag and the GitHub release. **The deploy job** deploys the public site to GitHub Pages.
- **An automatic run** is a run of the release workflow started by a completed CI run of a push to `main`; **a
  manual run** is one started by hand (`workflow_dispatch`).
- **Versions** are written without the `v`; tags with it: version `0.4.0`, tag `v0.4.0`. **A release tag** is a tag
  `v<version>` whose version has no prerelease part.
- **Commits in examples** are written as their subject line, oldest first, after the newest release tag:
  `fix: keep focus` is a fix, `feat: add sizes` a feature, `feat!: rename onpage` or a footer `BREAKING CHANGE:` a
  breaking change, `docs: …`, `chore: …`, `test: …`, `ci: …`, `refactor: …`, `style: …` neither.
- **The release record** of a version is the file `docs/releases/<version>.md`; the rehearsal's is
  `docs/releases/rehearsal.md`. Its fields are listed in REC-01.
- **Data.** Example values are synthetic; run links use the placeholder `https://github.com/hniedner/sveltedt/actions/runs/1`.
- **Ids.** A statement keeps its id while its meaning stays. A new behaviour takes the next free number in its group.
  A requirement id from `docs/PRD.md` is written `PRD-S7`.

## 1. Supply chain (SUP)

**SUP-01** Every action a workflow uses MUST be pinned by a full 40-character commit SHA.
- Examples (the scan reads every file under `.github/workflows/` and `.github/actions/`; the test runs every row as
  a canary in a workflow file):

  | `uses:` value | Result |
  |---|---|
  | `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` | passes |
  | `./.github/actions/setup` (an action in this repository) | passes |
  | `actions/checkout@v4` | finding |
  | `actions/checkout@main` | finding |
  | `actions/checkout@3d3c42e` (a short SHA) | finding |
  | `docker://node:22` | finding |
  | `docker://node@sha256:` followed by 64 hex characters | passes |

- Reason: a tag or branch can be moved to new code after review; a full SHA cannot.
- Layer: static check.
- Traces: PRD-S5.

**SUP-02** Every workflow MUST grant its token no write scope at the top level.
- Examples (the test runs every row as the top-level `permissions` of a canary workflow):

  | Top-level `permissions` | Result |
  |---|---|
  | `contents: read` | passes |
  | `{}` | passes |
  | missing | finding |
  | `write-all` | finding |
  | `read-all` | passes |
  | `contents: write` | finding |

  A job may widen its own permissions; SUP-03 limits where.
- Reason: a job that needs a write scope names it, so every other job runs read-only even if the repository default
  changes.
- Layer: static check.
- Traces: PRD-S5.

**SUP-03** A write scope MUST appear only in the jobs this table names.
- Examples (the scan lists every job-level write scope in every workflow and compares it with this table; the test
  plants each canary in turn):

  | Scope | Allowed only in |
  |---|---|
  | `contents: write` | the tag job |
  | `id-token: write` | the publish job, and the deploy job (GitHub Pages needs it) |
  | `pages: write` | the deploy job |

  Canaries: `contents: write` in the CI workflow's job is a finding; `id-token: write` in the tag job is a finding;
  `pages: write` in the publish job is a finding; `packages: write` anywhere is a finding.
- Reason: the token that can create a tag cannot publish, and the token that can publish cannot write to the
  repository; a leak in one job costs only that job's power.
- Layer: static check.
- Traces: PRD-S5, PRD-S7, PRD-W10.

**SUP-04** The package MUST have no runtime dependency, and `svelte` MUST be its only peer dependency.
- Examples (the scan reads the repository's root `package.json`; the test runs every row as a canary):

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

**SUP-05** Every dependency install in a workflow MUST use the lockfile unchanged.
- Examples (the test runs every row as a step of a canary workflow):

  | Step | Result |
  |---|---|
  | `pnpm install --frozen-lockfile` | passes |
  | `pnpm install` | finding |
  | `pnpm i` | finding |
  | `pnpm add left-pad` | finding |
  | `npm install` | finding |
  | `npm ci` | finding (the repository's lockfile is pnpm's) |
  | `yarn install` | finding |
  | `npm publish` | passes (not an install) |

- Reason: an install that may rewrite the lockfile can pull a version nobody reviewed.
- Layer: static check.
- Traces: PRD-S5.

**SUP-06** Dependency install scripts MUST NOT run, except for the packages of the reviewed allow-list.
- Examples (the scan reads the package manager's settings in the repository; the test runs every row as a canary):

  | Setting | Result |
  |---|---|
  | no package allowed, and an unlisted package with a script fails the install | passes |
  | `esbuild` allowed, with the reason its script must run beside it | passes |
  | `esbuild` allowed with no reason | finding |
  | every package allowed | finding |
  | an unlisted package with a script only warned about, the install going on | finding |

  The allow-list lives in the package manager's settings in the repository; each entry carries its reason.
- Reason: an install script runs with the developer's and the runner's rights before any test or review.
- Layer: static check.
- Traces: PRD-S5.

**SUP-07** The Dependabot configuration MUST cover npm and GitHub Actions, each with a cooldown and grouped version
updates.
- Examples (the scan reads `.github/dependabot.yml`; the test runs every row as a canary):

  | Configuration | Result |
  |---|---|
  | `npm` and `github-actions` entries, each with `cooldown` and a `groups` entry for version updates | passes |
  | the `npm` entry missing | finding |
  | the `github-actions` entry without `cooldown` | finding |
  | the `npm` entry without a group for version updates | finding |

- Reason: grouped, delayed updates keep the review load small and let a bad release be withdrawn before it lands.
- Layer: static check.
- Traces: PRD-S5.

**SUP-08** A workflow that runs on every pull request MUST run the dependency review.
- Examples (the test runs every row as a canary):

  | Workflows | Result |
  |---|---|
  | one workflow on `pull_request` with a step using `actions/dependency-review-action` | passes |
  | that workflow with a `paths` filter on its `pull_request` trigger | finding (it would skip some pull requests) |
  | no workflow using `actions/dependency-review-action` | finding |
  | the step only on `push` | finding |

- Reason: a new or changed dependency is reviewed before it can merge.
- Layer: static check.
- Traces: PRD-S5.

## 2. The release workflow (REL)

**REL-01** The release workflow MUST start only after a successful CI run of a push to `main`, or by hand.
- Examples (the scan reads the release workflow; the test runs every row as a canary):

  | Triggers and job conditions | Result |
  |---|---|
  | `workflow_run` of the CI workflow, `completed`, on `main`; `workflow_dispatch`; jobs run only when the run concluded `success` and was a `push` | passes |
  | an added `push` trigger | finding |
  | an added `pull_request` or `pull_request_target` trigger | finding |
  | `workflow_run` without the `success` condition | finding |
  | `workflow_run` without the `push` condition | finding |

- Reason: a release must contain only code whose required checks and post-merge CI have passed.
- Layer: static check.
- Traces: PRD-S7.

**REL-02** An automatic run MUST release nothing when `main` has moved past the commit its CI run validated.
- Examples (the test runs every row):

  | Validated commit | `main`'s head | Commits since `v0.3.1` | Result |
  |---|---|---|---|
  | C2 | C2 | `fix: keep focus` | tag `v0.3.2` on C2 |
  | C1 | C2 | `fix: keep focus` (C1), `feat: add sizes` (C2) | no tag; the run says it defers to C2's own run |

- Reason: the tag must name exactly the tree CI passed; the newer commit's own run releases it.
- Layer: unit.
- Traces: PRD-S7.

**REL-03** The next version MUST follow from the commits since the newest release tag, and MUST stay below 1.0.0.
- Examples (the test runs every row):

  | Newest release tag | Commits since it | Next version |
  |---|---|---|
  | `v0.3.1` | `fix: keep focus` | `0.3.2` |
  | `v0.3.1` | `fix: keep focus`, `fix: name the pager` | `0.3.2` |
  | `v0.3.1` | `feat: add sizes` | `0.4.0` |
  | `v0.3.1` | `fix: keep focus`, `feat: add sizes` | `0.4.0` |
  | `v0.3.1` | `feat!: rename onpage` | `0.4.0` |
  | `v0.9.4` | `fix: keep focus` with a footer `BREAKING CHANGE: the payload is a list` | `0.10.0` |
  | `v0.3.1` | `docs: fix a link`, `chore: bump a dev dependency` | none: no release |
  | none | `feat: add sizes` | `0.1.0` |
  | `v0.3.1`, then `v0.3.2` tagged by hand (a break-glass) on a later commit | `fix: keep focus` after `v0.3.2` | `0.3.3` |

  A tag with a prerelease part, such as `v0.1.0-rehearsal.0`, is not a release tag and is ignored.
- Reason: the version tells consumers what changed (PRD-K3); 1.0 is the owner's decision, so a breaking change
  bumps the minor while below it; a version tagged by hand is never computed again.
- Layer: unit.
- Traces: PRD-S7, PRD-K3.

**REL-04** The GitHub release's notes MUST list every feature, fix and breaking change since the previous release tag,
and no other commit.
- Example: after `v0.3.1`, the commits `feat: add sizes`, `docs: fix a link`, `fix: keep focus` and
  `feat!: rename onpage` give notes for `0.4.0` that hold "add sizes", "keep focus" and "rename onpage", the last
  marked as breaking, and do not hold "fix a link".
- Reason: the changelog is generated from commits (PRD-K3); notes that list chores bury what a consumer must read.
- Layer: unit.
- Traces: PRD-K3, PRD-S7.

**REL-05** The release workflow MUST NOT push a commit to any branch.
- Examples (the scan reads the release workflow; the test runs every row as a canary step):

  | Step | Result |
  |---|---|
  | `git push origin v0.4.0` (a tag) | passes |
  | `git push origin main` | finding |
  | `git push` with no ref | finding |
  | `git commit -m "release"` | finding |
  | an action input `commit: true` | finding |

- Reason: `main` changes only through reviewed pull requests; the version reaches the package inside the runner
  (REL-08).
- Layer: static check.
- Traces: PRD-S7.

**REL-06** The only command in any workflow that changes the npm registry MUST be one `npm publish`, in the publish
job, which runs in the `release` environment.
- Examples (the scan reads every workflow; the test runs every row as a canary):

  | Workflows | Result |
  |---|---|
  | one `npm publish` step in the publish job, which has `environment: release` | passes |
  | the publish job without `environment: release` | finding |
  | a second `npm publish` in another job | finding |
  | `npm dist-tag add @hniedner/sveltedt@0.4.0 latest` anywhere | finding |
  | `npm deprecate`, `npm unpublish`, `npm owner` or `npm access` anywhere | finding |
  | `pnpm publish` or `yarn npm publish` anywhere | finding |

- Reason: the `release` environment waits for the owner's approval, and the trusted publisher must never be asked to
  move a dist-tag (PRD-S7 step 3).
- Layer: static check.
- Traces: PRD-S7.

**REL-07** No workflow and no repository file MUST reference an npm token.
- Examples (the scan reads every workflow and every `.npmrc` in the repository; the test runs every row as a
  canary):

  | Text | Result |
  |---|---|
  | `NODE_AUTH_TOKEN` | finding |
  | `${{ secrets.NPM_TOKEN }}` | finding |
  | `//registry.npmjs.org/:_authToken=` | finding |
  | `id-token: write` | passes |

- Reason: publishing goes through the trusted publisher only; a stored token is a second, unrecorded way in.
- Layer: static check.
- Traces: PRD-S7.

**REL-08** The published package MUST carry the version of the tag it was built from.
- Examples (the test runs every row: the step checks out the tag and writes the version into the package
  metadata inside the runner):

  | Tag | Version in `package.json` on `main` | Version in the packed tarball |
  |---|---|---|
  | `v0.4.0` | `0.0.0` | `0.4.0` |
  | `v0.1.0-rehearsal.0` | `0.0.0` | `0.1.0-rehearsal.0` |

- Reason: with no commit to `main` (REL-05), the tag is the only place the version lives.
- Layer: unit.
- Traces: PRD-S7.

**REL-09** The `version` in `package.json` on `main` MUST be `0.0.0`.
- Examples (the test runs every row as a canary): `0.0.0` passes; `0.4.0` is a finding; `0.0.0-development` is a
  finding; a missing `version` is a finding.
- Reason: a real version on `main` would drift from the tags; `0.0.0` is the placeholder already on the registry
  (PRD-S7 step 1), so a publish of `main` by mistake names a version npm already holds and is refused (INFERRED:
  npm never accepts a published version twice).
- Layer: static check.
- Traces: PRD-S7.

**REL-10** A version with a prerelease part MUST be published with `--tag` set to that part's first identifier, and a
version without one MUST be published without `--tag`.
- Examples (the test runs every row):

  | Version | `npm publish` arguments |
  |---|---|
  | `0.4.0` | no `--tag` |
  | `0.1.0-rehearsal.0` | `--tag rehearsal` |
  | `0.5.0-beta.2` | `--tag beta` |

  A prerelease part whose first identifier is a number (`0.5.0-1`) or `latest` is refused: the run fails before
  publishing and names the version.
- Reason: a publish without `--tag` moves `latest` (READ, docs.npmjs.com npm-dist-tag), so a prerelease would become
  what `npm install` selects.
- Layer: unit.
- Traces: PRD-S7.

**REL-11** The package metadata and the publish job MUST meet the trusted publisher's conditions.
- Examples (the scan reads `package.json` and the release workflow; the test runs every row as a canary):

  | Condition | Passes with | Finding with |
  |---|---|---|
  | `repository.url` | `git+https://github.com/hniedner/sveltedt.git` | `https://github.com/HNiedner/sveltedt` |
  | the publish job's runner | `ubuntu-24.04` (GitHub-hosted) | `self-hosted` |
  | the Node version the publish job sets up | `22.14.0` or later | `20.19.0` |
  | the npm version the publish job uses | `11.5.1` or later | `10.9.2` |

- Reason: npm refuses a trusted publish whose repository, runner or CLI does not match (PRD-S7 step 2, READ).
- Layer: static check.
- Traces: PRD-S7.

**REL-12** An automatic run MUST NOT publish while the rehearsal record is missing.
- Examples (the test runs every row):

  | Run | `docs/releases/rehearsal.md` | Commits since `v0.3.1` | Result |
  |---|---|---|---|
  | automatic | missing | `feat: add sizes` | no tag, no GitHub release, no publish; the run fails and says the rehearsal record is missing |
  | manual | missing | any | publishes `0.1.0-rehearsal.0` with `--tag rehearsal`; no release tag |
  | automatic | present, complete (REC-04) | `feat: add sizes` | tag `v0.4.0` and its GitHub release; the publish job waits for approval |
  | manual | present, complete (REC-04) | `feat: add sizes` | as the automatic run for `main`'s head: tag `v0.4.0`; the publish job waits for approval |

- Reason: the first publish binds the trusted-publisher configuration (PRD-S7 step 4); it must be the rehearsal, a
  prerelease `npm install` never selects, and not a real release. No tag is made first, so no version is used up
  before it can be published.
- Layer: unit.
- Traces: PRD-S7.

**REL-13** The publish job MUST NOT publish a minor or major version while that version's screen-reader protocol
record is missing.
- Examples (the test runs every row):

  | Previous release tag | Version | Protocol record of that version | Result |
  |---|---|---|---|
  | `v0.3.1` | `0.3.2` (a fix) | missing | publishes once approved |
  | `v0.3.1` | `0.4.0` | missing | no publish; the run fails and names the missing record |
  | `v0.3.1` | `0.4.0` | present, no open blocker | publishes once approved |
  | `v0.3.1` | `0.4.0` | present, one open blocker | no publish; the run fails and names the blocker |

  The record is read from `main`'s head when the publish job runs, so once the record has merged, re-running the
  failed publish job publishes the tag it was given.

- Reason: PRD-S7 lets a minor or major release be approved only after its PRD-A5 record exists; a check makes that
  hold even when an approval is given in haste.
- Layer: unit.
- Traces: PRD-S7, PRD-A5.

**REL-14** Two release runs MUST NOT run at the same time, and a waiting run MUST NOT be cancelled.
- Examples (the scan reads the release workflow; the test runs every row as a canary): one `concurrency` group for
  the whole workflow with `cancel-in-progress: false` passes; no `concurrency` is a finding; `cancel-in-progress:
  true` is a finding; a group that includes the run id (so each run has its own group) is a finding.
- Reason: a run waiting for the owner's approval must not be overtaken or dropped; the next run computes its version
  from the tag the waiting run made.
- Layer: static check.
- Traces: PRD-S7.

## 3. The release record (REC)

**REC-01** Every release tag except the newest MUST have a complete release record.
- Examples (the check lists the release tags and reads each record; the test runs every row):

  | Release tags | Record of `v0.4.0` | Result |
  |---|---|---|
  | `v0.4.0`, `v0.4.1` | `docs/releases/0.4.0.md` with every field of the table below | passes |
  | `v0.4.0`, `v0.4.1` | missing | finding |
  | `v0.4.0`, `v0.4.1` | present, "Published by" empty | could not check |
  | `v0.4.0` only | missing | passes: the newest tag's record may still be in progress |

  | Field | Example |
  |---|---|
  | Version and tag commit | `0.4.0`, the 40-character SHA of `v0.4.0` |
  | Published by | the run link `https://github.com/hniedner/sveltedt/actions/runs/1`, or "manual, no provenance" with the reason (REC-02) |
  | Approved by | the owner, with the time of the approval |
  | Registry check | the output of `npm view @hniedner/sveltedt@0.4.0 version dist.attestations`, showing the version and, unless manual, the provenance |
  | Repository settings | the readings of REC-03 |
  | Manual steps | each named manual step of rule 4.0 with pass or fail (for a minor or major: the PRD-A5 protocol record's link) |

  The check runs in the gate, so a record is due before anything merges after the next release tag. The newest tag
  is exempt because its record waits for the publish, and the pull request that adds the protocol record for it
  (REL-13) must be able to merge.
- Reason: the release record is where rule 4.0 puts the steps no automated check can take; a missing field is a
  step not taken.
- Layer: release record.
- Traces: PRD-S5, PRD-S7, PRD-A5.

**REC-02** The record of a version published by hand MUST say "manual, no provenance" and why.
- Examples (the test runs every row):

  | Record of `0.3.2` | Result |
  |---|---|
  | "Published by: manual, no provenance: the workflow could not publish a security fix" | passes |
  | "Published by: manual, no provenance" | could not check |
  | "Published by: manual", the registry check showing no provenance | finding |

  The owner also tags the version by hand before the next automatic run (ruling on PRD-S7); REL-03's last example
  shows that the workflow then never computes it again.
- Reason: the break-glass is the one exception to provenance (PRD-S7), and criterion 7 asks for it to be listed with
  its reason.
- Layer: release record.
- Traces: PRD-S7.

**REC-03** Each release record MUST hold the owner's reading of the repository settings PRD-S5 names.
- Examples (the test runs every row: a record lacking one reading is "could not check"):

  | Setting | Example reading |
  |---|---|
  | Default workflow token permissions | read |
  | Secret scanning and push protection | on, on |
  | Dependabot alerts and security updates | on, on |
  | Ruleset on `main` | `gate` and `dependency-review` required |
  | npm package setting | "Require two-factor authentication and disallow tokens", from step 5 of PRD-S7 on |

- Reason: these settings need an admin credential the checks never hold, so the owner reads them for each release
  (PRD-S5).
- Layer: release record.
- Traces: PRD-S5, PRD-S7.

**REC-04** The rehearsal record MUST show the rehearsal on its own dist-tag, with provenance, and `latest` unmoved.
- Example: `docs/releases/rehearsal.md` holds the run link, the output of `npm view @hniedner/sveltedt dist-tags`
  showing `rehearsal: 0.1.0-rehearsal.0` and `latest: 0.0.0`, the provenance of `0.1.0-rehearsal.0`, and whether
  "Allow npm dist-tag" had to be turned on (PRD-S7 step 3). A record missing any of these is "could not check".
- Reason: the rehearsal proves the publishing path once, before any real release; REL-12 reads this record.
- Layer: release record.
- Traces: PRD-S7.

## Trace

### Statement -> PRD

| Statement | PRD ids |
|---|---|
| SUP-01 | PRD-S5 |
| SUP-02 | PRD-S5 |
| SUP-03 | PRD-S5, PRD-S7, PRD-W10 |
| SUP-04 | PRD-S5 |
| SUP-05 | PRD-S5 |
| SUP-06 | PRD-S5 |
| SUP-07 | PRD-S5 |
| SUP-08 | PRD-S5 |
| REL-01 | PRD-S7 |
| REL-02 | PRD-S7 |
| REL-03 | PRD-S7, PRD-K3 |
| REL-04 | PRD-K3, PRD-S7 |
| REL-05 | PRD-S7 |
| REL-06 | PRD-S7 |
| REL-07 | PRD-S7 |
| REL-08 | PRD-S7 |
| REL-09 | PRD-S7 |
| REL-10 | PRD-S7 |
| REL-11 | PRD-S7 |
| REL-12 | PRD-S7 |
| REL-13 | PRD-S7, PRD-A5 |
| REL-14 | PRD-S7 |
| REC-01 | PRD-S5, PRD-S7, PRD-A5 |
| REC-02 | PRD-S7 |
| REC-03 | PRD-S5, PRD-S7 |
| REC-04 | PRD-S7 |

### PRD must -> statements

| PRD id | Statements | Coverage |
|---|---|---|
| PRD-S5 | SUP-01, SUP-02, SUP-03, SUP-04, SUP-05, SUP-06, SUP-07, SUP-08, REC-01, REC-03 | in full |
| PRD-S7 | SUP-03, REL-01 to REL-14, REC-01 to REC-04 | in full, except release criterion 7's "1.0 ... with no exception", which the 1.0 release record proves |
| PRD-K3 | REL-03, REL-04 | in part: the semver rules for what is breaking, the deprecation warning and the upgrade note per major come with the documentation and API-report statements |
| PRD-A5 | REL-13, REC-01 | in part: the protocol itself is the accessibility statements' |
| PRD-W10 | SUP-03 | in part: what the site deploys is the site spec's |
