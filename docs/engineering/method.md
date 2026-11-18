APPROVED by the owner 2026-11-17 11:04; binding; changes only through the change log.

# Engineering method (REV 1)

REV 1, 2026-11-17, after an adversarial pass (all findings accepted). This method binds every repository of the
project: the application and each component. It changes only by an owner decision, recorded with its date and
reason in the change log at the end. How each check works is in the companion file [`gates.md`](gates.md)
(sections G1-G13). Facts marked *(fetched)* were read from the named page on 2026-11-17.

**Quality first.** Architectural and engineering quality win over pace wherever they conflict (owner, 2026-11-17).
Cost is measured (section 12) only to plan; it is never a reason to skip a check or accept a weaker design.

## 1. Roles

- **Owner** approves each PRD and decides the principles, the scope, open spec questions, the protected categories (section 3), licences,
  what is public, and releases.
- **Reviewer** reviews every plan and change against this method and rules on routine questions, giving a reason. It
  never decides an owner item; it asks one question with a recommendation.
- **Coordinators** turn rulings into plans, brief the implementers (people or agents), run the gates and report what
  was measured. A second reviewer attacks a plan before anyone builds on it.
- **Implementers** write the tests and the code, red first.

## 2. From requirements to code

0. **Write the PRD first.** Each repository's product has a product requirements document, `docs/PRD.md`, public,
   approved by the owner before any spec. It holds: problem and users; goals and non-goals; numbered requirements,
   each with its reason and priority; release criteria; open questions. A requirement changes only by the owner.
1. **Write the spec.** A spec is a Markdown file in the repo's `spec/` folder, one per feature. It may open with a
   short conventions block for wording many statements share. Then it lists numbered statements (`TABLE-07`). Each
   statement is ONE observable behaviour, in one sentence a user or caller can see, using MUST or MUST NOT, with the
   reason and one example, or an example table when it is a rule over many cases (the test runs every row). A
   statement holding more than one behaviour is split. It says what happens, never how.
   Specs are written in our own words. The owner's own earlier work (code, tests, project set-up, workflows) may be
   ported instead of rebuilt where it fits; it enters like new work, through its tests first and every gate and scan,
   and loses every private name, host and path. Code from anyone else enters only through a library-first decision
   (section 8) and keeps its licence notice.
2. **Mark the unknown.** If we are not sure a behaviour is wanted, write an `OPEN:` line for the owner. It names the
   test layer its statement would use.
3. **Review the spec** before any test. The reviewer checks that each statement:
   - can be seen to pass and to fail from outside the code;
   - holds no implementation detail and conflicts with no other statement;
   - gives a reason.
4. **Write the acceptance test from the outside in.** The spec names one test layer per statement:
   - HTTP for an API; the public interface for a library;
   - a component test (simulated DOM) for what one component shows;
   - a component in a real browser for what needs an engine: sticky layout, CSP reports, focus, axe, time budgets.
     It runs in Chromium, Firefox and WebKit unless the statement names fewer and why;
   - a browser test for journeys across pages;
   - a static check for a code constraint (no raw-HTML path, no eval, design tokens only, no shipped CSS), run as a
     scan in the gate (section 10).

   Each test carries its statement's id and a hash of the statement text, as G6 defines it.
5. **Show it red for the right reason.** A script (`red-check`, G7) runs the new tests against the code before the
   change. They must fail on an assertion, not an import error.
6. **Work inward with TDD:** red, minimal green, refactor. Add a unit test only where the acceptance test cannot
   pin the logic down by itself; a unit test that repeats its proof is padding. One statement is one commit, holding its tests and its code, so no commit ever holds a
   failing test.
7. **Trace.** A check (`trace`, G6) reads the test results. Every statement must have a test that ran and passed, with
   one exception: a statement that no test names yet may be merged, and the check then lists it as *not yet tested*,
   never as a pass. An untested statement blocks the close of its milestone, and blocks 1.0 and every release after
   it; a release before 1.0 may ship while statements of open milestones are not yet tested, and its notes say how
   many. A protected statement (section 3) has no such exception.
   A skipped test, a test of a statement whose text has changed, or a test of no statement fails.
   It also checks the two-way table: every statement traces to a PRD requirement, and every "must" requirement has
   statements. Every spec header says `Field names: yes|no`; a missing header, or a `yes` spec that does not cite
   the owning field-name statement (section 3), fails.

## 3. Protected categories: identified data, de-identified data, audit

These are not negotiable, and only the owner changes them. Where a spec is derived from an existing system's
behaviour, every protection that system has becomes a statement here, or the owner records why not.

