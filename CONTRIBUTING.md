# Contributing to SvelteDT

Thank you for your interest. The project is pre-release and holds no component code yet. Every change follows
[the engineering method](docs/engineering/method.md); [the companion](docs/engineering/gates.md) says how each check
works. This page is the short version.

## The gate

One command runs every check that exists today, in order, stopping at the first finding or could-not-check:

```sh
pnpm install --frozen-lockfile
pnpm gate
```

It needs Node (the major version in `.node-version`), pnpm (the version in `package.json`'s `packageManager`),
and the pinned programs the checks run: actionlint with shellcheck, zizmor and gitleaks (each version in
`scripts/<name>.version`). On macOS: `brew install actionlint shellcheck zizmor gitleaks`; on Linux, the release
archives that `.github/workflows/ci.yml` installs, checked against the sha256 lines in `scripts/<name>.version`, and shellcheck from
the package manager (CI uses the runner's copy). Any other version than the pin, older or newer, makes the gate
answer `COULD NOT CHECK` until the pin moves; Prettier, ESLint, TypeScript and jscpd are pinned by `package.json`.
The gate reads tracked files: a new file counts once it is added with `git add`.

Each check ends with one line: `PASS`, `FINDING`, `COULD NOT CHECK`, or `NOT APPLICABLE` when there is nothing of
its kind to check (such as no commit after `origin/main`). "Could not check" blocks exactly like a finding (method
section 6). CI runs the same command; its `gate` check is required on
`main`.

The checks today:

- **toolchain:** Node's major version, pnpm's version and the gitleaks version are the pinned ones.
- **files:** the required files are tracked; LICENSE, NOTICE and `.gitignore` hold what the project needs.
- **selftest:** every `scripts/*.test.ts` and `*.test.mjs` file runs and must pass, each with its own count.
- **lockfile:** one lockfile document; exact development versions; nothing that would ship except a `svelte` peer;
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
  browser API above the PRD-E1 floor, as far as eslint-plugin-compat knows it). The bans read names as written
  (with a dot, in brackets as a plain string, or bare) and plain string arguments. They do not catch a name built at
  run time or written as a template literal; a cast or non-null assertion on the object a ban reads
  (`(document as Document).write`, `iframe.contentDocument!.write`) or on an argument (`setAttribute("style" as
string, s)`); an alias under a name no ban reads (`const d = document; d.write`, `const { write } = document`);
  `setAttribute`, `createElement`, `createElementNS` or `execCommand` reached through `.call`, `.apply` or
  `Reflect.apply`; `Reflect.set`, `Object.defineProperty`, `setAttributeNS`, `setAttributeNode`; or a computed
  `svelte:element` `this`: review is the guard for these. The lint step also resolves the configuration for a path in `src/lib` and in
  `site/src` and blocks when a rule the canaries prove, or the settings, differ there from the canaries' (a later
  config block scoped to those folders would otherwise replace the bans unseen). The probe paths are one list,
  `CONFIG_PROBES` in `scripts/check-repo.ts`: a new top-level source folder (say `consumer/src/`) is not probed until
  it is added there. TypeScript
  type-checks the scripts, jscpd finds copied
  code outside tests and components. The three owner-approved texts (the method, its companion and the PRD) are never reformatted:
  they change only through their owner. Nor are the spec files (`spec/**/*.md`): their sentences are hashed from
  the raw source, so a formatter would turn every test stale.
- **svelte:** svelte-check type-checks every tracked `.svelte` component, strict, through `tsconfig.json`; a
  component outside its `include` blocks the gate, since svelte-check would skip it silently. With no component
  tracked the step is NOT APPLICABLE, after its planted error was found. It names `svelte.config.js` as the one
  config: otherwise svelte-check imports, and so runs, every `svelte.config.*` and `vite.config.*` below the root
  (gitignored folders such as `tmp/` too, not `node_modules` or dot-folders), and with no root config those above
  it (measured with svelte-check 4.7.8). A second Svelte or Vite config is not
  added; that file is edited.
- **pins, gate-needs, links, actionlint, workflows:** the workflow and documentation checks; zizmor looks for
  injection, dangerous triggers and over-broad permissions. It runs offline, so whether a pinned SHA belongs to its
  tag is not checked (docs/decisions/001-quality-tooling.md).
- **secrets:** gitleaks scans the branch's commits (after `origin/main` locally; the pull request's or the pushed
  range in CI).

Every tool step first runs on a planted violation (files in `scripts/canaries/`, or one the step builds) and must
find it, so a tool that silently checks nothing cannot pass.

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

- the commit-message check and the local hooks that run checks before a commit or a push (issue #6); until they exist, maintainers run the private word scan
  by hand before every push;
- the Svelte checks, `trace`, `red-check`, `diff-coverage`, `mutation` and `release-links` (they arrive with the
  first code that needs them).

## Known limits of the merge rules

- A pull request can change its own gate: the workflow and the scripts it runs come from the pull request. Review
  and code ownership cover it; a check that the gate job runs the gate unchanged is planned.
- Inline suppressions: the `text` step refuses `svelte-ignore`, `@ts-expect-error`, `@ts-nocheck`, `jscpd:ignore`
  and `prettier-ignore` in code; typescript-eslint's `ban-ts-comment` refuses `@ts-ignore` (its lint canary plants
  one); ESLint ignores its inline configuration (HTML comments in components included), gitleaks
  ignores its allow comments, and the scan refuses a folder holding a `.gitleaksignore`. A zizmor ignore comment in
  a workflow is not yet refused.

- CodeQL merge protection does not apply to Dependabot pull requests analysed by CodeQL default setup.
- CodeQL default setup does not scan pull requests from forks.

Both are GitHub's documented behaviour (see the companion, G10). Review covers them.
