# DataTable: component spec

- **Name:** `DataTable`, the table component of SvelteDT (`@hniedner/sveltedt`). The pager, `Pagination`, gets its
  statements in a later group.
- **Status:** group 1 of the component spec. Later groups add sort, filter, pager, column chooser, selection, sticky
  layout, the strict-policy proofs, large pages and theming to this file.
- Field names: no
- **Scope:** the statements a read-only table needs: rows in the given order with text or snippet cells, the
  loading, failed, empty and busy states, the invalid-input alert, the `heading` and `actions` snippets, the words as
  props, the APG table pattern, no global footprint, and theming by prefixed tokens.

The component renders one page of rows in the order the server gives, as a native HTML table following the WAI-ARIA
APG *table* pattern (not *grid*). It owns no data. It shows what its props say, and every user action is reported
to the consumer as one callback (from group 2 on).

## Conventions

- **Statement form.** Each statement is one observable behaviour: an id, one MUST or MUST NOT sentence, an example
  (or an example table: the test runs every row), the reason, the test layer and a `Traces:` line naming the
  requirements of `docs/PRD.md` it serves. It says what happens, never how. Each test carries its statement's id and
  a hash of the statement text.
- **Test layers.**
  - **component**: the component mounted in a simulated DOM, queried through roles, accessible names and visible
    text only. No test ids and no internals.
  - **real browser**: the component mounted on a test-site page in a real engine, in Chromium, Firefox and WebKit
    unless the statement names fewer and says why. Used for what needs an engine: layout, scrolling, focus
    indicators, hover, axe.
  - **static check**: a scan of the source or the built package, run in the gate, behind a wrapper that must find a
    planted canary.
- **Props used in this group.** `rows`; `columns`, each with `id`, `label` and either `value(row)` (text) or `cell`
  (a snippet); `getRowId(row)`; `caption`; `regionLabel`; `status` (`'loading'`, `'failed'` or `'ready'`); `busy`;
  `messages` (the words); the snippets `heading` and `actions`. Later groups add their own props.
- **The region** is the element with `role="region"` that holds the table (A11Y-09). **The alert** is the alert of
  RND-05. **The live count** is the polite live region of A11Y-05.
- **Shown columns.** In this group every given column is shown; column hiding arrives with the column group.
- **"Emits X once"** (used from group 2 on) means the callback prop `X` is called exactly once for that user action
  and no other callback is called.
- **Words.** Quoted words are the English defaults. Every fixed word is a prop (RND-06).
- **Data.** Example data is synthetic: rows such as `{ id: 'r1', name: 'Beta' }`.
- **Ids.** A statement keeps its id while its meaning stays, also when it is narrowed. A new or split-off behaviour
  takes the next free number in its group. A requirement id from `docs/PRD.md` is written `PRD-B1`.
- **Before its test.** A statement may land before the test that proves it. Until that test runs and passes, the
  trace check lists the statement as "not yet tested", never as a pass; an untested statement blocks the close of its
  milestone and every release.

---

## 1. Rendering and cells (RND)

**RND-01** The table MUST render the rows in exactly the order given, and MUST NOT sort, filter or slice them.
- Examples (the test runs every row):

  | Rows given | Body rows shown, in order |
  |---|---|
  | r3 "Gamma", r1 "Alpha", r2 "Beta" | r3, r1, r2 |
  | r1 "Beta", r2 "Beta", r3 "" | r1, r2, r3 |
  | 25 rows r01 ... r25 | the same 25 rows, r01 first, r25 last |

- Reason: the server orders and pages the rows; a reorder or a cut in the browser would show rows the server did not
  put there.
- Layer: component.
- Traces: PRD-B1.

**RND-02** A column with a `cell` snippet MUST render that snippet, called with the row and the column id, in each of
its cells.
- Example: a `cell` snippet that renders a link "Open Beta" for row r1 and the column id `name` shows that link in
  r1's `name` cell, and the snippet received `(r1, 'name')`.
- Reason: links, badges and cell menus belong to the consumer, so the table needs no knowledge of what a value means.
- Layer: component.
- Traces: PRD-B3.

**RND-08** A column without a `cell` snippet MUST render `value(row)` as the cell's text.
- Example: the column `{ id: 'name', label: 'Name', value: (r) => r.name }` shows "Beta" in row r1.
- Reason: most columns are plain text and should not need a snippet each.
- Layer: component.
- Traces: PRD-B3.

