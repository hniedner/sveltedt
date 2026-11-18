# DataTable and Pagination: component spec

- **Name:** `DataTable`, the table component of SvelteDT (`@hniedner/sveltedt`), and `Pagination`, its separate
  pager (section 7).
- **Status:** groups 1 and 2 of the component spec. Later groups add filter, column chooser, selection, sticky
  layout, the strict-policy proofs, large pages and theming to this file.
- Field names: no
- **Scope:** group 1: the statements a read-only table needs: rows in the given order with text or snippet cells, the
  loading, failed, empty and busy states, the invalid-input alert, the `heading` and `actions` snippets, the words as
  props, the APG table pattern, and no global footprint. Group 2: server-driven multi-column sort, the pager, ids
  that stay unique per instance and across hydration, numbers through replaceable functions, and no window scroll
  after a sort or pager intent.

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
    unless the statement names fewer and says why. Used for what needs an engine: layout, scrolling,
    focus (the simulated DOM differs from engines there), focus indicators, hover, axe, time bounds.
  - **static check**: a scan of the source or the built package, run in the gate, behind a wrapper that must find a
    planted canary.
- **Props used in groups 1 and 2.** `rows`; `columns`, each with `id`, `label` and either `value(row)` (text) or `cell`
  (a snippet); `getRowId(row)`; `caption`; `regionLabel`; `status` (`'loading'`, `'failed'` or `'ready'`); `busy`;
  `messages` (the words); the snippets `heading` and `actions`. Group 2 adds to `DataTable`: `sort` (the order, a
  list of `{ id, desc }`, lead first), a column's `sortable` (the directions it allows, `'asc'` and/or `'desc'`) and
  `onsort(next)`; and the props of `Pagination`: `offset`, `limit`, `total`, `label`, `sizes`, `messages`,
  `onpage(offset)` and `onsize(n)`. Later groups add their own props.
- **Orders in examples** are written `[code asc, name desc]`: the lead first; `asc` is `{ desc: false }`. Column
  Name has id `name`, Code has id `code`, Date has id `date`. Every sortable column in an example allows both
  directions unless the row says otherwise. An example with a sortable column passes an `onsort`; an example pager
  passes an `onpage`, and an `onsize` when it has `sizes`.
- **Pager places.** The pager shows page numbers and gaps; each counts as one place. "Page n" is a page number
  button. A row such as `1 … 4 5 6 … 20` lists the places in order.
- **The region** is the element with `role="region"` that holds the table (A11Y-09). **The alert** is the alert of
  RND-05. **The live count** is the polite live region of A11Y-05.
- **Shown columns.** In groups 1 and 2 every given column is shown; column hiding arrives with the column group.
- **"Emits X once"** (used from group 2 on) means the callback prop `X` is called exactly once for that user action
  and no other callback is called.
- **Words.** Quoted words are the English defaults. Every fixed word is a prop (RND-06, PAGE-19).
- **Data.** Example data is synthetic: rows such as `{ id: 'r1', name: 'Beta' }`.
- **Ids.** A statement keeps its id while its meaning stays, also when it is narrowed. A new or split-off behaviour
  takes the next free number in its group; SORT-07, SORT-08 and A11Y-11 are reserved for the draft statements of
  those numbers, which later groups write. A requirement id from `docs/PRD.md` is written `PRD-B1`.

---

## 1. Rendering and cells (RND)

**RND-01** The table MUST render the rows in exactly the order given, and MUST NOT sort, filter or slice them.
- Examples (the test runs every row):

  | Rows given | Body rows shown, in order |
  |---|---|
  | r3 "Gamma", r1 "Alpha", r2 "Beta" | r3, r1, r2 |
  | r1 "Beta", r2 "Beta", r3 "" | r1, r2, r3 |
  | 25 rows r01 ... r25 | the same 25 rows, r01 first, r25 last |
  | r3 "Gamma", r1 "Alpha", r2 "Beta", Name sortable, `sort` `[name asc]`, `onsort` given | r3, r1, r2 |

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
  | each entry of `messages`, the returned text of every function included |

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
  | a column's `sortable` lists no direction, or a direction other than `asc` and `desc` | `sortableInvalid` | "A column's sort directions are invalid." |
  | a column is sortable and `onsort` is not given | `sortHandlerMissing` | "A sortable column has no sort handler." |
  | `sort` names a column that is not configured | `sortColumnUnknown` | "The sort names an unknown column." |
  | `sort` names a column that is not sortable | `sortColumnNotSortable` | "The sort names a column that cannot be sorted." |
  | `sort` gives a column a direction it does not allow | `sortDirectionNotAllowed` | "The sort uses a direction a column does not allow." |
  | `sort` names a column twice | `sortColumnDuplicate` | "The sort names a column twice." |

  Later groups add the rows for their own props (filters, hidden columns).
- Reason: a wrong table is worse than none; the user would read, and later select or export, the wrong rows.
- Layer: component.
- Traces: PRD-B16, PRD-B3.

**RND-09** The alert MUST hold no value taken from the rows, the column definitions, the `sort` prop or a thrown
error.
- Examples (the test runs every row):

  | Invalid input | Text that must not appear in the alert |
  |---|---|
  | two rows with id `r2`, the second named "Hidden-77" | "r2", "Hidden-77" |
  | a `getRowId` that throws an error saying "token-9" | "token-9" |
  | two columns with id `col-x9` | "col-x9" |
  | a column with id `col-y7` and an empty label | "col-y7" |
  | `sort` `[col-z3 asc]`, no column `col-z3` | "col-z3" |
  | `sort` names the column `col-w4`, labelled "Secret-5", twice | "col-w4", "Secret-5" |

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
  | `sortBy` (a function of the label) | "Sort by Name" for the label "Name" | SORT-09 |
  | `sortRank` (a function of the rank) | "2" for rank 2 | SORT-05, I18N-01 |
  | `sortDescription` (a function of `{ direction, rank }`, SORT-06) | the four descriptions of SORT-06 | SORT-06, I18N-01 |

  For example `messages={{ loading: 'Laden…' }}` shows "Laden…" while `status` is `loading`, and
  `rowCount: (n) => n + ' Zeilen'` makes the live count say "2 Zeilen". Later groups add their words to this table.
