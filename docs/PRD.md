# SvelteDT: product requirements

- **Product:** SvelteDT, an accessible data table for Svelte 5 and Tailwind 4, server-driven or client-side.
- **Status:** Approved by the owner on 2026-11-17, REV 7; amended by the owner the same day: releases are automatic
  (PRD-S7); the consumer project's type check replaces "Are the types wrong?" in PRD-K2 (owner's decision,
  2026-11-17), because the tool does not support a package that re-exports `.svelte` files (READ, its source and
  issue tracker); PRD-W8 names that check. A requirement changes only by the owner from here on.
  Order: PRD (approved) -> spec -> plan -> tests -> code. Order of work (owner): first perfect SvelteDT with its test
  site, only then move on; the first app starts on 1.0.
- **Date:** 2026-11-17.
- **Priority (owner, binding):** quality over speed: architecture and engineering quality, accessibility,
  correctness, a clean public interface, documentation. Effort is reported, never a reason to cut scope.
- **Settled (owner):** licence Apache-2.0, "Copyright 2026 R. Hannes Niedner"; npm package `@hniedner/sveltedt` (npm refuses the bare name `sveltedt` as too similar to `svelte`, MEASURED 2026-11-17; the bare name is the one the owner wants and asks npm support for later; if granted, it is published and the scoped package deprecated with a pointer; repo and brand are unchanged);
  repo `hniedner/sveltedt` (public, under a personal account: GitHub-hosted standard runners are free for public repos
  and draw on no organisation's minutes); CI on: GitHub Actions in full and every Dependabot option; releases through a
  CI workflow with npm provenance (PRD-S7 gives the one-time first-publish order and the break-glass).
- **Fact labels:** READ (a document read on 2026-11-17), MEASURED (a command or browser run on 2026-11-17, in an
  evaluation of candidate libraries or a mutation-testing probe done before this document), INFERRED (reasoning or estimate; to be checked before relying on it).

## 1. The problem and who has it

Developers of Svelte 5 + Tailwind 4 apps under a strict content-security policy need a data table whose sorting,
filtering and paging run on the server, or in the browser for a set of rows it holds, that keyboard and screen-reader
users can work, and that fits their policy and design system. Full grids bring their own markup, theme and grid
keyboard model; headless cores leave all markup, accessibility and policy work to the app. No candidate meets all of
this without a policy or weight cost (MEASURED, section 7).

- **Reference consumers:** SvelteDT's own test site and clean-install consumer project (PRD-W). They prove every claim
  the way a consumer would, before any app depends on the package.
- **First consumer:** the first app built on SvelteDT, starting on 1.0. It lists large server-side result sets.
- **Likely second consumer:** a second app of the owner's, on the same stack.
- **Anyone else** on Svelte 5 + Tailwind 4 with the same needs.

## 2. Goals and non-goals

**Vision.** SvelteDT brings the utility of DataTables (datatables.net) to Svelte 5. DataTables serves as the
inspiration and functional template for both server-side and client-side capabilities: its strengths are matched or
improved upon. An intentional departure is recorded with its reason in the migration guide (PRD-D8); one that is not a
platform constraint, an improvement, best practice or standards compliance remains the owner's decision (those decided
so far are the non-goals below).

Rather than imitating DataTables' imperative JavaScript API, SvelteDT is built idiomatically for Svelte using
components, props, callbacks, and snippets. It treats two adoption paths as first-class: starting a greenfield project,
or migrating away from DataTables by keeping existing server-side backends working via a connection helper (PRD-B20)
and mapping its options through a migration guide (PRD-D8).

**Goals.** One table component and one pager, fed by the application, the connection helper or the local data source,
that (1) render a page of rows exactly as their data source ordered it;
(2) report every user action as one event and keep only the internal state listed in PRD-B2; (3) meet WCAG 2.2 AA with
the WAI-ARIA APG *table* pattern, criterion by criterion (section 4.3); (4) work under the strict policy (section 4.4);
(5) take their look from prefixed tokens and stay usable without them; (6) have a small, typed, stable public interface
and complete public documentation; (7) prove all of this in CI, in three engines, through a test site whose pages stay very simple and a
consumer project that install the packed package.

**Non-goals (it will never do these):**
- A spreadsheet grid: no cell editing, no cell cursor, no roving focus, no `role="grid"`.
- App concepts: no records, users, roles, permissions, data tiers, settings, or criteria other than its own column
  filters (section 5.2).
- The component fetches nothing, retries nothing, handles no request-forgery tokens and caches no responses; it
  stores no preferences or selection and makes no export files, downloads or clipboard writes. The connection helper
  (PRD-B20) speaks the DataTables server-side protocol through the application's own transport.
- Raw-HTML rendering; shipped CSS; a theme API beyond tokens; bundled translations; app-specific Tailwind variants.
- Virtualisation; grouping, tree, pivot or aggregation rows.
- A client-side mode inside the component: the component never knows where its rows come from. Client-side
  processing is the local data source (PRD-B21), shipped beside it.

## 3. Users and scenarios

- **App developer.** Installs the package, adds the Tailwind `@source` line, optionally sets the tokens, passes rows,
  columns and state as props, and either sends each intent to its server, through the connection helper or its own
  code, or gives all rows to the local data source.
- **Developer leaving DataTables.** Keeps the server-side backend, connects it through the connection helper
  (PRD-B20), and maps options with the migration guide (PRD-D8).
- **Server implementer.** Maps intents to queries: offsets, direction words, the order list, filter shapes, what
  "reset" restores, and how to answer out of order. Needs PRD-D6.
- **End user, pointer, touch or keyboard.** Sorts by one or more columns, filters by text (applied on Enter) or by fixed
  options, clears filters, pages, picks a page size, shows, hides, moves and resizes columns, selects rows (a range
  with Shift). Focus stays where they acted while the next page loads.
- **End user with a screen reader, voice control, zoom, text spacing, high-contrast mode or a right-to-left
  language.** Does all of the above, hears loading, failure and the row count, keeps the screen reader's table commands.
- **Security reviewer.** Confirms no value becomes markup, nothing breaks the policy (client- or server-rendered),
  nothing is sent, stored or written outside the component, and the supply chain is locked.
- **Visitor of the public site.** Reads the documentation, opens an example, tries the live table, and reads the
  component code and the server handler behind it before installing (PRD-W10).
- **Contributor (public).** Clones, runs one gate command, and finds every rule in the repo (PRD-D7).
- **Maintainer.** Changes code safely: every requirement traced to tests, every check able to fail.

## 4. Requirements

Priority: **must** (in 1.0), **should** (in 1.0 unless the owner moves it), **later**.

**4.0 The rule for every check (stated once; everything below refers to it).** Every automated check reports exactly
one of *pass*, *fail* or *could not check*. *Could not check* blocks like *fail* and never shows as a pass; that
includes a check that cannot run, finds nothing to scan, or returns axe *incomplete* results. Where an engine or tool
cannot decide a criterion, the check does not run there; the criterion is assigned by name to a manual step instead,
and the release record holds that step's pass or fail. A manual step not recorded is *could not check*.

