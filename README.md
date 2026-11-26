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

- the read-only table: rows in the order given, text or snippet cells, a caption and a labelled region; every
  function and snippet it calls for a row or a cell takes one object (`value({ row })`, `getRowId({ row })`, a
  `cell` snippet's `{ row, column }`);
- the wide table: the region scrolls sideways when the table is wider than it, and only then is a Tab stop, so the
  arrow keys scroll it once it has focus; its focus indicator is the browser's own ring, the caption is hidden visually
  and still names the table, hovering or focusing shows nothing new, and Tab follows the reading order (heading
  controls, actions, the region, then the cells row by row). Proved in Chromium, Firefox and WebKit on the test site's
  table page (`/table.html`). axe finds no serious or critical violation in the loading, failed, empty, ready, busy,
  focused-region and invalid-input states, there and on `/table-plain.html` (the package stylesheet, the site's layout
  rules and no token), whose focus ring also shows; axe's incomplete (undecidable) items are left to manual review.
  Mounting, new rows, state changes and unmounting leave the window where it was (observed for two frames).
  Limits: "loading" is read at whatever moment the real clock gives (A11Y-25 owns its sub-states); a focused region that
  stops overflowing loses its Tab stop and focus is not moved (not tested); the stop follows widths, not the
  stylesheet (without the package stylesheet the region is no scroll container, yet a table wider than it still makes
  it a stop); a height cap on the region is not supported (the region
  would scroll vertically without a stop); without `ResizeObserver` (a jsdom test) the region is never a stop;
- the alert for invalid input (an empty caption, missing or duplicate column ids and labels, columns, or rows while
  ready, that are not a list, empty, duplicate or unreadable row ids), shown instead of a wrong table;
- row ids that are strings or finite numbers, as server JSON gives them;
- the loading, failed and busy states: the loading text in a status element, the failure in an alert, `aria-busy`
  on the table, the rows kept while busy, and the row count in a polite live region, its digits grouped the
  English way ("1,000") whatever the runtime's locale;
- the stopped state: `status="stopped"` shows "Loading stopped" in one cell where the rows would be, with the header
  kept and no empty message, as plain text and not as an alert;
- slow loads: after 1 second of loading or busy the table adds a progress indicator element, hidden from assistive
  technology and kept at least 500 ms, drawn as a bar along the foot of the status line that pulses (grows from its
  centre once a second) for 5 seconds and then rests full (it rests from the start under `prefers-reduced-motion`), and
  after 5 more seconds the status element also says "Still loading", added once for screen readers. From the first load
  or refetch until it unmounts the table keeps a status line above the region. Once that line has appeared, the
  indicator, "Still loading" and "Cancel" can appear and go, and a load that ends in a ready answer can take them away,
  without moving the table. A table that never loads has no status line; any other table moves down once, by at most the
  height of that line, when its first load or refetch starts (measured for a table mounted ready; for one mounted in
  another state the move is that line less what it replaces, not browser-proved). A load that ends in failure adds a
  line: the failed notice, an element with `role="alert"`, sits between the status line and the region. Limits: the
  words and "Cancel" sit on one line while they fit, and "Cancel" wraps in a line too narrow for both; an application
  style that makes "Cancel" taller than the line moves the table; a second press at the same spot, made right after the
  press that starts the first load or refetch, lands on what is now one line above the control it aimed at, because that
  control moved down. Proved in Chromium, Firefox and WebKit on the test site's slow-load page, except the last limit
  and the move of a table mounted in another state;
- the two buttons of a slow load: with `oncancel` a "Cancel" button after the status element while "Still loading"
  shows, and with `onretry` a "Try again" button after the stopped or failed table, never beside the invalid-input
  alert; a press calls its callback once with no argument, ignores what it returns, and changes nothing on screen
  by itself (a double press calls it twice); the status element also says "Loading stopped" once when `status` becomes
  `stopped`. When new props remove a focused "Cancel" or "Try again", focus moves to the table without scrolling
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
- the global search field, shown while `onsearch` is given and the alert is not showing, after the `actions` snippet
  and before the filter badges and the `panels` snippet. It emits through `onsearch` after the `searchDelay` pause, at
  once on Enter, or on Enter only with `searchOnEnter`, and then says "Press Enter to apply."; the text emitted has no
  leading or trailing white space, while the field keeps what was typed. A text that, trimmed, holds a control
  character or is longer than `maxLength` (255 by default, counted in code points, not bytes) is not emitted: the
  field is marked invalid, with a message of its own for each condition. It shows the applied `search`, and keeps newer typing when `search` changes.
  An application that wants another field leaves out `onsearch` and renders its own, and then has neither the pause,
  the trimming, the refusal nor the newer-typing rule. Limits: an application that applies `search` only after the
  answer arrives should still pass the new text at once, as the connection helper does; Enter inside the
  application's own `<form>` submits that form; Enter that confirms an IME composition applies the search;
- the filter controls, driven by the application's `filters`: a button "Filter <label>" in the header cell of each
  filtered column, which opens the column's filter dialog, a popover named "<label> filter". A text filter's field in
  it emits through `onfilter` by the search field's rules (the pause, at once on Enter, on Enter only with
  `searchOnEnter`, outer white space trimmed and the typed text kept; proved in Chromium, Firefox and WebKit on the
  test site's filter dialog page). Text typed and not yet sent, within the pause, is dropped when the dialog closes. The
  Escape behaviour of the filter field is not settled yet: with the search field's `type="search"`, Chromium and Firefox
  clear the field on Escape, and WebKit closes the dialog. A clearable badge for each applied filter, "Clear column
  filters", "Reset table" (while `onreset` is given) and the application's own `criteria` snippet, every header cell
  named by its column label alone (proved in Chromium, Firefox and WebKit on the test site's filter page), and an
  invalid filter,
  `search`, `searchDelay` or `maxLength` prop gets the alert;
- the `panels` snippet, for the application's own panels (an advanced search, batch actions) that a button in its
  `actions` snippet opens: rendered after the toolbar's controls and before the status line, in every state, the
  invalid-input alert's included, with its elements kept when the state changes (proved by component tests). A block
  in it is as wide as the region (proved in Chromium, Firefox and WebKit on the test site's table page). The table
  keeps no open state and adds no toggle: the application decides when a panel shows, and gives its button
  `aria-expanded` and `aria-controls` (the WAI-ARIA disclosure pattern). Limits: inline content sits on the toolbar's
  line, so wrap a panel in a block element; opening or closing a panel moves the status line and the table, as any
  content above them does; with a panel open, Tab reaches "Cancel" only after the panel's controls; the table moves no
  focus when a panel opens or closes (see "A button that opens a panel" below);
- the connection helper, exported as `@hniedner/sveltedt/connection`: `createConnection` sends the first request through
  the application's `send({ request, signal })`, maps the answer to rows and totals, and changes page through
  `pager.onpage` with the rows kept while busy. An answer it cannot map (its message names the check that failed), an
  answer with a truthy `error` (the server's text counts), and a `send` that rejects, throws or returns no promise each
  show the failed state and reach `onerror` once, and no server text is shown. An answer's failure carries `code`, a
  string or `null` (the answer's `error_code` when it is a string); a rejection is your `send`'s own error, passed as it
  is; if your transport's errors carry a string `code` (axios does), tell them apart in `send`. To show your own text
  for a code, pass it as `messages.failed` of `DataTable`. The answer or rejection of a superseded request, or of one
  running at unmount, is dropped, and its signal is aborted. Its sort intent (`table.onsort`) and page-size intent
  (`pager.onsize`) each set the query at once and send one request; so do its filter intents (`table.onfilter`,
  `onclearfilter`, `onclearfilters`) and its search intent (`table.onsearch`), and each of these filter and search
  intents returns to the first page (the page-size intent keeps the page of the first row shown): a text filter and
  the search go out as given, a categorical filter as an anchored alternation of its escaped values with `regex=true`
  (a server that ignores `regex` and matches by substring finds no row), `query.filters` and `query.search` give the
  starting filters and search and are read back as `table.filters` and `table.search`, and `table.onsearch` is the
  `onsearch` of `DataTable`; `reload()` sends the current query again, the
  page included; each column map entry can say `searchable` and `orderable`; the request goes out in the bracketed
  form by default, dotted with `form: "dotted"`, or as the plain object with `form: "json"`; and a sort or filter on a
  column id no map entry serves sends nothing and is reported once through `onerror`. Its tests use answers written by
  hand.
  The test site's connection page (`/connection.html`) loads its orders through it from the site's own route
  `/api/orders`, pages them with `Pagination`, sorts them by the Order column and changes the page size, proved in
  Chromium, Firefox and WebKit.

Not yet: the categorical filter's options, the filter dialog's focus, closing and placement (the dialog shows at the
window's top-left corner on a page with Tailwind's base styles, centred without them, with no frame of its own), column
features, selection, the rest of the connection helper
(reset; cancel and retry) and the published package. The order is in the
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
site's route `/api/orders` through the connection helper, or <http://127.0.0.1:4173/panels.html> for a button that opens
a panel. The site listens on that address only and sends the strict content-security policy (`default-src 'self';
script-src 'self'; style-src 'self'`) with every answer.

The browser tests open the built site in Chromium, Firefox and WebKit (stop `pnpm site:serve` first: they start the
server on that address themselves; on Linux, `pnpm exec playwright install --with-deps` also installs the system
libraries):

```sh
pnpm exec playwright install
pnpm site:build
node scripts/check-repo.ts browser
```

## A button that opens a panel

The table keeps no open state for its `panels` snippet and moves no focus for it: the application does both. The
test site's panels page (`/panels.html`, its source in [site/src/PanelsPage.svelte](site/src/PanelsPage.svelte)) shows
one way, proved by keyboard in Chromium, Firefox and WebKit (`spec/site.md`, section 9):

- the button in the `actions` snippet is a plain `<button type="button">` with `aria-expanded` (`"true"` while the
  panel shows) and `aria-controls` naming the panel's `id`, as the WAI-ARIA disclosure pattern describes; Enter and
  Space press it, and focus stays on it;
- the panel in the `panels` snippet is a block element, so it takes the table's width, and it stays in the document
  with the `hidden` attribute while closed, so `aria-controls` always names an element;
- a control inside the panel that closes it moves focus back to the button: without it, focus does not return to the
  button, and where it goes differs by browser.

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