- Reason: consumers translate and reword without forking the component.
- Layer: component.
- Traces: PRD-I1.

**RND-07** A column that is not sortable MUST NOT show a sort button.
- Example: the columns Name and Note, neither configured as sortable: no button whose name starts with "Sort by"
  exists, and neither header cell holds a button. (SORT-10 is the positive half.)
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
  this order; the filter group places the sort buttons of group 2 together with "Reset table".)
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

**A11Y-16** Hovering or focusing any part of the table or the pager MUST NOT make content appear, other than the focused element's
own focus indicator.
- Example: the 30-column, 25-row table with a link in one column: hover every header cell and every body cell in turn,
  and focus the region and each link; after each step the page's visible text and the set of visible elements equal
  those before the step. The same holds with three columns sortable and the order `[code asc, name desc]`, hovering
  and focusing each sort button, and for a `Pagination` of 20 pages, hovering and focusing each of its controls.
  (The skip-link group adds its exception: the skip link becomes visible on focus.)
- Reason: content that appears on hover or focus can cover what the user reads and must be dismissable; showing none
  meets WCAG 1.4.13 by design.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A10, PRD-A1.

**A11Y-07** The region and every control of the table and the pager MUST show a visible focus indicator when it is
focused by keyboard.
- Examples (the test runs every row; Tab to the element; its computed outline, or at least one entry of its computed box
  shadow, has a width (outline) or a spread or blur (shadow) of at least 1 CSS px with a colour whose alpha is above
  0, and differs from its unfocused style; a transparent outline fails;
  its contrast is a later statement, PRD-A12):

  | Element |
  |---|
  | the region of the 30-column table of A11Y-12 |
  | "Sort by Name" |
  | each step button and a page number button of a `Pagination` of 20 pages on page 11 |
  | "First page" and "Previous page", both `aria-disabled`, of the same pager on page 1 |
  | the page-size select |

  Later groups add their controls.
- Reason: keyboard users must see where they are (WCAG 2.4.7).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A1.

**A11Y-06** axe MUST find no serious or critical violation in any state of the table and the pager.
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
  | three sortable columns, order `[]` |
  | three sortable columns, order `[code asc, name desc]` |
  | a `Pagination` of 20 pages on page 11, with `sizes` |
  | a `Pagination` with `total 0` |
  | the alert of PAGE-16 |

  Later groups add their states.
- Reason: an automated check catches regressions in names, roles and contrast that the statements above do not name.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A1.