### 4.1 Behaviour (B)
| Id | Requirement | Reason | Priority |
|---|---|---|---|
| PRD-B1 | Rows render in exactly the given order; the table never sorts, filters or slices them. | The data source (a server, the connection helper or the local data source) pages by its own order. | must |
| PRD-B2 | Each user action emits exactly one callback, and the table shows only what its props say. Internal state is only: the open dialog and its trigger; unsent filter text and its error; whether the chooser is open; an active drag and its preview; the measured header height and sticky offsets, whether the header is sticky now (B14) and whether the region overflows; the text of the last column-move announcement; whether the progress indicator is shown, its delay timer, its minimum display time and whether it shows the still-loading text (B22); the focus target pending after any intent whose control can vanish (a cleared badge, "Clear column filters", "Next page" on the new last page). It resets on remount and is documented. | One source of truth; two emits are two requests that can race. | must |
| PRD-B3 | A column has a label and either a text value or the consumer's cell snippet; sort and filter controls appear only where configured. | Links and badges are the consumer's; a control that does nothing misleads. | must |
| PRD-B4 | Multi-column sort: a press emits the whole next order; Shift adds or advances a column; single-direction columns are honoured; hidden columns keep their place. | The consumer sends the order as is. | must |
| PRD-B5 | The whole sort order is legible: rank marks, descriptions, and a toolbar summary while a sorted column is hidden. | `aria-sort` names one column only. | must |
| PRD-B6 | A text filter applies on Enter only. Text with a control character or longer than `maxLength` (a prop, default 255) sets `aria-invalid`, shows a described error, and emits nothing. Newer typing survives an older answer. | Every apply is a query; the user learns at the field. | must |
| PRD-B7 | A categorical filter offers only the given options and emits only their values. | The data source accepts only its own vocabulary. | must |
| PRD-B8 | Each column filter shows a clearable badge; "Clear column filters" and "Reset table" emit one call each; a `criteria` snippet places the consumer's own criteria after the badges (section 5.2). | The user sees and undoes what narrows the rows. | must |
| PRD-B9 | A separate pager: offset-based, at most seven numbered places, page sizes from the consumer. For totals 0, 1, limit, limit + 1 and 2^53 - 1 it shows no NaN and never "Page 0"; a total or offset that is not a safe non-negative integer renders an alert instead. | Stores reach billions of rows; a wrong pager is worse than none. | must |
| PRD-B10 | A built-in column chooser shows and hides columns, cannot hide the last one, and keeps hidden columns' sort and filter. | A view change must not cost a query or drop criteria. | must |
| PRD-B11 | Columns can be reordered in two ways; the order is app state; each move emits once. (a) "Move earlier" / "Move later" buttons per column in the chooser, each move announced: the keyboard and single-pointer way. (b) A drag grip in each header: a drag starts only on the grip and works with pointer and touch; a press anywhere else on the header keeps its one meaning (sort). The grip is a pointer target of at least 24 by 24 CSS px and no Tab stop (the buttons are the keyboard way); the drag captures the pointer and emits once on release; Escape or a cancelled pointer emits nothing; the drop is announced like a button move. The box column and sticky columns stay in place; sort is unchanged; no modifier key; no "Reset columns" in the component (reset is the consumer's intent). | Users rearrange wide tables; a grip keeps sort and reorder apart on every input device (owner, 2026-11-17, Q1). | must |
| PRD-B12 | Columns can be resized on the APG window-splitter model; widths are app state. Each column edge has a focusable `separator` with a name, `aria-valuenow`, minimum and maximum; arrow keys step the width, Home and End go to minimum and maximum; each keyboard step emits once. A pointer drag on the separator captures the pointer and emits once on release, wherever the pointer is; Escape or a cancelled pointer during the drag emits nothing. "Narrower" / "Wider" buttons in the chooser are the single-pointer way. The layout is fixed with wrapping cells, never an ellipsis; there is a minimum width; widths are kept while a column is hidden. | Per-pixel emits flood the consumer; Escape is the 2.5.2 way out; every part answers a named criterion (owner, 2026-11-17, Q2). | must |
| PRD-B13 | Row selection: a box per row and one for the page, a range intent on Shift; the consumer owns the set and the range. | Only the consumer sees selection across pages. | must |
| PRD-B14 | A sticky header that stays visible below the consumer's fixed app bar (`stickyTop`), and sticky leading columns, in design D of section 5.1 (the document scrolls; owner, 2026-11-17, Q7), correct after resize, reorder, hide and in right-to-left (section 5.1). The header is sticky only while `stickyTop` plus the header's height is at most 30 % of the viewport height; above that it scrolls with the table (proven in the 320 and zoom views, with the 2.4.11 check). | Labels stay readable on long and wide pages; on small or zoomed screens a sticky band would take the page (Understanding Reflow advises static positioning there, per a review of an earlier draft; 30 % is INFERRED). | must |
| PRD-B15 | States: loading shows the loading text, never the empty text, with `aria-busy`; failed shows the failed text in an alert and no count; ready with 0 rows shows the empty text across all columns. | A false "no records" is wrong data. | must |
| PRD-B16 | Invalid input renders a fixed alert instead of the table and keeps the heading and actions. | A wrong table is worse than none. | must |
| PRD-B17 | An actions snippet shows in every state; there is no built-in export. | Export policy is the consumer's. | must |
| PRD-B18 | Two or more tables on one page work independently: every id is unique per instance and stable across server rendering and hydration. | Shared ids cross-wire labels and descriptions. | must |
| PRD-B19 | No global footprint. Oracle: before the first mount, a test wraps `addEventListener` and `removeEventListener` on `document` and `window`; a control mount of an empty Svelte component with the same event types measures Svelte's own delegated listeners, which are excluded. It snapshots the root element's attributes and inline style and the window scroll position; after mount and unmount all equal the snapshot; while a dialog is open the listener delta against the closed state is one passive outside-press listener. Escape: a consumer-side `document` keydown spy receives no Escape that closed a SvelteDT dialog and receives every other Escape. | A component must not fight the app's modals or layout. | must |
| PRD-B20 | A connection helper on its own export path connects the table and the pager to a server that speaks the DataTables server-side protocol in its 1.10-and-later parameter form (a backend that speaks only the 1.9 legacy form is out of scope): one factory, called in a component's script, given the application's `send(request, signal)` and a column map by the backend's column index, independent of display order and hiding; it returns the table's props, the pager's props, a readable and writable query, and `reload()`; a first page loaded on the server, with the query from the same call, can be passed in so the server's HTML already shows rows and no request goes out on mount; without it the helper gives no pager props until the first answer, so the application shows the pager only once they exist (the pager has no state for a total not yet known, PRD-B9); rows are passed on as given, never made deeply reactive (MEASURED 2026-11-17 with Svelte 5.57.3 in a probe of the helper: a deeply reactive array of 100,000 rows sorted 3.4 times slower); only the latest request's answer is used; an answer it cannot map is a failure, never shown as rows; a failure reaches the application through `onerror` and never shows server text on screen (PRD-S4). | A project leaving DataTables keeps its backend; the helper owns what is easy to get wrong while the component stays transport-free. | must |
| PRD-B21 | A local data source shipped beside the table, in two parts on two export paths: a pure query function (rows, query, column map, locale in; the page of rows, the total and the filtered count out; no runes, no DOM, under a `default` condition (PRD-K2), so the same function runs in the browser, on a Node server and in tests), and a reactive wrapper (under a `svelte` condition) returning the same table props, pager props and query as PRD-B20 (without its transport parts), so a page switches between server and local data without changing the table; the total and the filtered count it returns are the table's and the pager's totals. The column map gives per column id an optional type and optional sort and filter values. Order and search follow DataTables (READ, DataTables 3.1.5): a column's text filter matches that column's search text as DataTables' smart search (words in any order, quoted phrases, a leading `!` excludes; case-insensitive, diacritics removed); a categorical filter matches only its given values (PRD-B7); descending order is the exact reverse of ascending, ties within one column included, and empty values sort first ascending. Four differences, each listed in PRD-D8 with its reason: (1) text in every column is compared by a collator for an explicitly given locale that orders digit groups by value and ignores case, width and kana differences (the exact list, compatibility forms such as ligatures included, in B21's spec) (DataTables uses a collator only for columns holding non-ASCII text, with the browser's locale, `numeric: true` and `ignorePunctuation: true`, and plain lowercased order otherwise; READ, DataTables 3.1.5), so ASCII text also orders by digit groups while spaces, punctuation and accents still count ("item2" before "item10", where DataTables puts "item10" first; "a b" before "ab", where DataTables' non-ASCII rule ties them; "e" before "é"), and values differing only in case, width or kana type tie in that locale ("Apple" and "apple"; "１０" and "10"; in Turkish "IŞIK" and "ışık", while "Istanbul" and "istanbul" differ, because a capital I pairs with the dotless ı), all MEASURED 2026-11-18, and server and browser order alike where their ICU data agree (INFERRED); (2) nothing is detected from strings: a column without a declared type is compared by each value's own type (numbers and bigints by value, dates by time, booleans, strings by that collator), and a declared type or a sort value is needed only where the value to sort by is not the value held; a string is compared as text whatever it holds, so a column of numbers held as text needs a declared type or a sort value; (3) search treats the dotted and the dotless i alike in every locale, so "ışık" finds "IŞIK" and "DIYARBAKIR" finds "Diyarbakır" (MEASURED 2026-11-18 on the probe's search); (4) newlines and the Unicode line and paragraph separators become spaces in search text (in DataTables 3.1.5 a row holding U+2029 never matches, MEASURED 2026-11-17). The exact rules (the types, the order between values of different types, ties across several sort columns, empty values in search) are stated in B21's spec; the source keeps its sorted and filtered rows between page changes and recomputes them when the rows, the sort or the filters change (this is the local data source's own cache, not a response cache of the component). | The browser holds all rows and sorts, filters and pages them itself, with no server call per click. | must |
| PRD-B22 | Once `status` has been `loading`, or `busy` has been true, for 1 second without a gap (a change from loading to busy is no gap), a visual progress indicator appears, and it goes when neither holds. It is decorative and hidden from assistive technology, covers no control, and moves nothing (the table region's bounding box is the same with and without it, the still indicator's text included). Once shown, it stays at least 500 ms, even if the answer arrives sooner. It moves through a class only (strict policy), for at most 5 seconds counted from when it appears; under `prefers-reduced-motion` it is shown still from the start; 5 seconds after it appears, whether or not it was already still, it shows a visible text ("Still loading", a prop with that English default), which the polite status of PRD-A4 also says once, so a screen-reader user hears what a sighted user reads. Its colours come from tokens. | A slow answer must be visibly in progress; a fast one must not flash; a long one must not move forever beside content a user is reading (WCAG 2.2.2). | must |