| Prefix | What its statements must cover |
|---|---|
| `TIER-` | Every route and query names its data tier. A caller without the identified-data role is refused. Tested for no credential, a malformed one, an expired one, a forged one, and the wrong role. |
| `DEID-` | Every field a de-identified request can name is checked by name against the de-identified schema before any database or index mapping. Each identified-only column, sent through every parameter (filter, group-by, breakdown, sort, export), is refused. Aggregates over identified data appear only where a statement allows them. |
| `AUD-` | Every read of identified or de-identified data writes one audit record (who, what, tier, when, outcome), and so does every refusal. Logs never hold an identifier, a value or a token (proven by a log-capture test). |
| `REF-` | The public repo holds no real identifier. Fixtures use only the reserved synthetic shape. |

- Every statement in these categories has a **negative test** that proves the refusal, not only the allowance. The
  trace check fails a protected statement without one.
- A **security review** happens at each spec with these prefixes (before its tests) and at each boundary step:
  route, query translation, export, log line. Its findings block. A finding is never LOW unless it is shown to have
  no realistic trigger.
- In these files every mutant must be killed; an equivalent mutant needs the owner's sign-off.

## 4. Coverage without padding

**Every change covers at least 95 % of its changed lines.** This is the only coverage rule. A changed file that is
missing from the coverage report counts as *could not check* (`diff-coverage`, G4).

Two checks keep the tests honest:
- **"Can this test fail?"** For each new test the author names the one-line break that turns it red. The reviewer
  rejects a test that:
  - asserts only that nothing crashed, or asserts a value it wrote itself;
  - mocks the thing under test;
  - depends on time, order or network;
  - repeats another test's proof.

  A test with no assertion fails the lint step.
- **Mutation testing at step boundaries.** Before a step goes to review, the step's diff is mutated, and a
  surviving mutant fails the step (`mutation`, G8).
  Why step boundaries and not each statement: the step diff holds every line its statements changed, so the same
  mutants run, against the code as it will merge rather than intermediate code a later statement rewrites.
  - Rust (cargo-mutants) can gate on a diff today.
  - TypeScript (StrykerJS) gates only through our wrapper. Frontend: StrykerJS gates .ts, .svelte.ts and .svelte
    through the wrapper with break 100. A gated file with 0 mutants is could-not-check unless exempted with a reason;
    allowEmpty is refused. Logic stays in .ts/.svelte.ts; every markup expression has a component test that kills its
    mutants.
  - Python (mutmut), if chosen for the server, is report-only until our wrapper is proven to fail on a planted survivor.

  An equivalent mutant carries its reason on the same line. Component tests are inside mutation scope. Real-browser
  tests (components and journeys) and static checks are outside it; each is still proven able to fail: `red-check`
  shows it red before the change, and its named break is applied once at review to turn it red.

## 5. KISS and DRY as checks

| Check | The reviewer asks | Fails when |
|---|---|---|
| Second caller | Where is the second real caller of this interface, base class, factory or generic parameter? | It has one. A component repo's public interface is exempt (the section 7 threshold wins there); its internals are not. |
| Requested setting | Which spec statement asks for this option? | None does |
| Complexity | Does it pass the linter's complexity limit (ruff `C901`, ESLint `complexity`, clippy `cognitive_complexity`)? | It is over the limit with no recorded reason |
| Smaller diff | Could the same statements pass with fewer lines or moving parts? | The reviewer shows a smaller way |
| New dependency | Is there a library-first page (section 8)? | There is none |
| Duplication | Does copy detection on changed files (e.g. jscpd) find a repeat? | A new block repeats an existing one |
| One source | Is each fact (design tokens, settings list, route list) stated once and derived elsewhere? | A fact is copied by hand |

DRY covers code and facts, not test readability: a test may repeat its setup so it reads on its own. A shared piece is
extracted in the change that creates the second copy, not before.

## 6. No check may fail open

Every check runs behind a small wrapper (G1). The wrapper:
- must find a planted canary;
- proves it scanned something;
- separates a finding from a crash and from "could not check".

"Could not check" blocks like a finding and is never shown as a pass. Each wrapper has tests that show it refusing.

## 7. Component repositories

- **A thing becomes its own repo** when:
  - its interface needs none of the application's concepts (record types, roles, data tiers, app settings);
  - it has its own spec, and its tests run without the app;
  - it is more than a helper.

  Until then it lives in a folder of its consumer, with a check that it imports nothing else from there.