**RND-03** Every text the table is given MUST render as text, never as markup.
- Examples (the test runs every row, once with the value `<img src=x onerror=alert(1)>` and once with `<none>`):

  | Prop that carries the text |
  |---|
  | `caption` |
  | `regionLabel` |
  | a column `label` |
  | a default cell (`value(row)`) |
  | each entry of `messages`, the returned text of `rowCount` included |

  In every row the literal text appears on the page or in the accessible name, and the component holds no `img`
  and no `none` element. Later groups add their props to this table.
- Reason: the values come from a server and may hold anything; any markup path is a cross-site scripting path.
- Layer: component.
- Traces: PRD-S2.

**RND-04** The component source MUST NOT contain a raw-HTML path.
- Example: a scan of `src/lib` for `{@html`, `innerHTML`, `outerHTML` and `insertAdjacentHTML` finds none; a canary
  file holding `{@html x}` is found.
- Reason: RND-03 sweeps the props that exist; the scan also covers every prop added later.
- Layer: static check.
- Traces: PRD-S2.

**RND-05** For invalid input the table MUST render one alert with a fixed message instead of the table.
- Examples (the test runs every row: one element with `role="alert"` holding the default text, and no `table`
  element):

  | Invalid input | Message key | Alert text (default) |
  |---|---|---|
  | `caption` is empty or blank | `captionEmpty` | "Table caption must not be empty." |
  | `regionLabel` is empty or blank | `regionLabelEmpty` | "Table region label must not be empty." |
  | `columns` is empty | `noColumns` | "Table has no columns." |
  | a column id is empty | `columnIdEmpty` | "A column id is empty." |
  | two columns share an id | `columnIdDuplicate` | "Two columns share an id." |
  | a column label is empty | `columnLabelEmpty` | "A column label is empty." |
  | a column has neither `value` nor `cell` | `columnContentMissing` | "A column has no value and no cell." |
  | two rows share an id | `rowIdDuplicate` | "Two rows share an id." |
  | a row id is empty or blank | `rowIdEmpty` | "A row id is empty." |
  | `getRowId` throws | `rowIdUnreadable` | "A row id could not be read." |

  Later groups add the rows for their own props (sort, filters, hidden columns).
- Reason: a wrong table is worse than none; the user would read, and later select or export, the wrong rows.
- Layer: component.
- Traces: PRD-B16, PRD-B3.

**RND-09** The alert MUST hold no value taken from the rows, the column definitions or a thrown error.
- Examples (the test runs every row):

  | Invalid input | Text that must not appear in the alert |
  |---|---|
  | two rows with id `r2`, the second named "Hidden-77" | "r2", "Hidden-77" |
  | a `getRowId` that throws an error saying "token-9" | "token-9" |
  | two columns with id `col-x9` | "col-x9" |
  | a column with id `col-y7` and an empty label | "col-y7" |

- Reason: alerts are often logged or screenshotted, and row values may be confidential.
- Layer: component.
- Traces: PRD-S4, PRD-B16.

**RND-10** While the alert is shown, the `heading` snippet MUST still render.
- Example: `columns []` with a `heading` snippet holding the heading "Orders": the heading "Orders" is on the page
  beside the alert.
- Reason: the user still knows which table failed. The actions stay too (EXP-02), so there is a way back.
- Layer: component.
- Traces: PRD-B16.

**RND-06** Every fixed word the table shows or announces MUST come from a prop with an English default.
- Examples (the test runs every row; it passes a full `messages` object of non-English words, then checks that each
  replacement appears where the row says and that no English default is left on the page, in an accessible name or
  in a description):

  | Message | English default | Shown by |
  |---|---|---|
  | `loading` | "Loading data…" | STATE-01 |
  | `failed` | "The rows could not be loaded." | STATE-02 |
  | `empty` | "No records." | STATE-03 |
  | `rowCount` (a function of the count) | "2 rows displayed" for 2 rows; "1 row displayed" for 1 row | A11Y-05 |
  | each alert message of RND-05 | its default in RND-05 | RND-05 |

  For example `messages={{ loading: 'Laden…' }}` shows "Laden…" while `status` is `loading`, and
  `rowCount: (n) => n + ' Zeilen'` makes the live count say "2 Zeilen". Later groups add their words to this table.