**Slow data sources** (explanatory: it restates PRD-B15, PRD-A4, PRD-B20, PRD-B22 and PRD-D6 in one place, and adds no
requirement). Loading shows the loading text, never the empty text, with `aria-busy` (PRD-B15) and a polite
status (PRD-A4); while `busy` (the prop that marks a request in flight while the previous rows stay), the rows stay and
are marked busy; after 1 second a progress indicator shows
(PRD-B22); a failure shows the failed text in an alert, and the connection helper's `reload()` retries (PRD-B20);
answers that arrive out of order are dropped (PRD-D6, PRD-B20); the component sets no request timeout: the
application's transport decides when a request has failed, and cancelling a long request is the application's (the
connection helper passes it an abort signal).

### 4.2 Accessibility (A): the claim is WCAG 2.2 Level AA on the APG table pattern
APG: a table "is not an interactive widget"; the pattern defines no keyboard model; use a native HTML `table`; a grid
shortens the Tab sequence when a table holds many widgets (READ, APG table pattern). We keep the table pattern for the
screen reader's table commands, and add a skip link (PRD-A9) for the Tab cost.

| Id | Requirement | Reason | Priority |
|---|---|---|---|
| PRD-A1 | Every applicable WCAG 2.2 A and AA criterion is met with the proof path of section 4.3, with the example tokens and with none. | The public claim must be true and checkable. | must |
| PRD-A2 | Native `table`, `caption`, `th scope="col"`, `aria-sort` on the lead column only, a named region. The region is in the Tab order exactly while it is a scroll container whose content overflows (section 5.1). | Keeps table navigation; a focus stop that scrolls nothing is noise. | must |
| PRD-A3 | Every function works by keyboard in reading order. After every intent the focused element is not the page body and is within the component or the control that acted; when focus has no control left to land on (a cleared badge of a hidden column), it goes to the table itself (focusable by script only) without scrolling. A new page moves no focus. No intent except the skip link scrolls the window: a BT records the window's scroll position before and after every intent and asserts it unchanged. Scenario, so that scroll anchoring and clamping cannot turn it red: the window starts mid-page (well away from both ends), the site's test switch keeps the row count constant across the intent, and the site's page sets `overflow-anchor: none`. | WCAG 2.1.1, 2.4.3; users keep their place. | must |
| PRD-A4 | Status messages from inside the component: loading in a polite status, failure in an alert, the row count in a polite region whose node is empty while status is not ready or busy, each column move announced, and the still-loading text once, when the progress indicator shows it (B22). | WCAG 4.1.3. | must |
| PRD-A5 | Screen-reader protocol before each minor release and 1.0: a written task script with the expected announcements, recorded at the first pass and compared after; a blocker is a task that cannot be done or an AA failure. **NVDA + Firefox:** run by the maintainer on the Windows host of Q6; additionally driven in CI by Guidepup on a GitHub-hosted Windows runner if a spec-time probe proves it reliable (Guidepup supports NVDA on Windows Server 2022 and 2025, READ; no official hosted-runner workflow found and its Firefox runs headed, per a review of an earlier draft, so INFERRED). **Windows contrast theme (always, whatever route NVDA takes):** the maintainer checks A8 in Firefox on the same host. **VoiceOver + Safari:** run by the maintainer on macOS. Versions recorded; records live in the repo. | Automated checks cannot hear what is announced. | must |
| PRD-A6 | Every pointer target is at least 24 by 24 CSS px or spaced as WCAG 2.5.8 allows. | AA since 2.2 (READ). | must |
| PRD-A7 | Every drag has a single-pointer alternative and a keyboard way. | WCAG 2.5.7, AA (READ). | must |
| PRD-A8 | In forced-colours mode, focus indicators, box states, sort marks, separators and the progress indicator stay visible. | `box-shadow` is forced to none there (READ, MDN). | must |
| PRD-A9 | A "Skip past table" link, visible on focus, is the component's first focusable item, before the region, and moves focus to the end of the table (a target focusable by script only). | With selection a 1000-row page has over 1000 Tab stops; 15 columns add up to 45 header stops: a sort button, a filter button and a resize separator each (the reorder grip is no Tab stop). | must |
| PRD-A10 | No content appears on hover or focus alone, other than a focused control's own focus indicator and the skip link becoming visible; dialogs open on press. | WCAG 1.4.13 met by design. | must |
| PRD-A11 | At 200 % zoom, at 320 CSS px width and with the WCAG text-spacing values nothing is clipped or overlaps, and at horizontal scroll 0 nothing outside the table needs horizontal scrolling (a wide table still scrolls the page sideways in design D; algorithm in section 4.3). | 1.4.4, 1.4.12; 1.4.10 exempts the table but not the toolbar, badges or pager around it (READ, Understanding Reflow). | must |
| PRD-A12 | Focus indicators, box borders, separators, sort marks and the progress indicator have at least 3:1 contrast with adjacent colours: a unit check over the token-pair table of the example tokens, and a browser check of computed colours in each theme view. | 1.4.11; axe has no rule for it (READ by a review of an earlier draft). | must |
| PRD-A13 | The protocol also runs with JAWS + Chrome. | A widely used Windows reader; needs a licensed Windows host (Q6). | should |
| PRD-A14 | The protocol also runs with VoiceOver on iOS and TalkBack on Android. | Touch screen-reader users. | should |

### 4.3 WCAG 2.2 AA conformance: criterion -> proof path
CT = component test (simulated DOM); BT = component in a real browser, Chromium, Firefox and WebKit unless marked;
AX = axe inside BT, 0 serious or critical, run at scroll 0 with the header opaque so contrast is decidable; any
remaining *incomplete* item goes to the named manual step "contrast review of the listed nodes" by the maintainer in
the release record; MP = the protocol of PRD-A5. Rule 4.0 applies to every row.

