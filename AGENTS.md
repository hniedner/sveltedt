# Notes for coding agents

SvelteDT is a data table component for Svelte 5 with Tailwind 4, built statement by statement: the component in
`src/lib/`, a test site that uses it in `site/`.

- **The rules:** [the engineering method](docs/engineering/method.md) binds every change; [the companion](docs/engineering/gates.md)
  says how each check works. Read them before planning a change.
- **The gate:** `node scripts/check-repo.ts all`. Report its last line as it is; `COULD NOT CHECK` is not a pass.
- **The package name** will be `@hniedner/sveltedt` (npm refused the bare name).
- **Order of work:** product requirements ([docs/PRD.md](docs/PRD.md), approved), then specs (`spec/`; a test marks
  its statement with `// @spec("ID", "hash")`, gates.md G6), then tests, then code (method section 2). Do not build
  what no requirement asks for.
- **Commits:** one statement per commit with its tests; never a failing test in a commit; never skip a hook; merge
  commits only (method sections 2 and 10).
- **Public repository:** synthetic data only; no secret, private name, host or path in any file or commit
  (method section 9).
- **Contributing:** see [CONTRIBUTING.md](CONTRIBUTING.md).
