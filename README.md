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
  on the table, the rows kept while busy, and the row count in a polite live region, its digits grouped the
  English way ("1,000") whatever the runtime's locale;
- the stopped state: `status="stopped"` shows "Loading stopped" in one cell where the rows would be, with the header
  kept and no empty message, as plain text and not as an alert;
- slow loads: after 1 second of loading or busy the table adds a progress indicator element, hidden from assistive
  technology and kept at least 500 ms (its look and motion come later), and after 5 more seconds the status element
  also says "Still loading", added once for screen readers; until the stylesheet reserves the line, that text can
  move the table down by one line;
- the two buttons of a slow load: with `oncancel` a "Cancel" button after the status element while "Still loading"
  shows, and with `onretry` a "Try again" button after the stopped or failed table, never beside the invalid-input
  alert; a press calls its callback once with no argument, ignores what it returns, and changes nothing on screen
  by itself (a double press calls it twice); the status element also says "Loading stopped" once when `status` becomes
  `stopped`. Until the stylesheet is done, "Cancel" can add a second line of shift at 6 seconds and "Loading stopped"
  shows twice. When new props remove a focused "Cancel" or "Try again", focus moves to the table without scrolling
  (proved in Chromium, Firefox and WebKit on the test site's slow-load page), and the table can take focus only until
  focus leaves it. If the window loses focus right after the move, for example when the user switches window, the table
  gives up that focus while it is still the active element and focus lands on the page body. With invalid input there is
  no table, so a focused button that goes then leaves focus on the page body;
- every fixed word as a `messages` prop with an English default;
- sort by column header: a click emits the next whole order through `onsort`, Shift+click adds a column, the
  table shows the order it is given (`aria-sort` on the lead column, a hidden direction mark and rank, a button named
  by its label and described, and a hidden sentence in the caption that says the headers are buttons), and invalid
  sort input gets the alert; the test site's list page sorts its Order column;
- sort by keyboard: Enter and Space press the focused sort button, Shift+Enter and Shift+Space add a column, and
  focus stays on the button while the new order loads, proved in Chromium, Firefox and WebKit on the test site's
  sort page (`/sort.html`) with an axe check of the sort controls;
- the pager core, a separate `Pagination` component: a labelled `nav` with step buttons and at most seven page
  places (gaps hidden from assistive technology), `aria-current` on the current page, steps that cannot move
  marked `aria-disabled`, a press emitting the page's offset through `onpage`, an optional page-size select
  emitting through `onsize`, and the alert for invalid input. The test site's list page pages its rows with it;
- the pager's information line ("Showing 1 to 10 of 57 rows", with "(filtered from 1,000 total rows)" when an
  unfiltered total is given and differs), plain text between the page-size select and the step buttons and not
  announced, and every fixed word of the pager as a `messages` prop with an English default;
- the connection helper, first part, exported as `@hniedner/sveltedt/connection`: `createConnection` sends the first
  request through the application's `send`, maps the answer to rows and totals, reports an answer it cannot map once
  through `onerror`, and changes page through `pager.onpage` with the rows kept while busy. Its tests use answers
  written by hand. The test site's connection page (`/connection.html`) loads its orders through it from the site's own
  route `/api/orders` and pages them with `Pagination`, proved in Chromium, Firefox and WebKit. It does not yet handle a
  `send` that rejects or throws, a superseded request (a stale answer of an earlier request), an answer that arrives
  after unmount, or the `error` field of an answer.

Not yet: search, filters, column features, selection, the rest of the connection helper (sort, filter
and search intents; `reload()`; the dotted and JSON forms; cancel and retry; a `send` that rejects or throws, or an
answer whose properties throw when read, after which the table stays loading, or shows the old rows with the new
page, and `onerror` is not called; a sort id no column serves, which the helper throws at mount, until a refused sort
is reported through `onerror`) and the published package. The order is in the
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

Then open <http://127.0.0.1:4173>, or <http://127.0.0.1:4173/connection.html> for the page whose rows come from the
site's route `/api/orders` through the connection helper. The site listens on that address only and sends the strict
content-security policy (`default-src 'self'; script-src 'self'; style-src 'self'`) with every answer.

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

MIT: see [LICENSE](LICENSE); third-party notices are in [NOTICE](NOTICE).