| Criterion | What it means here | Proof |
|---|---|---|
| 1.1.1 Non-text content | Sort arrows, rank marks and gaps are hidden; icon-only controls are named | CT, AX |
| 1.3.1 Info and relationships | Native table, header scope, caption, labelled fields | CT, AX, MP |
| 1.3.2 Meaningful sequence | DOM order is visual order, right-to-left included | CT, BT (rtl view) |
| 1.3.3 Sensory characteristics | No default word relies on shape or position | manual review of the default-word list, in the release record |
| 1.4.1 Use of colour | Sort, selection, current page and errors carry text or attributes too | CT |
| 1.4.3 Contrast (minimum) | Example tokens light and dark; the no-token fallback | AX |
| 1.4.4 Resize text | 200 % zoom | BT (zoom view) |
| 1.4.10 Reflow | Toolbar, badges, dialogs, pager at 320 CSS px; table exempt | BT (320 view) |
| 1.4.11 Non-text contrast | 3:1 for indicators, borders, separators, marks, the progress indicator | unit (token pairs), BT (computed colours) |
| 1.4.12 Text spacing | WCAG spacing values | BT (spacing view) |
| 1.4.13 Content on hover or focus | None beyond A10's exceptions | CT, BT (hover and focus every control) |
| 2.2.2 Pause, stop, hide | The progress indicator moves at most 5 seconds after it appears and not at all under reduced motion (B22) | BT (fake clock, reduced-motion emulation) |
| 2.1.1 Keyboard / 2.1.2 No trap | Every function; Tab leaves dialogs and the region | CT |
| 2.1.4 Character key shortcuts | None defined; arrows act only on a focused separator or region | CT |
| 2.4.3 Focus order / 2.4.6 Labels | Reading order; names unique per column | CT |
| 2.4.7 Focus visible | Every control | BT |
| 2.4.11 Focus not obscured (min.) | Tab forward through a 200-row table under a 48 px app bar, then Shift+Tab back from the last control (moving up brings a control in under the header; moving toward the inline start, which forward Tab also does at each new row, brings it in under sticky columns), on a table that overflows horizontally with sticky columns, in left-to-right and in `dir=rtl`: no focused control fully under the bar, the header (while sticky) or sticky columns; run in the default view, where the test first asserts that the header is sticky, and in the 320 view, where it first asserts that the header is not sticky (30 % rule of B14), and in the zoom view, where it reads the state and applies the matching rule | BT |
| 2.5.1 Pointer gestures / 2.5.7 Dragging | Every drag has buttons | CT |
| 2.5.2 Pointer cancellation | Buttons act on release; a drag commits once on release (the header grip of B11, the separator of B12); Escape or pointer cancel during it emits nothing | CT (buttons), BT (drag) |
| 2.5.3 Label in name | Visible words inside accessible names | CT |
| 2.5.8 Target size (min.) | 24 by 24 CSS px or spacing | BT (bounding boxes) |
| 3.2.1 On focus / 3.2.2 On input | Focus and typing change no context; filters apply on Enter | CT |
| 3.3.1 Error identification / 3.3.3 Error suggestion | Refused filter: `aria-invalid`, error text saying what to change | CT, MP |
| 3.3.2 Labels or instructions | Fields named and described ("Press Enter to apply.") | CT |
| 4.1.2 Name, role, value | Every control | CT, AX, MP |
| 4.1.3 Status messages | Loading, failure, count, column moves, still loading | CT, MP |
| Forced colours (A8; not a WCAG criterion) | Indicators and states visible | Chromium: BT with Playwright's `forcedColors` emulation, which renders forced colours. Firefox: its emulation only flips the media query (READ by a review of an earlier draft), so the rendered proof is the A5 contrast-theme step, which runs on every route. WebKit: no rendered proof; macOS has no forced-colours setting (INFERRED), stated as a limit in PRD-D3. |