- **Example: SvelteDT**, the table component. Its repo is `sveltedt`; its npm package is `@hniedner/sveltedt`,
  because npm refused the bare name as too similar to an existing package.
- **Versions follow semver.** `0.x` while the interface settles, `1.0.0` once the application ships on it. A breaking
  change is a major version with an upgrade note. The changelog is generated from commit messages, and each release
  is a tag.
- **During development** the application uses a local checkout of the component:
  - pnpm `workspace:` *(fetched, pnpm.io)*;
  - for a Python server, a uv editable path source *(fetched, docs.astral.sh)*;
  - a Cargo path dependency.

  Main and every release use a published version, and `release-links` (G5) refuses a release that still has a
  local link.
- A Rust component ships prebuilt packages, so no consumer needs Rust installed.

## 8. Library first: the one-page evaluation

Before building anything reusable, fill this in as `docs/decisions/NNN-<need>.md`. Every plan also states a reuse
check: what the owner's earlier work already holds for the step, whether it is taken, and why or why not.

```
Need:         the spec statement ids it must satisfy
Constraints:  runtime, our licence, content-security policy, accessibility level, size budget
Candidates:   two or more existing libraries, the owner's earlier work where it has one, plus "build it ourselves"; for each, docs URL fetched on <date>, version, and:
  Licence        OSI-approved, compatible with ours, no commercial-only parts
  Maintenance    last release, releases in 12 months, maintainers, open security issues, response time
  Size           install or bundle size (min+gz), number of transitive dependencies
  Accessibility  what it claims, and what our automated check measured on a probe
  Security       advisory history (OSV, GitHub advisories), time to fix, OpenSSF Scorecard if any
  Fit            per statement id: met / met with glue / not met
  Exit cost      what replacing it later would touch
Decision:     one choice, the reason, and the trigger that reopens it
```

A probe counts as evidence; a README claim does not. The server language is chosen the same way, on its merits; if
it is Python, version 3.14 (3.15 only for a tangible, recorded benefit). Tool names in this method are examples per
language.

## 9. Public repositories

- **Only synthetic data.** Fixtures come from a seeded generator and use a reserved identifier shape that a check
  enforces, including on contributed pull requests (G11).
- **Every push is scanned first.**
  - A secret scan runs before the push and again in CI (`scan-secrets`, G2).
  - A private word list kept outside the repo is checked before the push only (`scan-words`, G3). It holds names,
    hosts and former project names, and it is never put into CI.
- **No back-references** to any system a spec was derived from, or to any organisation: no links, names, ticket numbers or hosts.
  A decision record may name a public source it ports from.
  Commits use the address the owner chose for the project; no other personal, employer or institutional address appears.
- **A pushed leak counts as published.** Rotate the secret, because rewriting history does not recall forks or caches.
- **The supply chain is locked down** (G11):
  - lockfiles and frozen installs;
  - dependency review on every pull request;
  - a `SECURITY.md` with private vulnerability reporting;
  - actions pinned by commit SHA;
  - approval for every outside contributor's workflow run.

## 10. Gates and review

- **The local gate runs first.** One command per repo runs formatting, lint, types, all tests, coverage and trace,
  then mutation at step boundaries, then the secret scan (G9).
- **Hooks are installed by a setup step, and the gate checks they are in place** (G9).
- **The gate record cannot be forged by the person it gates.** The record that counts is CI's `gate` check, which
  GitHub writes and the main ruleset requires (G9, G13).
- **CI is on in every repo and uses Actions and Dependabot fully** (owner, 2026-11-17 11:06; G10, G11). Its `gate`
  check is required on main from the first workflow on; the local gate still runs before every push. Standard runners
  are free on public repos *(fetched, docs.github.com/en/actions/reference/runners/github-hosted-runners)*; larger
  runners are billed and not used. Every repo is set up by one fail-closed script, `repo-setup`, with read-back (G13).
- **Every change is reviewed against this method** before merge. A finding gives its severity by impact, the rule it
  rests on and a realistic trigger. Pull requests merge with a merge commit. Nothing merges automatically: Dependabot
  opens grouped pull requests, the `gate` check runs, and a reviewed merge follows (reviewer ruling 2026-11-17; the owner
  may overturn it). The main ruleset binds admins too; it needs 0 approvals while the owner is the only maintainer and
  1 from the day a second maintainer exists (G13).
- **Each repo has its own issues and milestones.** A statement is tracked in the repo that holds its spec; there is
  no shared tracker and no cross-repo numbering. A cross-repo dependency is one linked issue in each repo.

