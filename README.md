# SvelteDT

[![CI](https://github.com/hniedner/sveltedt/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/hniedner/sveltedt/actions/workflows/ci.yml?query=branch%3Amain)
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
- the alert for invalid input (an empty caption, missing or duplicate column ids and labels, columns, or rows while
  ready, that are not a list, empty, duplicate or unreadable row ids), shown instead of a wrong table;
- row ids that are strings or finite numbers, as server JSON gives them;
- the loading, failed and busy states: the loading text in a status element, the failure in an alert, `aria-busy`
  on the table, the rows kept while busy, and the row count in a polite live region;
- every fixed word as a `messages` prop with an English default;
- sort by column header: a click emits the next whole order through `onsort`, Shift+click adds a column, the
  table shows the order it is given (`aria-sort` on the lead column, a hidden direction mark and rank, a described
  button), and invalid sort input gets the alert; the test site's list page sorts its Order column;
- sort by keyboard: Enter and Space press the focused sort button, Shift+Enter and Shift+Space add a column, and
  focus stays on the button while the new order loads, proved in Chromium, Firefox and WebKit on the test site's
  sort page (`/sort.html`) with an axe check of the sort controls;
- the pager core, a separate `Pagination` component: a labelled `nav` with step buttons and at most seven page
  places (gaps hidden from assistive technology), `aria-current` on the current page, steps that cannot move
  marked `aria-disabled`, a press emitting the page's offset through `onpage`, an optional page-size select
  emitting through `onsize`, and the alert for invalid input. It is not yet on the test site;
- the pager's information line ("Showing 1 to 10 of 57 rows", with "(filtered from 1,000 total rows)" when an
  unfiltered total is given and differs), plain text between the page-size select and the step buttons and not
  announced, and every fixed word of the pager as a `messages` prop with an English default.

Not yet: search,
filters, column features,
selection, the connection helper and the published package. The order is in the
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

Then open <http://127.0.0.1:4173>. The site listens on that address only and sends the strict content-security
policy (`default-src 'self'; script-src 'self'; style-src 'self'`) with every answer.

The browser tests open the built site in Chromium, Firefox and WebKit (stop `pnpm site:serve` first: they start the
server on that address themselves; on Linux, `pnpm exec playwright install --with-deps` also installs the system
libraries):

```sh
pnpm exec playwright install
pnpm site:build
node scripts/check-repo.ts browser
```

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