**Mechanisms that work under the strict policy.** Playwright has no zoom emulation (READ, Playwright emulation docs).
*Zoom view:* 200 % zoom of a 1280 x 800 window is emulated as a 640 x 400 CSS px viewport at device scale factor 2;
the *320 view* is 320 x 256 CSS px at factor 4 (400 % of a 1280 x 1024 window, the size WCAG's reflow criterion names). *Spacing view:* a URL parameter makes the site link a
same-origin stylesheet with the WCAG text-spacing values (allowed by `style-src 'self'`), so the policy listener stays
on and no policy bypass is used. *Clipping and overlap algorithm:* (a) for every text-holding element and control in the
component except the scroll region itself (a wide table overflows it by design), where computed overflow is not
`visible`, `scrollWidth <= clientWidth + 1` and `scrollHeight <= clientHeight + 1`; (b) for every header and body cell,
the bounding box of a text range over its contents lies within the cell's border box (+-1 px), which catches long
unbroken values spilling out of visible-overflow cells (W3 plants them; cells must wrap them); (c) the bounding boxes
of visible controls in the toolbar, header cells, badges and pager intersect by at most 1 px; (d) at horizontal scroll
0, every element outside the table lies within the viewport width.

Not applicable at component level: 1.2 (no media), 1.3.4 (a component cannot lock orientation), 1.3.5 (filter fields
collect no personal data), 1.4.2, 1.4.5, 2.2.1, 2.3 (no audio, images of text, time limits or flashes), 2.5.4
(no motion actuation), 2.4.1, 2.4.2, 2.4.5, 3.1, 3.2.3, 3.2.4, 3.2.6 (page-level, the consumer's), 2.4.4 (links are the
consumer's snippets), 3.3.4, 3.3.7, 3.3.8 (no submissions or authentication). AAA criteria are not claimed.

### 4.4 Security (S)
**The strict policy** (one definition): `default-src 'self'; script-src 'self'; style-src 'self'`, with no
`'unsafe-inline'`, no `'unsafe-eval'`, no `style-src-attr` allowance, and no nonce needed by the component. A consumer
may add nonces for its own scripts. A framework's own markup may need an allowance of its own (SvelteKit's route
announcer does, PRD-W8); that allowance is the consumer's, never the component's, and the component and the site run
under the strict policy as defined.

| Id | Requirement | Reason | Priority |
|---|---|---|---|
| PRD-S1 | Client-rendered (the site, without nonces) and server-rendered (the consumer project, under the policy of PRD-W8: the strict policy, SvelteKit's nonces and the one allowance for SvelteKit's route announcer): 0 `securitypolicyviolation` events on every page in Chromium, Firefox and WebKit, recorded by a listener script loaded before the bundle; the consumer project's server HTML holds 0 `style=` attributes; the component injects no `style`, `link` or `script`; its build holds no `eval`, `new Function` or string timers. | A static `style="..."` raises a report (MEASURED, Chromium), and server-rendered HTML can carry style attributes (INFERRED). | must |
| PRD-S2 | Every given text renders as text; the source has no raw-HTML path. | Values may hold anything. | must |
| PRD-S3 | The component and the local data source make no network request; the connection helper makes none except through the application's `send`; none of them sets a cookie, uses web storage or starts a download. | Data and its destinations are the consumer's. | must |
| PRD-S4 | Error messages never contain row values. | Messages reach screenshots and logs. | must |
| PRD-S5 | Supply chain: no runtime dependency besides the Svelte peer, the connection helper and the local data source included (they are part of the package); development dependencies locked, installs frozen, install scripts off except an allow-list; Dependabot alerts, security updates and grouped version updates for npm and GitHub Actions with a cooldown; dependency review on every pull request; actions pinned by commit SHA; secret scanning with push protection; workflow tokens read-only by default. The repo-file parts (lockfile, workflows, Dependabot config, pinned SHAs) are checked by static scans; repository settings need an admin credential, which is never stored, so the owner records them in the release record (rule 4.0). | Every dependency and workflow is exposure for every consumer. | must |
| PRD-S6 | Behaviour under Trusted Types enforcement is measured, then claimed or documented as a limit. | Svelte's template code sets `innerHTML` (READ by an evaluation done before this document). | should |
| PRD-S7 | Publishing, in this order (npm facts READ, docs.npmjs.com trusted publishers, 2026-11-17). (1) DONE 2026-11-17: the owner published the placeholder `@hniedner/sveltedt@0.0.0` by hand (MEASURED by `npm view`: on `latest`, Apache-2.0, maintainer `hniedner`). It stays on `latest` until the first real release replaces it. (2) The release workflow is merged: GitHub-hosted runner, npm CLI 11.5.1+, Node 22.14.0+, `repository.url` matching the repo exactly, the workflow file name recorded exactly (both case-sensitive). (3) The owner configures the trusted publisher on npmjs.com with "Allow npm dist-tag" left off (its default, READ): the workflow runs only `npm publish`, with `--tag rehearsal` for the rehearsal, and a publish without `--tag` sets `latest` itself (READ, docs.npmjs.com npm-dist-tag), which moves it off the placeholder. For the same reason the workflow passes `--tag` for every prerelease version, and a static check fails any workflow path that could publish a prerelease without it. The npm docs do not say whether `--tag` at publish needs the dist-tag option (INFERRED that it does not). If the rehearsal publish is refused for lack of it, the configuration is deleted and recreated with the option on (npm CLI 11.21.0+ then, READ), the 2-day window starts again (INFERRED: a refused publish does not bind the configuration), and the release record says so. npm does not validate the configuration on save. (4) Within 2 days the workflow publishes the rehearsal `0.1.0-rehearsal.0` under the dist-tag `rehearsal`; that first publish validates and binds the configuration, which otherwise expires, cannot be edited, and must be deleted and recreated. The rehearsal is a prerelease, not a release: it proves the publishing path only, `npm install @hniedner/sveltedt` never selects it, so the release duties (A5 protocol, G1 release coverage, criteria of section 6) do not apply to it. (5) The owner turns on "Require two-factor authentication and disallow tokens" and revokes any token. From then on every release, except a break-glass, is published only by the release workflow, with provenance (automatic for a public repo and package). **Releases are automatic (owner, 2026-11-17, amending REV 7):** after CI has passed on a push to `main`, the release workflow works out the next version from the conventional commit messages, creates the version tag and the GitHub release with the changelog generated from those commits, and publishes that tag's build; it pushes no commit to `main`. The publish job runs in the `release` environment and waits for the owner's approval: a fix release may be approved at once, a minor or major release only after the PRD-A5 protocol record for it exists. Versions stay at 0.x until the owner decides on 1.0. The tool that computes the version is chosen by a library-first evaluation that includes the owner's existing release workflow; whichever it is, it runs only `npm publish` (with `--tag` for a prerelease) and moves no dist-tag. The workflow files reference no npm token (static check); the npm setting is recorded in the release record. **Break-glass:** if the workflow cannot publish and a security fix cannot wait, the owner publishes by hand with two-factor authentication (the setting "only affects traditional token authentication", and under it maintainers publish interactively with a two-factor prompt; READ by a review of an earlier draft, docs.npmjs.com trusted-publishers and requiring-2fa-for-package-publishing-and-settings-modification). That version has no provenance; its release record says "manual, no provenance" and why; it is the one exception criterion 7 names, and the next version goes through the workflow. | Consumers can verify every real release; the manual steps are named and recorded. | must |

### 4.5 Theming (T), internationalisation (I), performance (P), browsers (E)
| Id | Requirement | Reason | Priority |
|---|---|---|---|
| PRD-T1 | Every colour, border and surface class is a complete literal class reading a prefixed custom property (`--sdt-*`) with a CSS system-colour fallback; the class literals in the build equal the documented token table, which is public API. | Prefixed names cannot collide with an app's tokens; literals are what Tailwind scans. | must |
| PRD-T2 | With no `--sdt-*` defined: the header is opaque over rows, text is readable, focus is visible, axe finds 0 serious or critical. | The fallbacks make "usable without tokens" true. | must |
| PRD-T3 | No CSS ships; the consumer adds `@source` for the package (`node_modules` is not scanned by default, READ Tailwind docs); a static scan finds only Tailwind's built-in variants in the build. | One stylesheet per app. | must |
| PRD-T4 | The docs and the site ship an example token set, light and dark, meeting 1.4.3 and 1.4.11. | A1 is claimed with it. | must |
| PRD-I1 | Every fixed word, announcement and accessible name is a prop with an English default; the defaults are public API (PRD-K3). | Consumers translate without forking. | must |
| PRD-I2 | Counts and numbers go through consumer-replaceable functions (plural rules, numerals). | "1 row" and "2 rows" differ by language. | must |
| PRD-I3 | Correct under `dir="rtl"`: sticky columns at the inline start, arrow keys and move buttons follow reading direction. | Logical properties are cheap at the start (INFERRED). | must |
| PRD-P1 | Every given row renders, up to 1000, with no virtualisation. | Find-in-page and table navigation need the rows. | must |
| PRD-P2 | Reference: a GitHub-hosted standard Linux runner (4 CPU, 16 GB, READ), Playwright's pinned Chromium, no throttle, a page of 1000 rows x 15 columns with selection and the example stylesheet; 30 runs; the median of mount, page swap (new rows to painted frame) and one selection change (press to painted frame). **Targets, to be confirmed once by the owner:** page swap 200 ms (INP "good" threshold, READ web.dev); selection change 50 ms (RAIL: process input within 50 ms, READ web.dev, which now prefers Core Web Vitals); mount 500 ms (INP's "needs improvement" upper bound, used as an INFERRED target since no standard covers a component mount). **Budgets (test-first exception, owner-visible):** no SvelteDT table exists when the P2 statements are written, so the statements carry the targets, and the budgets are fixed once, from SvelteDT's own first implementation that can run the full scenario on that runner class: the median of 30 runs x 1.5, rounded up to 50 ms (mount, page swap) or 10 ms (selection change), recorded with the runner image and Chromium versions in `docs/decisions/`. The P2 tests assert the targets until that record exists and the budgets from then on. The budgets are calibrated on no table other than SvelteDT's own. If a budget exceeds its target (mount 500 ms, page swap 200 ms, selection change 50 ms), work stops and goes to the owner. **Planted slowdowns, one per measured action:** site views add busy work equal to that action's budget to the first render of the cells (mount), to the rendering of new rows (page swap) and to the selection callback that reruns on a selection change (selection); each must turn its test red. **Recalibration** happens, and is recorded, when the runner image's major version, Playwright's Chromium major or Svelte's minor changes; budgets change only through that record. The pager does no work per page. | Laptop figures (16 cores, no CSS, auto layout: 140 ms, 124-148 ms, 4 ms; 471 ms and 477-612 ms at 4x throttle, MEASURED) do not transfer; a median of 30 is stable where a 90th percentile of 10 is the maximum. | must |
| PRD-P3 | Size: at most 32 KB min+gz for a probe entry importing the table and the pager, built by the repo's pinned Vite in production mode, all emitted JS gzipped at level 9, Svelte runtime share included. Proven able to fail by a planted import. | A prototype without chooser, order, resize and skip link measured 26.1 KB the same way (MEASURED); 32 is INFERRED to fit; a breach stops work and goes to the owner, never a silent raise. | must |
| PRD-P4 | With 10,000 rows of the site's seeded dataset (PRD-W3's generator at that count, its 16 columns, the example token stylesheet) on the P2 reference runner, with pages of 1000 rows as P2: a page change on an unchanged sort and filter within P2's page-swap budget; a new sort or a new filter within 500 ms (target, to be confirmed once by the owner; INP's "needs improvement" upper bound, as P2 uses for mount); budgets fixed from the first implementation as P2 fixes them, and a budget over its target stops work and goes to the owner; a planted slowdown per measured action must turn its test red. The same actions at 100,000 rows are measured and published in the documentation as beyond the recommended size, with no budget. | Client-side processing is budgeted at 10,000 rows, the upper end of the size DataTables advises it for (the DataTables manual: client-side under about 10,000 rows, 10,000 to 100,000 a "grey area", server-side above 100,000, READ datatables.net/manual/data); the grey area is measured at 100,000 and published, not promised. | must |
| PRD-P5 | Each further export path has a size budget, measured as PRD-P3 measures its probe, as the difference between the P3 probe with that path imported and the P3 probe alone: the connection helper and the local data source each at most 8 KB min+gz (INFERRED to fit; a breach stops work and goes to the owner). | Importing a data source must not cost the table's budget. | must |
| PRD-E1 | Support: Chrome and Edge 111+, Firefox 128+, Safari 16.4+, which Tailwind 4 requires (READ). CI tests Playwright's Chromium, Firefox and WebKit pinned by the lockfile, versions recorded per release; `eslint-plugin-compat` with that floor flags JavaScript APIs above it. The support statement says the floor versions are covered by that check only. Raising the floor is a major release. | Claim only what is proven, and say how. | must |
| PRD-E2 | Touch works in emulated iOS Safari and Android Chrome. | Phones and tablets read tables (INFERRED). | should |