## 11. Rust only where it is an advantage

Use Rust for one of these only, recorded as a decision with its evidence:
1. **A measured hot path:** a profiler shows a CPU-bound function causing a missed response time, and a Rust probe
   beats the best plain version by a recorded factor.
2. **Untrusted input at a trust boundary**, such as uploaded files. TypeScript and a garbage-collected server language are already memory-safe, so
   the gain is over native C libraries, plus strict types and fuzzing.
3. **One parser or exporter shared by server and browser** through WASM. Use wasm-bindgen directly: wasm-pack was
   archived with its organisation in 2025 *(fetched, blog.rust-lang.org)*.

Not Rust: request handling, database or network glue, UI, I/O-bound work, or code the reviewers cannot read. Every Rust
repo adds a toolchain, a build matrix and download size.

## 12. Cost

Plan with **60-120 minutes of wall time per spec statement**, about 70 % of it review and mutation. This figure is
inferred, not measured. From the first slice on, a ledger records each statement's start (spec reviewed) and end
(merged). After ten statements, their median and range replace the figure. A statement that costs more than twice
the median is raised for review.
Cost is measured to plan and to spot work that has gone wrong, never to skip a check or accept a weaker design.
First data point (2026-11-17): the first component spec, 69 statements, prices at 69-138 hours by this figure and
at 8-11 plan-days by its library-first evaluation. Both figures stay until the ledger measures.

## 13. Standing rules

Report only what a command proved. A change that would reverse an earlier decision goes to the owner first. A rule
the work keeps fighting is raised with the owner, never bent silently.

## Change log

| Date | Change | Reason |
|---|---|---|
| 2026-11-17 | REV 1: protected categories, no-fail-open wrappers, mutation at step boundaries, supply chain, gate record, cost; detail moved to the gates file | Adversarial pass, all findings accepted by the reviewer |
| 2026-11-17 | Two test layers (component in a real browser; static check), example tables, one behaviour per statement, conventions block, layer on OPEN items, browser-test failure proof, first cost data point | Gaps found by the first spec written under the method (reviewer) |
| 2026-11-17 | Repo-specific issues and milestones; server language evaluated on its merits (Python 3.14 if chosen), Python-only tools marked as examples | Owner 10:57 (relayed by the reviewer) |
| 2026-11-17 | Quality-first principle; cost only plans; unit-test rule reworded from cost to proof; quality argument for mutation at step boundaries | Owner 10:58: quality, not speed (relayed by the reviewer) |
| 2026-11-17 | Step 0: an owner-approved PRD per product before any spec; two-way PRD-statement trace | Owner 11:0x: "craft the PRD first then do the coding" (relayed by the reviewer) |
| 2026-11-17 | CI on in every repo, required on main from the first workflow; full use of Actions and Dependabot (G10, G11); repo setup checklist (G13) | Owner 11:06: CI on, full use of Actions and Dependabot (relayed by the reviewer) |
| 2026-11-17 | Trace check reads each spec's `Field names` header (check detail inside the section 3 rule) | Reviewer, under section 3 |
| 2026-11-17 | No auto-merge; approvals 0 while sole maintainer, 1 with a second; CodeQL default setup, extended suite | Reviewer rulings on the CI edit |
| 2026-11-17 | Frontend mutation rule: .ts, .svelte.ts and .svelte gated, 0 mutants = could-not-check, allowEmpty refused, logic out of markup | Reviewer, from the probe |
| 2026-11-17 | Public edition: file names and wording made generic (sections 2, 3, 9; companion headers and G12 row); no rule changed | Public-repo hygiene, method §9 |
| 2026-11-17 | npm package name `@hniedner/sveltedt` (section 7; companion G10 and G12) | npm refused the bare name; owner decision |
| 2026-11-17 | Companion G10: CodeQL merge protection does not cover Dependabot pull requests analysed by default setup; default setup does not scan pull requests from forks; it does scan other pull requests | Fact correction, read from docs.github.com 2026-11-17 |
| 2026-11-17 | Reuse: the owner's own earlier work (code, tests, set-up, workflows) is ported through the method instead of rebuilt where it fits; third-party code only through section 8; every plan states a reuse check; a decision record may name a public source (sections 2, 8, 9; companion G12) | Owner decision, 2026-11-17 |
| 2026-11-17 | Step 7 and G6: a statement may be merged before its test and is listed as *not yet tested*, never as a pass; it blocks the milestone close, 1.0 and every later release | Owner's decision, 2026-11-17 |