- Reason: consumers translate and reword without forking the component.
- Layer: component.
- Traces: PRD-I1.

**RND-07** A column that is not sortable MUST NOT show a sort button.
- Example: the columns Name and Note, neither configured as sortable: no button whose name starts with "Sort by"
  exists, and neither header cell holds a button. (The sort group adds the positive half: a sortable column shows its
  sort button.)
- Reason: a control that does nothing misleads.
- Layer: component.
- Traces: PRD-B3.

**RND-11** A column without a filter MUST NOT show a filter button.
- Example: the columns Name and Note, neither with a filter: no button whose name starts with "Filter" exists. (The
  filter group adds the positive half.)
- Reason: a control that does nothing misleads.
- Layer: component.
- Traces: PRD-B3.

**RND-12** The "Reset table" button MUST NOT be shown while no column is sortable or has a filter.
- Example: two columns with neither: no button "Reset table" exists, in any state of STATE-01..05. (The filter group
  adds the positive half.)
- Reason: read-only tables are a common use and should carry no dead controls.
- Layer: component.
- Traces: PRD-B3.

## 2. States (STATE)

**STATE-01** With `status 'loading'`, the table MUST show the loading message and MUST NOT show the empty message.
- Example: `status 'loading'`, `rows []`: "Loading data…" is shown and "No records." is not.
- Reason: "no records" before the answer arrives is a false statement about the data.
- Layer: component.
- Traces: PRD-B15.

**STATE-02** With `status 'failed'`, the table MUST show the failed message and MUST NOT show the empty message.
- Example: `status 'failed'`, `rows []`: "The rows could not be loaded." is shown and "No records." is not.
- Reason: a failure is not an empty result, and the user must know to try again.
- Layer: component.
- Traces: PRD-B15.

**STATE-03** With `status 'ready'` and no rows, the body MUST show the empty message in one cell that spans every
shown column.
- Example: three columns, `rows []`: one body cell with `colspan="3"` holding "No records.". (The selection group
  adds the row where the selection column is counted too.)
- Reason: a message squeezed into one column reads as a value in that column.
- Layer: component.
- Traces: PRD-B15.

**STATE-04** The table's `aria-busy` MUST be "true" exactly while `busy` is true or `status` is `loading`, and "false"
otherwise.
- Examples (the test runs every row; the region carries no `aria-busy` in any row):

  | `status` | `busy` | The table's `aria-busy` |
  |---|---|---|
  | `ready` | false | "false" |
  | `ready` | true | "true" |
  | `loading` | false | "true" |
  | `failed` | false | "false" |

  A rerender from the second row to the first turns "true" into "false".
- Reason: assistive technology learns that the content is about to change.
- Layer: component.
- Traces: PRD-B15.

**STATE-05** While `busy` is true, the table MUST keep showing the rows it was given.
- Example: 25 rows with `status 'ready'` and `busy true`: 25 body rows are shown.
- Reason: the user keeps their context while the next page loads.
- Layer: component.
- Traces: PRD-B2, PRD-B1.

## 3. Keyboard and screen reader: the APG table pattern (A11Y)

**A11Y-01** The table MUST be a native `table` element named by a `caption` element holding the `caption` prop.
- Example: `caption="Orders"` gives `getByRole('table', { name: 'Orders' })`, and that table's first child is a
  `caption` holding "Orders".
- Reason: a native table keeps the screen reader's own table commands, and the caption names it.
- Layer: component.
- Traces: PRD-A2.

**A11Y-13** The caption MUST be hidden visually and stay in the accessibility tree.
- Example: `caption="Orders"`: the caption's bounding box is at most 1 by 1 CSS px, and the table's accessible name
  is still "Orders".
- Reason: the consumer's `heading` snippet is the visible title; a second visible title would repeat it.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A2.

**A11Y-09** The table MUST sit inside a `role="region"` named by `regionLabel`.
- Example: `regionLabel="Orders table"` gives `getByRole('region', { name: 'Orders table' })`, which contains the
  table.
- Reason: the region names the part of the page that scrolls sideways and is the place a keyboard user scrolls it
  from (A11Y-12).
- Layer: component.
- Traces: PRD-A2.