### 4.6 Packaging (K), engineering (G), documentation (D), licence (L)
| Id | Requirement | Reason | Priority |
|---|---|---|---|
| PRD-K1 | Svelte 5 runes; generic over the row type; callback props and snippets; no `any` in exported types. An API report of every export, including the default-word map, is checked in and CI fails on an unreviewed change. Tool: API Extractor on the emitted declarations if a spec-time probe shows it reads `svelte-package` output (INFERRED); otherwise a normalised snapshot of the emitted `.d.ts` files plus the default-word map. | The public interface is the product. | must |
| PRD-K2 | Built with `svelte-package`; `exports`: the root and every path that holds Svelte code carry `types` and `svelte` conditions (READ); a path that holds no Svelte code (the local data source's query function, PRD-B21) carries `types` and `default` (READ, svelte.dev/docs/kit/packaging: a library that exports no Svelte components may use `default` in place of `svelte`), because plain Node, which runs the site's server, resolves no `svelte` condition (MEASURED: `ERR_PACKAGE_PATH_NOT_EXPORTED` for a subpath with only `types` and `svelte`); the `svelte` peer floor is the lowest 5.x that CI runs and that provides per-instance ids stable across hydration (5.20 per a review of an earlier draft, INFERRED); `publint` passes, and the consumer project's type check (PRD-W8) passes against the packed package. | Consumers resolve and type it cleanly. | must |
| PRD-K3 | Semver. Breaking: removing an `exports` path or condition (READ); removing or renaming a prop, callback, snippet, message key or token; changing a payload shape, a default role or a default English accessible name; raising the Svelte or browser floor. A consumer that passes its own words is untouched by a default-word change. Deprecation: in a minor, with a documented replacement and a development-only warning; removal only in the next major. Changelog generated from commits; an upgrade note per major. | Consumers' tests find controls by role and name. | must |
| PRD-K4 | Renders under server-side rendering without browser globals and hydrates without mismatch or warning (proven in the consumer project, PRD-W8). | Most Svelte apps render on the server (INFERRED). | must |
| PRD-G1 | Coverage by Vitest with the V8 provider over the component tests, read by the gate's changed-lines wrapper from the lcov report: every change covers at least 95 % of its changed lines; at each release `src/lib` has at least 95 % line coverage. Branch coverage is reported but has no threshold until a probe shows the V8 mapping of `.svelte` branches is accurate; mutation (G2) is the stronger proof meanwhile. The first commit is the baseline. | A whole-package figure needs a definition. | must |
| PRD-G2 | Mutation by StrykerJS 10.1.1 with the Vitest runner, pinned (MEASURED by a mutation-testing probe done before this document: mutants in `.ts`, `.svelte.ts` and `.svelte` files under Svelte 5.57.3 and Vitest 5.1.0; the forms it exercised were a script block, a `class` attribute ternary, an `onclick` arrow and a `{call(...)}` expression; a spec-time probe adds `{#snippet}` bodies and component children, which its node list does not name). **What it does not mutate (READ, its Svelte parser source, 2026-11-17):** it parses `.svelte` with the legacy AST and takes markup expressions only from mustache tags (attribute values included), `{#if}`, `{#each}`, `{#await}`, `{#key}`, `{@const}` and `on:` handlers; directives (`class:`, `style:`, `bind:`, `use:`), `{@render}` and `{@attach}` arguments and spread attributes are not mutated, and markup takes no disable comment. **Rules:** (a) component logic lives in `.ts` and `.svelte.ts`; (b) the component uses no `class:`, `style:`, `use:`, `{@attach}`, spread attributes, or `bind:` other than `bind:this` (static scan), so conditional markup goes through mutated attribute expressions; (c) each `{@render}` call site and `bind:this` has a component test whose named break (drop or swap the argument) is applied once at review and recorded; (d) every markup expression has a component test that kills its mutants; (e) Tailwind class strings in `.ts` are either asserted by a component test or marked with a disable comment naming the real-browser test that proves the style, reviewed. Everything Stryker mutates is gated at break 100 at step boundaries. The gate wrapper refuses a gated file with 0 mutants and any `allowEmpty` setting, because both pass silently (MEASURED), and fails as *could not check* when a file's mutant count falls below its recorded count (a Stryker or Svelte upgrade can drop mutants silently, INFERRED). An equivalent mutant is recorded with its reason on the same line and reviewed. Real-browser tests stay outside mutation (the Vitest runner has no browser mode, READ by that probe). | A test that cannot fail proves nothing; "break 100" claims only what is mutated. | must |
| PRD-G3 | One local command, `pnpm gate`, runs format, lint, types, all tests (real-browser tests in Chromium only), coverage, mutation at step boundaries, trace, size, API report, docs test and the secret scan. CI (GitHub Actions on every pull request and on main, required by the main ruleset) runs the same except the private word scan, with real-browser tests in Chromium, Firefox and WebKit. | The gate record that counts is the one GitHub writes. | must |
| PRD-D1 | README quick start whose code blocks equal the consumer project's files (docs test). | Setup is where adoption fails. | must |
| PRD-D2 | API reference generated from the types; the docs test fails if any export, prop, callback, snippet, message key or token in the API report lacks a description, or if a relative link in the docs does not resolve. | One source; hand-kept docs drift. | must |
| PRD-D3 | Accessibility statement: the claim, section 4.3, what the consumer must supply (caption, names, `stickyTop` equal to its app bar, the layout duty of design D (no ancestor of the table clips overflow; no fixed bar at the inline start), no inline `style` in its own page shell: SvelteKit's default `app.html` wrapper `<div style="display: contents">` raises a report under the strict policy, so README and the consumer project use a class), the policy allowance for SvelteKit's route announcer (`'unsafe-hashes'`, the hash of the announcer's style and `'report-sample'` in `style-src-attr`, the last so that a blocked style shows its first characters in the report, a help and not a proof: Chromium and Firefox fill it, WebKit leaves it empty, MEASURED; how to compute the hash; re-checked on every Svelte or SvelteKit update, when the consumer project's test turns red with a message pointing here), known limits (the browser floor, forced colours in WebKit), the latest protocol record. | An honest claim states its conditions. | must |
| PRD-D4 | Examples are the test site's pages, quoted from its source. | Tested examples cannot rot. | must |
| PRD-D5 | `SECURITY.md` (private vulnerability reporting, the support promise), `CHANGELOG.md`, upgrade notes. | Public-repo duties. | must |
| PRD-D6 | Server implementer guide: intents to queries (zero-based offset, limit, direction words, the order list, filter shapes, what reset restores), dropping out-of-order answers, `busy` and `status` handling, refusal as the failed state, the local data source's query function (the site's query module), and a section for projects leaving DataTables: connecting their server-side backend through the connection helper (PRD-B20), with what each recorded backend sends and expects (PRD-W11). | The half of the contract the component cannot enforce. | must |
| PRD-D7 | Contributor guide (`CONTRIBUTING.md`): the gate, the test layers, red first, statement ids and the trace, the mutation rule, synthetic data only. It cites only files in the repo. | Public contributors cannot read private documents. | must |
| PRD-D8 | Migration guide from DataTables: for every option, event and server parameter in the reference index of the current DataTables release when the guide is written, its SvelteDT equivalent or the reason there is none, and every intentional departure from DataTables' behaviour with its reason (among them: DataTables detects number, formatted-number and date columns from their text, SvelteDT detects nothing from strings and compares each value by its own type, so a number held as a number sorts by value, and a number held as text needs a declared type or a sort value (as text, "3.2" sorts before "3.14"), because detection makes a column's order depend on its data (in DataTables 3.1.5 a column of numbers held as text sorts by value, and one "n/a" cell turns the whole column to text order, "1000" before "3.14"; MEASURED 2026-11-18); and PRD-B21's other three differences: numeric order on all text in the given locale with punctuation and accents kept and case, width and kana differences ignored, so dates and signed or decimal numbers held as text need a declared type ("2024-01-05" ties "2024-1-5", "-10" sorts after "-2"), and in Turkish "IŞIK" and "ışık" tie, where DataTables lowercases without a locale and they do not (both MEASURED 2026-11-18); search with the dotted and the dotless i alike, because DataTables' case-insensitive match never maps "ı" or "İ" to "i", so "ışık" does not find "IŞIK" (MEASURED 2026-11-18 on a port of DataTables 3.1.5's search); and separators that become spaces in search text, because in DataTables 3.1.5 a row holding U+2029 never matches a search, MEASURED 2026-11-17); the docs test compares the guide with a checked-in snapshot of that index, which carries DataTables' MIT licence notice, and fails on an entry the guide does not list. | Adoption by projects leaving DataTables is a goal. | must |
| PRD-L1 | Apache-2.0: `LICENSE` with the full text, `NOTICE` with "Copyright 2026 R. Hannes Niedner", `"license": "Apache-2.0"` in `package.json`. | Settled by the owner. | must |

### 4.7 The test site and consumer project (W): part of the product
W1-W9 are the minimum needed to prove the musts; the test pages stay very simple beyond that, and the public site (W10) is built from them. They are (a) where the
real-browser statements run, (b) the consumer smoke test from the **packed** package, (c) the docs' live examples.
Where and in what language: section 5.3. What they are not: no users, sign-in, roles or tiers; no real or realistic
personal data; no application code (the ported table is component code, section 7); no persistence (state lives in the URL); no export; not a template for a
production server.

| Id | Requirement | Reason | Priority |
|---|---|---|---|
| PRD-W1 | The site imports SvelteDT only through the package's public exports (static scan). | It may use only what a consumer can. | must |
| PRD-W2 | One JSON endpoint applies multi-column sort, text and categorical filters, offset and limit (at most 1000), and refuses unknown columns, directions or sizes with an error. Test-mode switches, off by default: latency, failure, empty result, refused filter, out-of-order answers, duplicate row ids, unknown sort key, all columns hidden, and totals of 0, 1, limit, limit + 1, 1000, 2^53 - 1 and above 2^53. | Every state and refusal must be reachable in a real browser. | must |
| PRD-W3 | A seeded synthetic dataset of 50,000 rows by 16 columns, generated at start from a fixed seed (the generator takes the row count, so PRD-P4 can use 10,000 and 100,000), with long unbroken values and markup-looking strings, using reserved shapes only (fixed synthetic word lists, RFC 2606 example domains, sequence ids), checked by the synthetic-shape check. | 50 pages even at 1000 rows proves server paging; one page cannot fake it. | must |
| PRD-W4 | Every response carries the strict policy as a header; the listener script of S1 loads before the bundle; a canary page breaks the policy on purpose and the test must see the report; the site has no inline bootstrap. | Proves the policy and proves the proof can fail. | must |
| PRD-W5 | Page "plain": sort, both filter kinds, clear and reset, pager with sizes, a fixed 48 px app bar. | The common read-only use. | must |
| PRD-W6 | Page "full": selection with a Shift range worked out by the site, chooser, reorder (chooser buttons and the header grip) and resize (separators and chooser buttons), sticky header and sticky leading columns, cell actions (a link and a menu in a cell snippet), the `criteria` and actions snippets. | Exercises every consumer duty. | must |
| PRD-W7 | Views by URL parameter: light, dark, no tokens, `dir=rtl`, spacing, the three planted slowdowns (P2), two tables on one page. Real-browser tests also use the zoom view, the 320 view and forced colours (section 4.3). | Section 4.3 needs each. | must |
| PRD-W8 | A clean-install consumer project in `consumer/`: a SvelteKit app with server rendering and hydration, the strict policy sent as a header, plus SvelteKit's nonce for its own bootstrap (READ, SvelteKit docs) and exactly one `style-src-attr` allowance (`'unsafe-hashes'` and the hash of SvelteKit's route announcer style, with `'report-sample'`; without it the announcer raises one violation per page load in Chromium, Firefox and WebKit, MEASURED), the S1 listener script, a page shell with no inline `style`, installing the packed tarball with no workspace link; its files are the README quick start; its type check (`svelte-check`) passes against the packed package. | Catches broken `exports`, files, types or `@source` lines, and proves K4 and the server-rendered half of S1. | must |
| PRD-W9 | Every real-browser test runs against the site, and the consumer project's journeys and S1 checks run, in CI in Chromium, Firefox and WebKit on every pull request; P2 is measured on the site. | The real-browser layer needs pages. | must |
| PRD-W10 | One public site on GitHub Pages, deployed by CI from each release tag: the documentation (D1-D8) and the examples gallery with live tables in a static data mode, shaped as section 8 Q5 describes. Each example page shows the live table and, in tabs, the component code, the server handler and the last request and response. | A visitor can read, see and try the table before installing; tested pages cannot drift from the code (owner, 2026-11-17, Q5). | must |
| PRD-W11 | Request and answer fixtures, recorded once over PRD-W3's synthetic dataset from three DataTables server-side backends (the `ssp.class.php` helper of DataTables' server-side examples, django-rest-framework-datatables, DataTables.AspNet): the request parameters (query string or form body) as sent by the DataTables client of the protocol form the connection helper covers, and the answer body as the backend returns it, with no headers, hosts or paths, each with its backend's licence notice (all three MIT, READ 2026-11-17), each stating its backend and version; checked in after the synthetic-shape check and the word scan; contract tests run the helper's request serialiser and answer mapper against them. | The switch is proven against what real backends send and expect, not against our own endpoint. | must |