**A11Y-17** A sort press or a pager intent MUST NOT scroll the window.
- Examples (the test runs every row, in the scenario of PRD-A3: the window starts mid-page, the site's test switch
  keeps the row count constant across the intent, the page sets `overflow-anchor: none`; the window's scroll
  position is read before the press and after the consumer's new rows are painted):

  | Intent |
  |---|
  | press "Sort by Name" |
  | Shift+press "Sort by Code" |
  | press each of "First page", "Previous page", "Next page", "Last page" and a page number |
  | choose another page size |

  Later groups add their intents. Break that turns it red: the table calls `scrollIntoView` on its first row when
  new rows arrive, or the pager scrolls itself into view after a press.
- Reason: users keep their place; a jump after a sort or a page change loses it.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A3.

**A11Y-18** A sort button and a pager button MUST act on release: a pointer pressed on it and released off it
MUST emit nothing.
- Examples (the test runs every row, with Name sortable at order `[]` and a pager at `offset 20, limit 10,
  total 95`: pointer down on the button, move off it, pointer up elsewhere; no callback is called; then a full press
  on it emits as its statement says):

  | Button |
  |---|
  | "Sort by Name" (SORT-01) |
  | "Next page" (PAGE-01) |
  | "Page 5" (PAGE-01) |

  Break that turns it red: the button acts on pointer down.
- Reason: a user who presses the wrong button can slide off it to cancel (WCAG 2.5.2).
- Layer: component.
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

## 6. Server-driven sort (SORT)

**SORT-10** A sortable column MUST show exactly one sort button, in its header cell.
- Example: of the columns Name (`sortable: ['asc', 'desc']`) and Note (not sortable), the Name header cell holds one
  button "Sort by Name" and the Note header cell holds none. (RND-07 is the negative half.)
- Reason: the header is where a user looks to change the order of a column.
- Layer: component.
- Traces: PRD-B3, PRD-B4.

**SORT-01** A press on a sort button without Shift MUST emit `onsort` once with the next whole order from this table.
- Examples (the test runs every row):

  | Order before | Press | `onsort` receives |
  |---|---|---|
  | `[]` | Name | `[name asc]` |
  | `[name asc]` | Name | `[name desc]` |
  | `[name desc]` | Name | `[]` |
  | `[code asc]` | Name | `[name asc]` |
  | `[code asc, name desc]` | Name | `[name asc]` |
  | `[name asc, code desc]` | Name | `[name desc]` |

  The rule: if the column leads the order, it moves on to the next direction it allows (ascending before
  descending) and the other columns are dropped; after its last allowed direction it leaves the order. Otherwise it
  becomes the only sorted column, in the first direction it allows. SORT-04 holds the single-direction rows.
- Reason: emitting the whole order means the consumer sends it as is and never merges partial changes.
- Layer: component.
- Traces: PRD-B4, PRD-B2.

**SORT-02** A press on a sort button with Shift MUST emit `onsort` once with an order in which only that column has
moved on one step and every other column keeps its relative order and direction.
- Examples (the test runs every row by Shift+click, Shift+Enter and Shift+Space, and counts one call each):

  | Order before | Shift+press | `onsort` receives |
  |---|---|---|
  | `[code asc]` | Name | `[code asc, name asc]` |
  | `[code asc, name asc]` | Name | `[code asc, name desc]` |
  | `[code asc, name desc]` | Name | `[code asc]` |
  | `[name asc, code asc]` | Name | `[name desc, code asc]` |
  | `[name desc, code asc]` | Name | `[code asc]` |
  | `[]` | Name | `[name asc]` |

  A column not yet in the order joins at the end, in the first direction it allows; after its last allowed direction
  it leaves the order.
- Reason: a user adds or removes a tie-breaker without losing the primary order.
- Layer: component.
- Traces: PRD-B4.

**SORT-03** One press on a sort button without Shift MUST emit exactly one `onsort`.
- Examples (the test runs every row, on Name with order `[]`; the Shift inputs are counted in SORT-02):

  | Input | `onsort` calls |
  |---|---|
  | click | 1 |
  | Enter on the focused button | 1 |
  | Space on the focused button | 1 |

- Reason: two emits are two server requests whose answers can arrive in either order.
- Layer: component.
- Traces: PRD-B2, PRD-B4.

**SORT-04** A press on a column that allows only one direction MUST NOT emit the direction it does not allow.
- Examples (the test runs every row):

  | Date allows | Order before | Press | `onsort` receives |
  |---|---|---|---|
  | `['desc']` | `[]` | Date | `[date desc]` |
  | `['desc']` | `[date desc]` | Date | `[]` |
  | `['desc']` | `[code asc]` | Shift+Date | `[code asc, date desc]` |
  | `['asc']` | `[date asc]` | Date | `[]` |
  | `['asc']` | `[code asc, date asc]` | Shift+Date | `[code asc]` |

  Break that turns it red: a press always steps through ascending and descending.
- Reason: the other direction is one the server would refuse.
- Layer: component.
- Traces: PRD-B4.

**SORT-12** A sort press MUST NOT change what the table shows until the consumer passes a new `sort`.
- Examples (the test runs every row; `onsort` records its call and passes nothing back; Name and Code sortable):

  | Order | Press | Still shown after the press |
  |---|---|---|
  | `[]` | Name | no `aria-sort` on any header; Name's description "H" (SORT-06); Name's hidden content (SORT-13) as before the press |
  | `[name asc]` | Shift+Code | `aria-sort="ascending"` on Name only; Code's description "H"; no rank marks |

  Break that turns it red: the table keeps its own copy of the order and updates it on a press.
- Reason: the table shows only what its props say (PRD-B2); if the server refuses or fails, an order the user did
  not get must not be announced.
- Layer: component.
- Traces: PRD-B2, PRD-B4.

**SORT-11** After a sort button is pressed with Enter, focus MUST stay on that button while the consumer loads and
after it passes the new order and rows, or a failure.
- Examples (the test runs every row; focus "Sort by Name" with order `[]`, press Enter, then the consumer passes the
  props of each step in turn; after every step the focused element is "Sort by Name"):

  | Steps the consumer takes |
  |---|
  | `busy true`; then `sort [name asc]` with 25 new rows and `busy false` |
  | `status 'loading'`; then `sort [name asc]`, 25 new rows and `status 'ready'` |
  | `status 'loading'`; then `status 'failed'` |
  | `sort [name asc]`, then 25 new rows |

- Reason: a keyboard user who sorts twice in a row must not have to find the button again, and focus must never fall
  to the page body (WCAG 2.4.3).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A3.

OPEN: focus after a pointer press. SORT-11 and PAGE-21 press with Enter. WebKit on macOS (Safari) does not focus a
button on a mouse click; WebKit on Linux, which CI runs, does (READ, WebKit's `HTMLFormControlElement`), so a plain
click row could not fail in CI. Proposed: the component focuses the button it acted on, so PRD-A3 holds in every
engine; the test page stops the browser's own focus-on-click (a capturing `mousedown` listener that prevents the
default), which makes the row fail unless the component focuses the button itself. The alternative, naming Safari
as a limit, would change PRD-A3 and PRD-D3 and is the owner's. Layer: real browser.

**A11Y-03** Only the header of the column leading the order MUST carry `aria-sort`.
- Examples (the test runs every row; Code and Name are both sortable):

  | Order | Code header | Name header |
  |---|---|---|
  | `[code asc, name desc]` | `aria-sort="ascending"` | no `aria-sort` |
  | `[name desc]` | no `aria-sort` | `aria-sort="descending"` |
  | `[]` | no `aria-sort` | no `aria-sort` |

  The column group adds the row where the lead column is hidden.
- Reason: the APG sortable table puts `aria-sort` on one header at a time; several would announce conflicting orders.
- Layer: component.
- Traces: PRD-A2.

**SORT-09** A sort button's accessible name MUST be "Sort by <label>" in every sort state.
- Examples (the test runs every row; the Name button):

  | Order | Accessible name |
  |---|---|
  | `[]` | "Sort by Name" |
  | `[name asc]` | "Sort by Name" |
  | `[code asc, name desc]` | "Sort by Name" (not "Sort by Name 2") |

- Reason: the accessible name contains the visible label (WCAG 2.5.3), so voice-control users can say what they see.
- Layer: component.
- Traces: PRD-B5, PRD-A1.

**SORT-13** A sorted header MUST show a direction mark, hidden from assistive technology, whose text or SVG drawing
differs between ascending and descending.
- Examples (the test runs every row on one mount whose `sort` prop changes; the hidden content is the text, and
  every attribute except `class` and `style` of the SVG elements, inside the header cell's `aria-hidden="true"` elements, without the rank of SORT-05):

  | Order | Header | Hidden content compared |
  |---|---|---|
  | `[name asc]` and `[name desc]` | Name | present in both, and different |
  | `[code asc, name desc]` and `[code asc, name asc]` | Name | different (the rank "2" left out) |

  A difference only in a class or a style (a rotation, say) does not count: it does not show in a simulated DOM.

- Reason: sighted users read the direction at a glance; assistive technology gets it from `aria-sort` and the
  description (SORT-06), so the mark is hidden. Its contrast and forced-colours visibility are later statements.
- Layer: component.
- Traces: PRD-B5, PRD-A1.

**SORT-05** While two or more columns are sorted, each sorted header MUST show its rank (1 for the lead) as a
visual mark that is hidden from assistive technology.
- Examples (the test runs every row):

  | Order | Mark on Code | Mark on Name | Mark on Date |
  |---|---|---|---|
  | `[code asc, name desc]` | "1" | "2" | none |
  | `[name desc]` | none | none | none |
  | `[date asc, code asc, name asc]` | "2" | "3" | "1" |

  Each mark is inside an `aria-hidden="true"` element.
- Reason: the rank is needed to read a multi-column order at a glance, and the description (SORT-06) already says it
  in words.
- Layer: component.
- Traces: PRD-B5.

**SORT-06** Each sort button MUST be described by its direction, its rank while two or more columns are sorted, and
how to add a column.
- Examples (the test runs every row; H is "Shift+click, Shift+Enter or Shift+Space adds this column to the sort."):

  | Order | Button | Accessible description |
  |---|---|---|
  | `[name asc]` | Sort by Name | "sorted ascending. H" |
  | `[name desc, code asc]` | Sort by Name | "sorted descending, priority 1. H" |
  | `[code asc, date asc, name desc]` | Sort by Name | "sorted descending, priority 3. H" |
  | `[code asc]` | Sort by Name | "H" |

  The whole description is one message, `sortDescription({ direction, rank })`, so a translation can order and
  punctuate it freely (RND-06). `direction` is `'asc'`, `'desc'` or `null` (unsorted); `rank` is the column's place
  in the order while two or more columns are sorted, else `null`. The four rows above call it with
  `{ direction: 'asc', rank: null }`, `{ direction: 'desc', rank: 1 }`, `{ direction: 'desc', rank: 3 }` and
  `{ direction: null, rank: null }`.
- Reason: `aria-sort` is on one header only (A11Y-03), so the other sorted columns need words.
- Layer: component.
- Traces: PRD-B5, PRD-A2.

## 7. The pager (PAGE)

`Pagination` is a separate component, so a consumer can place it anywhere or leave it out. The current page is
`offset / limit` rounded down, plus 1; the number of pages is `total / limit` rounded up, and at least 1.

OPEN: an `offset` above 0 that is at or past `total`, `total 0` included (rows deleted between two requests cause
it). Proposed: no alert; the places are those of the last page, with no `aria-current`; "First page" and
"Previous page" are enabled, and "Previous page" emits the last page's offset; "Next page" and "Last page" are
`aria-disabled`. Layer: component.

OPEN: an `offset` that is not a multiple of `limit` (a consumer that keeps the offset after `onsize`). Proposed: the
current page as above, and the step buttons emit offsets on the page grid (multiples of `limit`). Layer: component.

**PAGE-09** The pager MUST be a `nav` element named by its `label` prop.
- Example: `label="Pages of orders"` gives exactly one element found by role `navigation` and name "Pages of orders".
- Reason: a landmark lets screen-reader users jump to the pager.
- Layer: component.
- Traces: PRD-B9, PRD-A1.

**PAGE-10** The pager's controls MUST come in this order: "First page", "Previous page", the page numbers, "Next page",
"Last page", then the page-size select when there is one.
- Example: `offset 100, limit 10, total 200, sizes [10, 25]`: in document order, every page number button lies after
  "Previous page" and before "Next page", and the select comes after "Last page".
- Reason: reading order and Tab order match the visual order (WCAG 1.3.2, 2.4.3).
- Layer: component.
- Traces: PRD-B9, PRD-A3.

**PAGE-01** A press on an enabled step button, or on a page number other than the current page, MUST emit `onpage`
once with that page's offset.
- Examples (the test runs every row; `offset 20, limit 10, total 95`: page 3 of 10, places `1 2 3 4 5 … 10`):

  | Press | `onpage` receives |
  |---|---|
  | First page | 0 |
  | Previous page | 10 |
  | Next page | 30 |
  | Last page | 90 |
  | Page 5 | 40 |
  | Page 10 | 90 |

- Reason: the server pages by offset, and the consumer owns the request.
- Layer: component.
- Traces: PRD-B9, PRD-B2.

**PAGE-02** The page numbers MUST fill at most seven places, by this rule.
- Examples (the test runs every row):

  | Pages | Current | Places shown |
  |---|---|---|
  | 1 | 1 | 1 |
  | 7 | 1 | 1 2 3 4 5 6 7 |
  | 7 | 4 | 1 2 3 4 5 6 7 |
  | 7 | 7 | 1 2 3 4 5 6 7 |
  | 8 | 1 | 1 2 3 4 5 … 8 |
  | 8 | 4 | 1 2 3 4 5 … 8 |
  | 8 | 5 | 1 … 4 5 6 7 8 |
  | 8 | 8 | 1 … 4 5 6 7 8 |
  | 20 | 11 | 1 … 10 11 12 … 20 |

  The rule: all pages while there are seven or fewer. Otherwise the first five pages, a gap and the last page while
  the current page is among the first four; the first page, a gap and the last five pages while it is among the last
  four; and otherwise the first page, a gap, the current page with one page on each side, a gap and the last page.
- Reason: the pager keeps a fixed width at any table size.
- Layer: component.
- Traces: PRD-B9.

**PAGE-11** A gap MUST be an `aria-hidden` "…" and not a button.
- Example: 20 pages, current 11: two "…" marks, each inside an `aria-hidden="true"` element, neither inside a button.
- Reason: a screen reader skips the gaps, and there is nothing to press.
- Layer: component.
- Traces: PRD-B9, PRD-A1.

**PAGE-03** The pager MUST show its places within one second for any safe total.
- Example: on a test-site page, `offset 0, limit 1, total 9007199254740991` (2^53 - 1 pages): the test mounts the
  pager and waits at most one second from the mount call for the last place "9,007,199,254,740,991"; a pager that
  visits every page never shows it, and the bounded wait fails.
- Reason: row counts of large stores reach the billions, and a list of every page would not fit in memory.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B9, PRD-P2.

**PAGE-17** The pager MUST show the right places at the edges of the row count.
- Examples (the test runs every row; `offset 0, limit 25`; `total 0` is PAGE-08):

  | `total` | Places shown |
  |---|---|
  | 1 | 1 |
  | 25 | 1 |
  | 26 | 1 2 |
  | 9007199254740991 | 1 2 3 4 5 … 360,287,970,189,640 |

  In every row the pager's text and accessible names hold no "NaN", no "Infinity" and no "Page 0".
- Reason: a wrong pager is worse than none, and these are the totals where arithmetic slips (PRD-B9).
- Layer: component.
- Traces: PRD-B9.

**PAGE-18** A press on an enabled "Last page" MUST emit the offset of the last page at the edges of the row count.
- Examples (the test runs every row; `offset 0, limit 25`):

  | `total` | `onpage` receives |
  |---|---|
  | 26 | 25 |
  | 50 | 25 |
  | 51 | 50 |
  | 9007199254740991 | 9007199254740975 |

- Reason: an off-by-one here asks for an empty page or skips the last rows.
- Layer: component.
- Traces: PRD-B9.

**PAGE-04** The current page's button MUST carry `aria-current="page"`, and no other control of the pager does.
- Example: `offset 25, limit 25, total 130`: "Page 2" has `aria-current="page"`; no other element in the pager has
  `aria-current`.
- Reason: assistive technology announces which page is shown, and colour alone would not (WCAG 1.4.1).
- Layer: component.
- Traces: PRD-B9, PRD-A1.

**PAGE-12** A press on the current page's button MUST emit nothing.
- Example: `offset 25, limit 25, total 130`: pressing "Page 2" calls neither `onpage` nor `onsize`.
- Reason: asking again for the page on screen is a wasted query.
- Layer: component.
- Traces: PRD-B9, PRD-B2.

**PAGE-05** A step button that cannot move MUST be `aria-disabled="true"` and MUST NOT carry the `disabled` attribute.
- Examples (the test runs every row; `limit 10`):

  | Position | `aria-disabled="true"` on |
  |---|---|
  | `offset 0, total 95` (first of several pages) | First page, Previous page |
  | `offset 90, total 95` (last of several pages) | Next page, Last page |
  | `offset 40, total 95` (a middle page) | none |
  | `offset 0, total 7` (the only page) | all four |
  | `offset 0, total 0` | all four |

  In every row no step button has the `disabled` attribute (PAGE-21 shows that focus stays on one). Break that
  turns it red: the button gets `disabled` instead.
- Reason: a natively disabled button drops focus to the page body at the moment the user reaches the end.
- Layer: component.
- Traces: PRD-B9, PRD-A3.

**PAGE-13** A press on an `aria-disabled` step button MUST emit nothing.
- Examples (the test runs every row; `limit 10, total 95`; neither `onpage` nor `onsize` is called; focus staying on
  the button is PAGE-21):

  | Offset | Pressed |
  |---|---|
  | 0 | "First page", "Previous page" |
  | 90 | "Next page", "Last page" |

- Reason: the press has nowhere to go.
- Layer: component.
- Traces: PRD-B9, PRD-B2.

**PAGE-22** A pager intent MUST NOT change what the pager shows until the consumer passes new props.
- Examples (the test runs every row; `offset 20, limit 10, total 95, sizes [10, 25, 50]`; `onpage` and `onsize`
  record their calls and pass nothing back):

  | Intent | Still shown after the intent |
  |---|---|
  | press "Next page" | "Page 3" has `aria-current="page"`; places `1 2 3 4 5 … 10` |
  | press "Page 5" | "Page 3" has `aria-current="page"` |
  | choose 50 in the select | the select shows 10 |

  Break that turns it red: the pager keeps its own offset or size and updates it on an intent.
- Reason: the pager shows only what its props say (PRD-B2); a page the server did not send must not be marked current.
  A visible effect: the select shows the old size again until the consumer passes the new `limit`.
- Layer: component.
- Traces: PRD-B2, PRD-B9.

**PAGE-21** After a step button is pressed with Enter, focus MUST stay on that button once the consumer has passed
the new offset, or when the button could not move.
- Examples (the test runs every row; `limit 10, total 95`):

  | Offset before | Enter on | New offset | Focus after |
  |---|---|---|---|
  | 30 | Next page | 40 | "Next page" |
  | 80 | Next page | 90 | "Next page", now `aria-disabled` |
  | 30 | First page | 0 | "First page", now `aria-disabled` |
  | 90 | Next page (`aria-disabled`) | none | "Next page" |

- Reason: a new page moves no focus (PRD-A3), also when the pressed button cannot move again (PRD-B2 lists that
  pending focus).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A3, PRD-B9, PRD-B2.

**PAGE-06** When a new offset moves a focused page number to another place, focus MUST stay on the button for that
same page number.
- Example: `offset 30, limit 10, total 200` shows `1 2 3 4 5 … 20`; focus "Page 5" and press Enter; the offset
  becomes 40, the pager shows `1 … 4 5 6 … 20`, and "Page 5" still has focus.
- Reason: a keyboard user keeps their place while paging.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A3, PRD-B9.

**PAGE-08** With `total 0` and `offset 0` the pager MUST show exactly one page button, "Page 1", as the current page.
- Example: `offset 0, limit 25, total 0` shows one page number button, "Page 1", with `aria-current="page"`; the
  pager's text and accessible names hold no "NaN", no "Infinity" and no "Page 0".
- Reason: an empty result is normal, and the pager keeps its layout instead of vanishing.
- Layer: component.
- Traces: PRD-B9.

**PAGE-07** With a non-empty `sizes`, the pager MUST offer exactly those page sizes, in the given order, in a select
named "entries per page", with `limit` selected.
- Example: `limit 25, sizes [10, 25, 50, 100, 250, 500, 1000]` gives one select whose accessible name is "entries per
  page", with those seven options in that order and 25 selected.
- Reason: the allowed sizes are a server limit that the consumer knows and the component does not.
- Layer: component.
- Traces: PRD-B9.

**PAGE-24** The page-size select's name MUST be text that is visible on the page.
- Example: `limit 25, sizes [10, 25, 50]`: the element holding "entries per page" lies inside the viewport and
  inside the pager's box, is at least as wide as its text, has neither `clip` nor `clip-path` set, and its text
  colour has an alpha above 0; that text is the select's accessible name. With `messages.sizeLabel` "Zeilen" the
  visible text and the name are both "Zeilen". A visually hidden label (Tailwind's `sr-only`) or one moved off-screen
  fails.
- Reason: a sighted user must see what the bare number means (WCAG 3.3.2, 2.5.3); a label hidden by CSS passes in a
  simulated DOM, so this needs an engine.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A1, PRD-B9.

**PAGE-14** A change of the page-size select MUST emit `onsize` once with the chosen size.
- Example: `limit 25, sizes [10, 25, 50]`, choose 50: `onsize(50)` once, and `onpage` is not called.
- Reason: the consumer re-queries with the new size and decides the new offset.
- Layer: component.
- Traces: PRD-B9, PRD-B2.

**PAGE-23** After a change of the page-size select, focus MUST stay on the select once the consumer has passed the
new `limit` and offset.
- Example: `offset 50, limit 25, total 300, sizes [10, 25, 50]`: focus the select, set it to 50 with Playwright's
  `selectOption` (engines differ in how keys open a native select); the consumer passes `limit 50, offset 0`; the
  select still has focus and shows 50.
- Reason: a new page moves no focus (PRD-A3), and a rebuilt select would drop it to the page body.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A3, PRD-B9.

**PAGE-15** Without `sizes`, or with `sizes []`, the pager MUST show no page-size select.
- Examples (the test runs every row): no `sizes` prop; `sizes []`. In both, no element with role `combobox` or
  `listbox` is in the pager.
- Reason: a fixed page size needs no control.
- Layer: component.
- Traces: PRD-B9.

**PAGE-16** For invalid input the pager MUST render one alert with a fixed message instead of its controls.
- Examples (the test runs every row and every value in it: one element with `role="alert"` holding the default
  text, and no `nav` element):

  | Invalid input | Message key | Alert text (default) |
  |---|---|---|
  | `total` is -1, 1.5, `NaN`, `Infinity` or 2^53 | `totalInvalid` | "The row total is not a valid number." |
  | `offset` is -25, 2.5, `NaN`, `Infinity` or 2^53 | `offsetInvalid` | "The page offset is not a valid number." |
  | `limit` is 0, -10, 2.5, `NaN`, `Infinity` or 2^53 | `limitInvalid` | "The page size is not a valid number." |
  | `label` is empty or blank | `labelEmpty` | "Pager label must not be empty." |
  | `sizes` holds 0, 2.5 or the same size twice | `sizesInvalid` | "The page sizes are not valid." |
  | `sizes` is not empty and does not hold `limit` | `limitNotInSizes` | "The page size is not one of the offered sizes." |
  | `onpage` is not given | `pageHandlerMissing` | "The pager has no page handler." |
  | `sizes` is not empty and `onsize` is not given | `sizeHandlerMissing` | "The page-size select has no handler." |

  A valid number here is a safe non-negative integer (`limit`: a safe positive integer).
- Reason: a wrong pager is worse than none; a stray NaN or a page 0 would send a wrong request, and a control with
  no handler does nothing.
- Layer: component.
- Traces: PRD-B9, PRD-S4.

**PAGE-19** Every fixed word the pager shows or announces MUST come from its `messages` prop with an English default.
- Examples (the test runs every row; it passes a full `messages` object of non-English words, then checks that each
  replacement appears where the row says and that no English default is left in the pager's text or accessible
  names):

  | Message | English default | Shown by |
  |---|---|---|
  | `firstPage` | "First page" | PAGE-01 |
  | `previousPage` | "Previous page" | PAGE-01 |
  | `nextPage` | "Next page" | PAGE-01 |
  | `lastPage` | "Last page" | PAGE-01 |
  | `pageLabel` (a function of the page number) | "Page 6" for page 6 | PAGE-01, I18N-01 |
  | `pageNumber` (a function of the page number) | "6" for page 6 | PAGE-02, I18N-01 |
  | `sizeLabel` | "entries per page" | PAGE-07, PAGE-24 |
  | `sizeOption` (a function of the size) | "1,000" for 1000 | PAGE-07, I18N-01 |
  | each alert message of PAGE-16 | its default in PAGE-16 | PAGE-16 |

  The gap mark "…" is a symbol hidden from assistive technology (PAGE-11), not a word.
- Reason: consumers translate and reword without forking the component.
- Layer: component.
- Traces: PRD-I1.

**PAGE-20** Every text the pager is given MUST render as text, never as markup.
- Examples (the test runs every row, once with the value `<img src=x onerror=alert(1)>` and once with `<none>`):

  | Prop that carries the text |
  |---|
  | `label` |
  | each entry of `messages`, the returned text of every function included |

  In every row the literal text appears in the pager's text or accessible names, and the pager holds no `img` and
  no `none` element.
- Reason: a translation can come from anywhere, and any markup path is a cross-site scripting path.
- Layer: component.
- Traces: PRD-S2.

## 8. Ids across instances and server rendering (ID)

The examples of this section use four instances: two `DataTable`s with the same sortable columns, both sorted
`[code asc, name desc]`, and two `Pagination`s with `sizes`, mounted side by side. Each table holds ids and id
references (its sort descriptions); the tests assert that each table's counts are above 0, so a table with nothing
to check fails instead of passing. A pager may hold no id at all; whatever ids and references it holds are checked
the same way.

**ID-01** Two tables, and two pagers, on one page MUST share no `id`.
- Example: the four instances: the set of `id` values of each instance is disjoint from the others', and no `id`
  occurs twice in the document.
- Reason: a duplicated id makes the second table's descriptions point at the first table's words.
- Layer: component.
- Traces: PRD-B18.

**ID-02** Every id reference of a table or a pager MUST name an element inside that same instance.
- Example: the four instances: every `aria-describedby`, `aria-labelledby`, `aria-controls` and `for` value of each
  instance names only ids found inside that instance.
- Reason: a reference that resolves into a neighbour reads the neighbour's words, and no check of one instance alone
  finds it.
- Layer: component.
- Traces: PRD-B18.

**ID-03** The ids of a server-rendered table and pager MUST equal their ids after hydration.
- Example: the four instances, rendered with Svelte's server renderer, put into the simulated DOM and hydrated in
  Svelte's development mode: every `id` and every id reference is the same before and after hydration, and Svelte
  reports no hydration mismatch. A planted mismatch, a server render in which one description id differs, must be
  reported by the id comparison itself, which proves that comparison can fail.
- Reason: a description id that changes on hydration leaves the server-rendered references dangling. The consumer
  project proves it again in three engines (site spec).
- Layer: component.
- Traces: PRD-B18, PRD-K4.

## 9. Numbers (I18N)

**I18N-01** Every number the table or the pager shows or announces MUST come from a `messages` function that
receives that number.
- Examples (the test runs every row; the test then passes functions that return Eastern Arabic digits and checks
  that each replacement appears and no Western digits of that number remain):

  | Function | Called with | English default | Shown by |
  |---|---|---|---|
  | `rowCount` | 1000 | "1,000 rows displayed" | A11Y-05 |
  | `sortRank` | 2 | "2" | SORT-05 |
  | `sortDescription` | `{ direction: 'desc', rank: 3 }` | "sorted descending, priority 3. H" (H as in SORT-06) | SORT-06 |
  | `pageNumber` | 1234 | "1,234" | PAGE-02 |
  | `pageLabel` | 1234 | "Page 1,234" | PAGE-01 |
  | `sizeOption` | 1000 | "1,000" | PAGE-07 |

  The defaults group digits the English way whatever the runtime's default locale: the test runs once more with a
  German default locale and still expects "1,000"; that run sets `navigator.language` and `navigator.languages` to
  German as well, and first asserts both and that the runtime's own default formatting gives "1.000", so a locale
  that did not take effect fails instead of passing.
- Reason: digits, grouping and plural forms differ by language (PRD-I2).
- Layer: component.
- Traces: PRD-I2, PRD-I1.

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

### PRD must -> statements (the musts group 1 touches)

As of group 1. For every PRD id that group 2 touches, the group-2 table below replaces its row.

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

## Trace for group 2

Group 2 also adds rows to group-1 statements: RND-01 (a `sort` prop does not reorder), RND-03 (the new message
functions), RND-05 and RND-09 (the sort input), RND-06 (the sort words), A11Y-06 (sorted states and the pager) and
A11Y-16 (sort buttons and the pager), A11Y-07 (sort and pager controls) and A11Y-10 (a note on the sort buttons). Their
trace lines are unchanged. A11Y-17 and A11Y-18 are new in group 2 and sit in section 3.

### Statement -> PRD

| Statement | PRD ids |
|---|---|
| SORT-10 | PRD-B3, PRD-B4 |
| SORT-01 | PRD-B4, PRD-B2 |
| SORT-02 | PRD-B4 |
| SORT-03 | PRD-B2, PRD-B4 |
| SORT-04 | PRD-B4 |
| SORT-12 | PRD-B2, PRD-B4 |
| SORT-11 | PRD-A3 |
| A11Y-03 | PRD-A2 |
| SORT-09 | PRD-B5, PRD-A1 |
| SORT-13 | PRD-B5, PRD-A1 |
| SORT-05 | PRD-B5 |
| SORT-06 | PRD-B5, PRD-A2 |
| PAGE-09 | PRD-B9, PRD-A1 |
| PAGE-10 | PRD-B9, PRD-A3 |
| PAGE-01 | PRD-B9, PRD-B2 |
| PAGE-02 | PRD-B9 |
| PAGE-11 | PRD-B9, PRD-A1 |
| PAGE-03 | PRD-B9, PRD-P2 |
| PAGE-17 | PRD-B9 |
| PAGE-18 | PRD-B9 |
| PAGE-04 | PRD-B9, PRD-A1 |
| PAGE-12 | PRD-B9, PRD-B2 |
| PAGE-05 | PRD-B9, PRD-A3 |
| PAGE-13 | PRD-B9, PRD-B2 |
| PAGE-22 | PRD-B2, PRD-B9 |
| PAGE-21 | PRD-A3, PRD-B9, PRD-B2 |
| PAGE-06 | PRD-A3, PRD-B9 |
| PAGE-08 | PRD-B9 |
| PAGE-07 | PRD-B9 |
| PAGE-14 | PRD-B9, PRD-B2 |
| PAGE-23 | PRD-A3, PRD-B9 |
| PAGE-24 | PRD-A1, PRD-B9 |
| PAGE-15 | PRD-B9 |
| PAGE-16 | PRD-B9, PRD-S4 |
| PAGE-19 | PRD-I1 |
| PAGE-20 | PRD-S2 |
| ID-01 | PRD-B18 |
| ID-02 | PRD-B18 |
| ID-03 | PRD-B18, PRD-K4 |
| I18N-01 | PRD-I2, PRD-I1 |
| A11Y-17 | PRD-A3 |
| A11Y-18 | PRD-A1 |

### PRD must -> statements (the musts group 2 touches)

This table replaces the group-1 rows of the same PRD ids. Statements of group 1 are listed where they count.

| PRD id | Statements | Coverage |
|---|---|---|
| PRD-B1 | RND-01, STATE-05 | in part: the filter group adds the row where filters are given and the rows are still not filtered |
| PRD-B2 | STATE-05, SORT-01, SORT-03, SORT-12, PAGE-01, PAGE-12, PAGE-13, PAGE-14, PAGE-21, PAGE-22 | in part: the filter, column and selection groups add their one-callback and props-only statements and the rest of the internal-state list |
| PRD-B3 | RND-02, RND-08, RND-05, RND-07, RND-11, RND-12, SORT-10 | in part: the filter group adds the positive halves of RND-11 and RND-12 |
| PRD-B4 | SORT-10, SORT-01, SORT-02, SORT-03, SORT-04, SORT-12 | in part: the column group adds "hidden columns keep their place" |
| PRD-B5 | SORT-09, SORT-13, SORT-05, SORT-06 | in part: the column group adds ranks that count hidden columns and the toolbar summary while a sorted column is hidden |
| PRD-B9 | PAGE-01 to PAGE-24 except PAGE-19 and PAGE-20 | in full, apart from the two OPEN lines of section 7 |
| PRD-B16 | RND-05, RND-09, RND-10, EXP-02 | in full for the props of groups 1 and 2; later groups add their rows to RND-05 |
| PRD-B18 | ID-01, ID-02, ID-03 | in part: each later group that adds an id reference adds its instances to the section 8 examples |
| PRD-A1 | A11Y-06, A11Y-07, A11Y-16, A11Y-18, SORT-09, SORT-13, PAGE-09, PAGE-11, PAGE-04, PAGE-24 | in part: target size for the sort and pager controls arrives with the PRD-A6 statements; the remaining criteria of PRD section 4.3 arrive with the controls they concern |
| PRD-A2 | A11Y-01, A11Y-13, A11Y-09, A11Y-12, A11Y-08, A11Y-02, A11Y-04, A11Y-03, SORT-06 | in part: the column group adds the hidden-lead row of A11Y-03; the sticky group adds the `stickyHeader` row of A11Y-12 |
| PRD-A3 | A11Y-12, A11Y-08, A11Y-10, FOOT-03, SORT-11, PAGE-10, PAGE-05, PAGE-21, PAGE-06, PAGE-23, A11Y-17 | in part: focus and no-scroll after the intents of later groups; the sort buttons' place in the Tab order (A11Y-10) arrives with the filter group, which places "Reset table"; focus after a pointer press waits on the OPEN line in section 6 |
| PRD-A10 | A11Y-16 | in part: the skip-link and dialog groups add their rows |
| PRD-I1 | RND-06, PAGE-19, I18N-01 | in part: later groups add their words |
| PRD-I2 | I18N-01 | in part: later groups add the numbers they show |
| PRD-S2 | RND-03, RND-04, PAGE-20 | in part: later groups add their props to the RND-03 table |
| PRD-S4 | RND-09, PAGE-16 | in part: the filter group's refusal messages add rows |
| PRD-P2 | PAGE-03 | in part: the large-pages group adds the time budgets |
| PRD-K4 | ID-03 | in part: the release and site specs prove it on the packed package and in three engines |

### PRD musts left to later groups (after group 2)

Every must marked "in part" in the tables above keeps its remainder with the group named there. Musts with no
statement yet:

- Filter and criteria: PRD-B6, PRD-B7, PRD-B8.
- Columns (chooser, reorder, resize): PRD-B10, PRD-B11, PRD-B12.
- Selection: PRD-B13.
- Sticky layout: PRD-B14.
- Accessibility beyond what groups 1 and 2 hold: PRD-A5, PRD-A6, PRD-A7, PRD-A8, PRD-A9, PRD-A11, PRD-A12 (and the
  column-move announcement of PRD-A4).
- Strict policy and side effects: PRD-S1 (and the rest of PRD-S3).
- Theming: PRD-T1, PRD-T2, PRD-T3, PRD-T4.
- Internationalisation: PRD-I3.
- Large pages and size: PRD-P1, PRD-P3.
- Browsers: PRD-E1.
- Packaging: PRD-K1, PRD-K2, PRD-K3.
- Gate: PRD-G1, PRD-G2, PRD-G3.
- Documentation: PRD-D1, PRD-D2, PRD-D3, PRD-D4, PRD-D5, PRD-D6, PRD-D7.
- Licence: PRD-L1.
- Supply chain and publishing: PRD-S5, PRD-S7.
- Test site and consumer project: PRD-W1, PRD-W2, PRD-W3, PRD-W4, PRD-W5, PRD-W6, PRD-W7, PRD-W8, PRD-W9, PRD-W10.
