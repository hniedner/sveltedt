# SvelteDT

[![ci](https://github.com/hniedner/sveltedt/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/hniedner/sveltedt/actions/workflows/ci.yml?query=branch%3Amain)
[![CodeQL](https://github.com/hniedner/sveltedt/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/hniedner/sveltedt/actions/workflows/github-code-scanning/codeql)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/hniedner/sveltedt/badge)](https://scorecard.dev/viewer/?uri=github.com/hniedner/sveltedt)
[![licence](https://img.shields.io/github/license/hniedner/sveltedt)](LICENSE)
[![tested with Svelte](https://img.shields.io/github/package-json/dependency-version/hniedner/sveltedt/dev/svelte?label=tested%20with%20Svelte)](package.json)
[![TypeScript](https://img.shields.io/github/package-json/dependency-version/hniedner/sveltedt/dev/typescript?label=TypeScript)](package.json)

A data table for Svelte 5, inspired by DataTables, built to be accessible and usable under a strict content-security
policy.

SvelteDT brings the utility of DataTables (datatables.net) to Svelte 5: a data table for server-side and client-side
data, built idiomatically for Svelte with components, props, callbacks and snippets rather than as an imitation of
DataTables' JavaScript API. It is styled by one stylesheet and prefixed tokens that work with any CSS approach, Tailwind
4 included. Two adoption paths are first-class: a new project, and a project migrating from DataTables, which keeps its
server-side backend working through a connection helper and maps its options with a migration guide. SvelteDT is an
independent project, not affiliated with or endorsed by DataTables.

## Status: pre-release

There is nothing to install yet. What is on `main` today:

- the read-only table: rows in the order given, text or snippet cells, a caption and a labelled region;
- the alert for invalid input (an empty caption, missing or duplicate column ids and labels, empty, duplicate or
  unreadable row ids), shown instead of a wrong table;
- row ids that are strings or finite numbers, as server JSON gives them.

Not yet: the loading, failed and busy states, sort, the pager, search, filters, column features, selection, the
connection helper and the published package. The order is in the
[milestones](https://github.com/hniedner/sveltedt/milestones).

The install steps arrive with the package files and the consumer project that installs them
([spec/package.md](spec/package.md)). Until then the badges above show the Svelte and TypeScript versions the tests run
with; once the package states its supported peer range, the badges will show that range instead. The npm package will
be `@hniedner/sveltedt` (npm refused the bare name `sveltedt` as too similar to an existing package).

## See it running

The test site shows the table on a list page of synthetic orders. With Node (the major version in `.node-version`)
and pnpm (the version in `package.json`'s `packageManager`):

```sh
pnpm install --frozen-lockfile
pnpm site:build
pnpm site:serve
```

Then open <http://127.0.0.1:4173>. The site listens on that address only.

## Documents

- What it must do: [the product requirements](docs/PRD.md), and where it departs from DataTables and why:
  [departures](docs/departures.md).
- What each part does, sentence by sentence: [the component spec](spec/table.md).
- How it is built: [the engineering method](docs/engineering/method.md) and
  [how each check works](docs/engineering/gates.md).

## Contributing and security

Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md), which also sets up the checks (`pnpm gate`). Report a
vulnerability privately as [SECURITY.md](SECURITY.md) says.

## Licence

Apache-2.0: see [LICENSE](LICENSE) and [NOTICE](NOTICE).