**Later:** (PRD-X1, header drag to reorder, moved into 1.0 by the owner: B11 b); PRD-X2 fit width to content; PRD-X3 columns sticky at the inline end;
PRD-X5 a region-scrolling sticky layout for app-shell pages (design R of section 5.1).

**Counts:** 80 must (none depends on an open question), 4 should, 3 later.

## 5. Decisions made in this PRD

**5.1 Sticky layout: design D, the document scrolls (owner, 2026-11-17).** A sticky element sticks to its nearest ancestor with a
scrolling mechanism, even if that ancestor does not scroll (READ, MDN `position`). So the header can stick either to the
viewport (the document scrolls) or to the table's own scroll box, not to both.

- **Design D (chosen for 1.0).** With `stickyHeader`, the region is no scroll container. The document scrolls in both
  directions; the header row sticks at `stickyTop` CSS px below the viewport top (the height of the consumer's fixed app
  bar), and sticky columns stick to the viewport's inline start. The spec's sticky-header statements pass as written: scroll the window
  3000 px, and the header's top is within 1 px of `stickyTop`. A new page leaves the window's scroll where it is.
  Consumer duty (D3): no ancestor of the table may set `overflow` other than `visible` or `clip`, and no fixed bar may
  sit at the inline start; a development-only warning names the ancestor when it detects that the header cannot stick.
  Cost: on a wide table the whole page scrolls horizontally, toolbar included, and the horizontal scrollbar is at the
  end of the document.
- **Design R (not in 1.0; later as PRD-X5).** The region would always be the scroll container, capped at the viewport
  height minus `stickyTop`, with the header stuck to the region's top. It keeps the toolbar and the horizontal
  scrollbar in view for app-shell layouts, at the price of a nested scroll box (touch scroll can trap), a focus stop on
  the region and a layout duty on every consumer.