**A11Y-12** The region MUST be in the Tab order exactly while it is a scroll container whose content overflows.
- Examples (the test runs every row; "in the Tab order" means Tab from the focusable element just before the table
  lands on the region):

  | Page | Region in the Tab order |
  |---|---|
  | 3 short columns in a 1280 px wide viewport (the table fits) | no |
  | 30 columns at least 120 px wide in a 600 px wide viewport (the table overflows) | yes |
  | the 30-column table, then the viewport widened to 4000 px without a remount | no |
  | the 3-column table in a 600 px viewport, then rerendered with 30 columns | yes |

  (The sticky group adds the row for `stickyHeader`, where the region is no scroll container and so never a stop.)
- Reason: a keyboard user needs a focus stop to scroll a wide table, and a stop that scrolls nothing is noise.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A2, PRD-A3.

**A11Y-08** While the region is in the Tab order and has focus, the arrow keys MUST scroll it horizontally.
- Example: the 30-column table of A11Y-12 in a 600 px viewport: Tab to the region, press ArrowRight three times, and
  the region's `scrollLeft` grows; press ArrowLeft and it shrinks.
- Reason: a keyboard user can reach the columns that do not fit (WCAG 2.1.1).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A3, PRD-A2.

**A11Y-02** Every column header MUST be a `th` with `scope="col"`.
- Example: three columns give three `th` elements in the header row, each with `scope="col"`. (The selection group
  adds the row for the selection column's header.)
- Reason: the screen reader reads each cell with its column header.
- Layer: component.
- Traces: PRD-A2.

**A11Y-04** The table MUST follow the APG table pattern and not the grid pattern: no element of the component has the
role `grid`, `treegrid` or `gridcell`, and no row, header cell or cell is focusable.
- Example: 25 rows with a `cell` snippet holding a link: no element has one of those roles, and no `tr`, `th` or
  `td` has a `tabindex`. The links in the cells are the consumer's and stay in the Tab order.
- Reason: the data is read-only, so the table pattern fits; the grid pattern would take over the arrow keys a screen
  reader uses to move through a table.
- Layer: component.
- Traces: PRD-A2.

**A11Y-10** The Tab order MUST follow the reading order: the `heading` and `actions` snippets' controls, then the
region while it is a stop, then the controls in the cells row by row, each row from its first column to its last.
- Example: a table that fits its viewport, an `actions` snippet holding "Export", and a `cell` snippet holding a link
  "Open <name>" in the first of two columns and "Edit <name>" in the second, for rows Beta and Gamma: Tab from the
  start reaches "Export", "Open Beta", "Edit Beta", "Open Gamma", "Edit Gamma". (Later groups add their controls to
  this order.)
- Reason: keyboard users meet the controls in the order they see them (WCAG 2.4.3).
- Layer: component.
- Traces: PRD-A3.

**A11Y-05** A polite live region MUST state the row count exactly when `status` is `ready` and `busy` is false.
- Examples (the test runs every row; two rows; in every row the live region is in the document, so a later count is
  announced):

  | `status` | `busy` | Live count |
  |---|---|---|
  | `ready` | false | "2 rows displayed" |
  | `ready` | true | empty |
  | `loading` | false | empty |
  | `failed` | false | empty |

- Reason: a count announced while the next answer is on its way, or after a failure, would be wrong.
- Layer: component.
- Traces: PRD-A4.

**A11Y-14** The loading message MUST be inside a polite live region that was in the document before `status` became
`loading`.
- Example: rerender from `status 'ready'` to `status 'loading'`: "Loading data…" appears inside an element with
  `role="status"` or `aria-live="polite"`, and that element was in the document before the rerender.
- Reason: a live region only announces changes to content it already held, so the user hears that loading started.
- Layer: component.
- Traces: PRD-A4.

**A11Y-15** The failed message MUST be inside an element with `role="alert"`.
- Example: rerender from `status 'loading'` to `status 'failed'`: `getByRole('alert')` holds "The rows could not be
  loaded.".
- Reason: a failure must be announced at once, not only when the user reaches the table.
- Layer: component.
- Traces: PRD-A4, PRD-B15.

**A11Y-16** Hovering or focusing any part of the table MUST NOT make content appear, other than the focused element's
own focus indicator.
- Example: the 30-column, 25-row table with a link in one column: hover every header cell and every body cell in turn,
  and focus the region and each link; after each step the page's visible text and the set of visible elements equal
  those before the step. (The skip-link group adds its exception: the skip link becomes visible on focus.)
- Reason: content that appears on hover or focus can cover what the user reads and must be dismissable; showing none
  meets WCAG 1.4.13 by design.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A10, PRD-A1.

**A11Y-07** The region MUST show a visible focus indicator when it is focused by keyboard.
- Example: the 30-column table of A11Y-12: Tab to the region; its computed outline is not `none` and differs from its
  unfocused outline. (Later groups add their controls.)
- Reason: keyboard users must see where they are (WCAG 2.4.7).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A1.

**A11Y-06** axe MUST find no serious or critical violation in any state of the table.
- Examples (the test runs every row, at scroll 0; an axe *incomplete* item is listed for the maintainer's manual
  "contrast review of the listed nodes" and never counts as a pass):

  | State |
  |---|
  | `status 'loading'` |
  | `status 'failed'` |
  | `status 'ready'`, no rows |
  | `status 'ready'`, 25 rows with a link in one column |
  | `status 'ready'`, 25 rows, `busy true` |
  | the 30-column table of A11Y-12, region focused |
  | the alert of RND-05, with a `heading` and an `actions` snippet |

  Later groups add their states.
- Reason: an automated check catches regressions in names, roles and contrast that the statements above do not name.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A1.

## 4. Actions snippet and export (EXP)

**EXP-02** The `actions` snippet MUST render in every state.
- Examples (the test runs every row; the snippet holds an "Export" button):

  | State |
  |---|
  | `status 'loading'` |
  | `status 'failed'` |
  | `status 'ready'`, no rows |
  | `status 'ready'`, with rows |
  | the alert of RND-05 |

- Reason: export and batch menus live there, and they must stay reachable, also as the way back from a bad state.
- Layer: component.
- Traces: PRD-B17, PRD-B16.

**EXP-01** The component MUST offer no built-in export and MUST NOT start a download.
- Example: during mount, a rerender through every state of EXP-02, and a Tab through the table, `URL.createObjectURL`
  is not called and no `a[download]` element appears.
- Reason: file formats, formula-injection guards and file names are the consumer's policy; the consumer already holds
  the rows it needs.
- Layer: component.
- Traces: PRD-B17, PRD-S3.

## 5. No global footprint (FOOT)

**FOOT-01** Mounting, rerendering and unmounting the table MUST leave the root element's attributes and inline style
unchanged.
- Example: snapshot the attributes and the inline style of `document.documentElement`; mount the table, rerender it
  through `loading`, `failed`, `ready` with rows, `ready` with `busy true` and the alert, then unmount it: after mount,
  after each rerender and after unmount, both equal the snapshot.
- Reason: the root element belongs to the app; a component that writes there fights the app's own layout and other
  components.
- Layer: component.
- Traces: PRD-B19.

**FOOT-02** While mounted and after unmount, the table MUST hold no event listener on `document` or `window` beyond
those Svelte adds for any component.
- Example: before the first mount, wrap `addEventListener` and `removeEventListener` on `document` and `window`; mount
  and unmount an empty Svelte component with the same event types to measure Svelte's own delegated listeners, which
  are excluded. Then mount the table through the states of FOOT-01: while it is mounted, the listeners added minus
  those removed, per target and event type, are none; after unmount, likewise none.
- Reason: a global listener outlives the component or fights the app's own handlers.
- Layer: component.
- Traces: PRD-B19.

**FOOT-03** Mounting the table, giving it new rows, changing its state and unmounting it MUST NOT scroll the window.
- Example: a test page whose table sits in a wrapper of fixed height between two 2000 px spacers, with
  `overflow-anchor: none`; the window starts scrolled to 1200 px. Mount the table, give it a new set of 20 rows (the
  row count stays 20), rerender it through `loading`, `ready` and `busy true` to `busy false`, then unmount it: after
  each step the window's `scrollX` and `scrollY` are unchanged.
- Reason: users keep their place; a table that scrolls the page to itself on every new page takes the reader away
  from what they were reading.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B19, PRD-A3.

---

## 6. Theming (THEME)

The component's look comes from prefixed custom properties the consumer may define. Without them it falls back to
the browser's system colours and stays usable.

**THEME-01** Every colour, border-colour and surface class in the component source MUST be a complete literal class
whose value reads a `--sdt-*` custom property with a CSS system-colour fallback.
- Examples (the scan runs every row against a canary file holding it; the first two are refused, the third passes):

  | Class in a canary file | Result |
  |---|---|
  | `bg-blue-500` (a palette class) | finding |
  | `` bg-[${tone}] `` (a class built at run time) | finding |
  | `bg-[var(--sdt-surface,Canvas)]` | pass |

  The scan over `src/lib` finds no finding, and it reports how many class literals it read (more than 0).
- Reason: prefixed names cannot collide with an application's tokens, and Tailwind only generates classes it finds as
  complete literals in the source; a palette class would ignore the consumer's theme.
- Layer: static check.
- Traces: PRD-T1.

**THEME-02** The token table in the documentation MUST list exactly the `--sdt-*` names the component's class literals
use.
- Example: a class literal reading `--sdt-border` with no `--sdt-border` row in the table is a finding; a table row
  `--sdt-unused` that no class reads is a finding.
- Reason: the token names are public interface; a list kept by hand drifts from the code unless a check compares
  them.
- Layer: static check.
- Traces: PRD-T1.

**THEME-03** With no `--sdt-*` property defined, the table MUST stay usable: its text readable, every focus indicator
visible, and axe finding no serious or critical violation.
- Example: the list page with Tailwind and no token definitions, in each state of A11Y-06: axe reports 0 serious or
  critical violations, and a keyboard-focused control's outline is not `none`.
- Reason: the system-colour fallbacks are what make "usable without tokens" true; a consumer who themes nothing must
  get a plain table, not a broken one.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T2, PRD-A1.

**THEME-04** The package MUST ship no CSS file and no `<style>` block.
- Example: the packed package holds no `.css` file and no `.svelte` file with a `<style>` block; a canary `.svelte`
  file with a `<style>` block is found.
- Reason: there is one stylesheet build per application (the consumer's Tailwind, which adds the package as an
  `@source`), and a shipped stylesheet could not follow the consumer's tokens.
- Layer: static check.
- Traces: PRD-T3.

**THEME-05** The component's class literals MUST use only Tailwind's built-in variants.
- Example: `hover:`, `focus-visible:`, `dark:` and `forced-colors:` pass; a canary class `app-dense:p-1` is a
  finding.
- Reason: a custom variant needs a matching definition in the consumer's stylesheet, which a consumer would have to
  know about and copy.
- Layer: static check.
- Traces: PRD-T3.

## Trace for group 1

### Statement -> PRD

| Statement | PRD ids |
|---|---|
| RND-01 | PRD-B1 |
| RND-02 | PRD-B3 |
| RND-08 | PRD-B3 |
| RND-03 | PRD-S2 |
| RND-04 | PRD-S2 |
| RND-05 | PRD-B16, PRD-B3 |
| RND-09 | PRD-S4, PRD-B16 |
| RND-10 | PRD-B16 |
| RND-06 | PRD-I1 |
| RND-07 | PRD-B3 |
| RND-11 | PRD-B3 |
| RND-12 | PRD-B3 |
| STATE-01 | PRD-B15 |
| STATE-02 | PRD-B15 |
| STATE-03 | PRD-B15 |
| STATE-04 | PRD-B15 |
| STATE-05 | PRD-B2, PRD-B1 |
| A11Y-01 | PRD-A2 |
| A11Y-13 | PRD-A2 |
| A11Y-09 | PRD-A2 |
| A11Y-12 | PRD-A2, PRD-A3 |
| A11Y-08 | PRD-A3, PRD-A2 |
| A11Y-02 | PRD-A2 |
| A11Y-04 | PRD-A2 |
| A11Y-10 | PRD-A3 |
| A11Y-05 | PRD-A4 |
| A11Y-14 | PRD-A4 |
| A11Y-15 | PRD-A4, PRD-B15 |
| A11Y-16 | PRD-A10, PRD-A1 |
| A11Y-07 | PRD-A1 |
| A11Y-06 | PRD-A1 |
| EXP-02 | PRD-B17, PRD-B16 |
| EXP-01 | PRD-B17, PRD-S3 |
| FOOT-01 | PRD-B19 |
| FOOT-02 | PRD-B19 |
| FOOT-03 | PRD-B19, PRD-A3 |
| THEME-01 | PRD-T1 |
| THEME-02 | PRD-T1 |
| THEME-03 | PRD-T2, PRD-A1 |
| THEME-04 | PRD-T3 |
| THEME-05 | PRD-T3 |

### PRD must -> statements (the musts group 1 touches)

"In full" means group 1 holds every statement the requirement needs; "in part" names what later groups add.

| PRD id | Statements | Coverage |
|---|---|---|
| PRD-B1 | RND-01, STATE-05 | in part: the sort group adds the row where a `sort` prop is given and the order is still kept |
| PRD-B2 | STATE-05 | in part: one callback per action and the internal-state list arrive with the groups that add actions |
| PRD-B3 | RND-02, RND-08, RND-05, RND-07, RND-11, RND-12 | in part: the sort and filter groups add the positive halves (a configured control appears) |
| PRD-B15 | STATE-01, STATE-02, STATE-03, STATE-04, A11Y-15 | in full ("no count" while failed is A11Y-05) |
| PRD-B16 | RND-05, RND-09, RND-10, EXP-02 | in full for the props of group 1; later groups add their rows to RND-05 |
| PRD-B17 | EXP-02, EXP-01 | in full |
| PRD-B19 | FOOT-01, FOOT-02, FOOT-03 | in part: the dialog groups add the one passive outside-press listener and the Escape rule |
| PRD-A1 | A11Y-06, A11Y-07, A11Y-16 | in part: the remaining criteria of PRD section 4.3 arrive with the controls they concern |
| PRD-A2 | A11Y-01, A11Y-13, A11Y-09, A11Y-12, A11Y-08, A11Y-02, A11Y-04 | in part: the sort group adds `aria-sort` on the lead column; the sticky group adds the `stickyHeader` row of A11Y-12 |
| PRD-A3 | A11Y-12, A11Y-08, A11Y-10, FOOT-03 | in part: focus after an intent and the no-scroll rule for intents arrive with the intents |
| PRD-A4 | A11Y-05, A11Y-14, A11Y-15 | in part: the column group adds the column-move announcement |
| PRD-A10 | A11Y-16 | in part: the skip-link and dialog groups add their rows |
| PRD-I1 | RND-06 | in part: later groups add their words to the RND-06 table |
| PRD-S2 | RND-03, RND-04 | in part: later groups add their props to the RND-03 table |
| PRD-S3 | EXP-01 | in part: no network request, cookie or web storage arrive with the strict-policy group |
| PRD-S4 | RND-09 | in part: the filter group's refusal messages and the pager's alert add rows |
| PRD-T1 | THEME-01, THEME-02 | in full |
| PRD-T2 | THEME-03 | in part: the sticky group adds "the header is opaque over rows" |
| PRD-T3 | THEME-04, THEME-05 | in full ("the consumer adds `@source`" is shown by the consumer project, PRD-W8) |

### PRD musts group 1 leaves to later groups

- Sort: PRD-B4, PRD-B5.
- Filter and criteria: PRD-B6, PRD-B7, PRD-B8.
- Pager: PRD-B9.
- Columns (chooser, reorder, resize): PRD-B10, PRD-B11, PRD-B12.
- Selection: PRD-B13.
- Sticky layout: PRD-B14.
- Ids across instances and hydration: PRD-B18.
- Accessibility beyond the read-only table: PRD-A5, PRD-A6, PRD-A7, PRD-A8, PRD-A9, PRD-A11, PRD-A12.
- Strict policy and side effects: PRD-S1.
- Theming: PRD-T4 (the example token set, light and dark).
- Internationalisation: PRD-I2, PRD-I3.
- Large pages and size: PRD-P1, PRD-P2, PRD-P3.
- Browsers: PRD-E1.
- Packaging: PRD-K1, PRD-K2, PRD-K3, PRD-K4.
- Gate: PRD-G1, PRD-G2, PRD-G3.
- Documentation: PRD-D1, PRD-D2, PRD-D3, PRD-D4, PRD-D5, PRD-D6, PRD-D7.
- Licence: PRD-L1.
- Supply chain and publishing: PRD-S5, PRD-S7.
- Test site and consumer project: PRD-W1, PRD-W2, PRD-W3, PRD-W4, PRD-W5, PRD-W6, PRD-W7, PRD-W8, PRD-W9, PRD-W10.
