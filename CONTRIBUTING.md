# Contributing to SvelteDT

Thank you for your interest. The project is pre-release and holds no component code yet. Every change follows
[the engineering method](docs/engineering/method.md); [the companion](docs/engineering/gates.md) says how each check
works. This page is the short version.

## The gate

One command runs every check that exists today:

```sh
node scripts/check-repo.ts all
```

It needs Node (the version in `.node-version`), actionlint (the version in `scripts/actionlint.version`), shellcheck
(actionlint uses it to check shell in workflow steps), and gitleaks (the version in `scripts/gitleaks.version`). Each
check ends with one line: `PASS`, `FINDING` or `COULD NOT CHECK`. "Could not check" blocks exactly like a finding
(method section 6). CI runs the same command; its `gate` check is required on `main`.

CI also scans every pull request's commits, and every push to `main`, for secrets:

```sh
node scripts/scan-secrets.ts git . <base>..<head>
```

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

- the local hooks that run checks before a commit or a push; until they exist, maintainers run the secret scan and
  the private word scan by hand before every push;
- formatting, lint, type and duplication checks, `trace`, `red-check`, `diff-coverage`, `mutation` and
  `release-links` (they arrive with the first code that needs them).

## Known limits of the merge rules

- CodeQL merge protection does not apply to Dependabot pull requests analysed by CodeQL default setup.
- CodeQL default setup does not scan pull requests from forks.

Both are GitHub's documented behaviour (see the companion, G10). Review covers them.