Without `stickyHeader` the region scrolls horizontally only. The region is in the Tab order exactly while it is a
scroll container whose content overflows (A2), so with `stickyHeader` it is never a stop.
Sticky leading columns are marked by the consumer; the component computes their inline-start offsets from rendered
widths and recomputes them on resize, reorder and hide (no consumer offsets). Logical properties mirror the layout in
right-to-left. For 2.4.11 the component sets `scroll-margin` on its own focusable cells and controls: at the block start,
`stickyTop` plus the header height while the header is sticky, and `stickyTop` only while the 30 % rule has made the
header scroll; at the inline start, the sticky columns' width. Focus
then scrolls them clear without writing to the document. `scroll-margin` on the component's own elements is used, not the `scroll-padding` that WCAG technique C43 names, because the scroller is the consumer's document, which the component must not style (B19). That focus scrolling honours `scroll-margin` in all three engines is INFERRED (an older Firefox ignored it; WebKit's current behaviour is unconfirmed) and is proven per engine by the 2.4.11 BT; where an engine fails it, the remedy is the component's own (it scrolls the focused control clear on focus), settled in the spec and recorded, never a consumer duty. Styles go through CSSOM only
(MEASURED: allowed by the strict policy). Rejected: a script-synced detached header (breaks table semantics, writes
styles on every scroll).

**5.2 Criteria the consumer owns.** By the non-goal "no app concepts", the component knows only its column filters.
Its button is "Clear column filters", shown while one applies; badges and counts cover column filters only. A consumer
with its own criteria renders their badges and its own "clear all" in the `criteria` snippet. The live region counts
rows only. "Reset table" is one intent; PRD-D6 documents what a server restores.

**5.3 Where the site lives and what runs it.** `site/` and `consumer/` folders in the `sveltedt` repo, private packages
that are never published to npm: one product, one repo, one tracker, and every pull request tests component and consumers at
the same commit; W8 installs the packed tarball, so the same repo hides no packaging mistake. The site's server is
TypeScript on Node with only `node:http`: the simplest thing that proves the contract, no second toolchain, the policy
written literally, and the local data source's query function (PRD-B21) is the site's query module: the same function
serves the site's endpoint, its static demo and consumers. Server rendering is
proven in the consumer project (W8), because that is how consumers get it. The public site (W10) is a static build
of the same pages plus the documentation, made by the release workflow and deployed to GitHub Pages; in it the query
module runs in the browser, since Pages has no server.

## 6. What "perfected" means: release criteria for 1.0

1. Every must is met and traces to statements whose tests ran and passed in every engine they name; the trace check is
   green; no skipped test and no open check result (rule 4.0).
2. Q1-Q7 are answered and in the spec.
3. `pnpm gate` and CI green at the release commit: G1 coverage, G2 mutation, P2-P5 budgets, K1 API report
   reviewed, K2 checks, D2 docs test.
4. Section 4.3 holds: AX 0 serious or critical, and S1 holds on every page of the site and the consumer project, in
   Chromium, Firefox and WebKit.
5. The A5 protocol record for the release commit has no open blocker.
6. The test site and the clean-install consumer project run in CI in Chromium, Firefox and WebKit, green.
7. Docs D1-D8 complete; 1.0 is published by the release workflow with provenance (S7), with no exception. So is
   every later release, except a break-glass publish, which is listed in the release record with its reason.

The first app starts on 1.0; production use by it is not a criterion.

## 7. Alternatives considered (MEASURED or READ in an evaluation done before this document, unless marked)

- **SVAR DataGrid:** 3 policy reports (a font `<style>` via raw HTML, a CDN stylesheet, static `style` attributes);
  grid pattern on `div`s; own theme; 53.5 KB + 7.5 KB CSS.
- **SvGrid:** 0 reports, Svelte 5-native, MIT; 5 months old, vendor-run with a paid tier, grid pattern, 106 KB entry.
- **AG Grid Community:** 321.6 KB; no official Svelte adapter; needs a style nonce and `img-src data:`; its docs admit
  gaps in sort and row-count announcements.
- **Tabulator, Grid.js, RevoGrid:** not Svelte 5-native; own DOM and themes; Grid.js last released 2024-03.
- **TanStack Table v9:** clean, runes-native, 24.2 KB; in server mode its row models do nothing; saves an estimated
  150-300 lines (INFERRED) for a 3-month-old major.
- **Smaller headless handlers:** no accessibility claim; resize missing or server mode undocumented.
- **Decision:** no third-party table library is adopted for the component, nor for the local data source: its row model is built as a pure TypeScript engine with a thin Svelte wrapper (PRD-B21; PRD-S5 allows no runtime dependency), after its own library check (MEASURED 2026-11-17 in Node, in the library decision's adversarial re-run: TanStack Table 9 given the same comparator re-sorted 100,000 rows descending after an ascending sort, the rank reused, in 117.9 ms against 17.5 ms, and by two columns in 268.6 ms against 71.7 ms, in the same order, with 120.7 MB of heap above the data against 9.6 MB), to be recorded in `docs/decisions/` before B21's spec. The component is built test-first, and it starts from the owner's own earlier Svelte 5 table (server-driven, native table, no runtime dependency), ported through the method: its tests first, then its code, with its inline styles replaced to meet the strict policy (owner, 2026-11-17: reuse instead of rebuilding to an equivalent result). What that table lacks is written new.

## 8. Open questions for the owner

1. **Column reordering in 1.0, and how?** ANSWERED (owner, 2026-11-17): yes, by the chooser's "Move earlier" /
   "Move later" buttons AND by a drag grip in each header; no modifier key (none exists on touch, and it would be
   hidden). The requirement is PRD-B11. The earlier recommendation was buttons only, with header drag later.
2. **Column resizing in 1.0, on the APG window-splitter model?** ANSWERED (owner, 2026-11-17): yes, with focusable
   separators (keys per APG, READ), pointer drag, and "Narrower" / "Wider" in the chooser. The requirement is PRD-B12.
3. **i18n in 1.0: words only, or words + plural and number functions + right-to-left?** ANSWERED (owner,
   2026-11-17: "do what is reasonable in the age of LLMs"; decided by the reviewer on that word): words as props,
   plural and number functions, and right-to-left, all in 1.0 (PRD-I1 to I3). No translations are bundled: a consumer
   can translate the one exported default-word map in a single pass with a language model, so shipping unreviewed
   translations would add maintenance and no value. The docs show that recipe (PRD-D2 lists every key).
4. **Support promise?** ANSWERED (owner, 2026-11-17): security fixes for the latest minor and for the previous major
   for 6 months after a new one; vulnerability reports acknowledged within 7 days; no other promise; issues before
   pull requests. It is published in `SECURITY.md` with the first release (PRD-D5).
5. **Publish the site as a public demo?** ANSWERED (owner, 2026-11-17): yes, ONE public site on the repo's GitHub
   Pages, deployed by CI from each release tag, holding the documentation and the examples gallery with live
   tables. It is modelled on the jQuery DataTables site, the owner's "greatest inspiration" (READ, datatables.net,
   2026-11-17): a home page with a live table and the install lines; an examples gallery by topic; each example
   page = a short intro, the live table, then tabs showing the component code, the server handler, and the last
   request and response, with links to the props and intents used; a manual (quick start, server contract,
   internationalisation, security, theming) and a reference generated from the types. The examples ARE the test
   site's pages (PRD-D4); its Node server (PRD-W2) is the runnable demo app, started locally with one command and
   used by CI. On Pages there is no server: the same seeded generator and query module run in the browser, no test
   switches, the policy as a `<meta>` tag. Pages sends no headers and a meta policy ignores `frame-ancestors`,
   `report-uri` and `sandbox` (READ, SvelteKit docs), so CI tests use the header-served site only; only the deploy
   job may write to Pages. A publicly hosted Node demo is not in 1.0; it can be added later without changing the
   site.
6. **Windows host: where do NVDA (A5), the contrast-theme check (A8) and JAWS (A13) run?** ANSWERED (owner,
   2026-11-17): a local Windows virtual machine run by the maintainer before each minor release and 1.0; in addition,
   a spec-time probe of Guidepup driving NVDA on a GitHub-hosted Windows runner (free on this public repo), kept in CI
   only if reliable. JAWS stays "should" until a JAWS licence exists on that machine.
7. **Sticky layout: design D (document scrolls) or design R (region scrolls)?** ANSWERED (owner, 2026-11-17): D, the
   page scrolls. One scroller (touch, find-in-page and the screen reader behave as on any page), no focus stop that
   scrolls nothing, and it is how the earlier table that is being ported already works. R is not in 1.0; it is on the later
   list as PRD-X5 for app-shell layouts.

**All seven questions are answered.** The requirements above carry the answers; nothing in this document waits on
an open question.

## 9. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | A Svelte upgrade emits static `style` attributes or changes template internals. | S1 on every pull request and Dependabot bump, three engines, client and server rendered. |
| R2 | Trusted Types cannot be met because of Svelte itself. | S6 measures first; no claim before. |
| R3 | jsdom differs from engines for focus, layout and scroll. | Those statements are BT in three engines. |
| R4 | Screen readers announce sort, live regions and separators differently. | A5 with expected announcements; findings become statements. |
| R5 | Tab cost of the table pattern (figures in A9). | Skip link (A9); revisit only if editing arrives (non-goal). |
| R6 | Consumers forget `@source` or build class names. | T2 fallbacks; T3 literals; D1 shows the line. |
| R7 | Effort (excluding B20-B22, P4, P5, D8 and W11, added after this estimate): 109 statements plus about 40-70 for the uncovered musts (INFERRED), at the method's unmeasured 60-120 min each: about 150-360 hours. An earlier estimate, made before this PRD, was 12-18 plan-days. | Reported, never a reason to cut; the ledger measures. The reuse decision lowers it: about 1,300 lines of table code and 1,700 lines of tests are ported instead of rewritten (READ, a count of the owner's earlier table); the plan re-prices after the spec. |
| R8 | One maintainer for a public package. | Narrow support promise (Q4); full trace and mutation. |
| R9 | Scope creep toward a grid, or the site toward an app. | Non-goals; a new page or feature needs a requirement here. |
| R10 | CI timing differs between runners and engines; a flaky browser test. | P2 calibrates on the runner class with a planted slowdown; a flake is a defect to find, never re-run away. |
| R11 | The browser floor is not run, only checked statically; WebKit has no rendered forced-colours proof. | Stated in the support and accessibility statements (E1, D3). |
| R12 | Guidepup on hosted runners proves unreliable. | The Windows host of Q6 is the baseline; CI is an addition. |
| R13 | A StrykerJS move to Svelte's modern AST, or Svelte 6, changes what is mutated. | Pinned version; the recorded per-file mutant counts of G2 fail an upgrade that drops mutants. |
| R14 | The DataTables server-side protocol changes in a new major. | W11's fixtures name the major they record; the connection helper's spec names the major it covers; a new major is a new recording and a new spec part. |
| R15 | Client-side processing of 100,000 rows blocks the main thread or holds too much memory on a modest device. | P4 budgets 10,000 rows; 100,000 is measured and published as beyond the recommended size, and the documentation advises server-side processing above it. |
| R16 | A backend answers differently from the recorded fixtures (W11). | The helper reports what it cannot map as a failure (`onerror`) instead of showing wrong rows; a new backend is a new recording. |

## 10. Trace

The two-way trace (every spec statement to a requirement, every must requirement to its statements) lives in
`spec/` once the specs exist (issues #9 to #11), where the method's trace check verifies it. This repository holds no
earlier draft to trace against.
