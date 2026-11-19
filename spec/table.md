# DataTable and Pagination: component spec

- **Name:** `DataTable`, the table component of SvelteDT (`@hniedner/sveltedt`), and `Pagination`, its separate
  pager (section 8).
- **Status:** the first two groups of statements of the component spec. Later groups add their statements to this file;
  the trace at the end says which requirements the statements so far cover.
- Field names: no
- **Scope:** the statements a read-only table needs: rows in the given order with text or snippet cells, the
  loading, failed, empty and busy states, the invalid-input alert, the `heading` and `actions` snippets, the words as
  props, the APG table pattern, no global footprint, and theming by prefixed tokens; the strict-policy rules for
  the component source (no raw-HTML path, no injected style, link or script, no inline style). Then server-driven
  multi-column sort, the pager, ids that stay unique per instance and across hydration, numbers through replaceable
  functions, and focus and window scroll after a sort or pager intent.

The component renders one page of rows in the order the server gives, as a native HTML table following the WAI-ARIA
APG *table* pattern (not *grid*). It owns no data. It shows what its props say, and every user action is reported
to the consumer as one callback (stated with the statements that add user actions).

## Conventions

- **Statement form.** Each statement is one observable behaviour: an id, one MUST or MUST NOT sentence, an example
  (or an example table: the test runs every row), the reason, the test layer and a `Traces:` line naming the
  requirements of `docs/PRD.md` it serves. It says what happens, never how. Each test carries its statement's id and
  a hash of the statement text.
- **Test layers.**
  - **component**: the component mounted in a simulated DOM.
  - **real browser**: the component mounted on a test-site page in a real engine, in Chromium, Firefox and WebKit
    unless the statement names fewer and says why. Used for what needs an engine: layout, scrolling,
    focus (the simulated DOM differs from engines there), focus indicators, hover, axe, time bounds.
  - **static check**: a scan of the source or the built package, run in the gate, behind a wrapper that must find a
    planted canary.
  - **gate wrapper at step boundaries**: a gate step that runs on a step's diff against its base and runs other
    statements' tests on a changed copy, behind a wrapper that must refuse planted canaries.
- **Props used so far.** `rows`; `columns`, each with `id`, `label` and either `value(row)` (text) or `cell`
  (a snippet); `getRowId(row)` (a string or a finite number, handed back to the application as given wherever a
  later statement emits an id); `caption`; `regionLabel`; `status` (`'loading'`, `'failed'` or `'ready'`; default
  `'ready'`); `busy` (default `false`); `messages` (the words); the snippets `heading` and `actions`; `sort` (the
  order, a list of `{ id, desc }`, lead first), a column's `sortable` (the directions it allows, `'asc'` and/or
  `'desc'`) and `onsort(next)`; and the props of `Pagination`: `offset`, `limit`, `total`, `label`, `sizes`,
  `messages`, `onpage(offset)` and `onsize(n)`. Later groups add their own props.
- **Orders in examples** are written `[code asc, name desc]`: the lead first; `asc` is `{ desc: false }`. Column
  Name has id `name`, Code has id `code`, Date has id `date`. Every sortable column in an example allows both
  directions unless the row says otherwise. An example with a sortable column passes an `onsort`; an example pager
  passes an `onpage`, and an `onsize` when it has `sizes`.
- **Pager places.** The pager shows page numbers and gaps; each counts as one place. "Page n" is a page number
  button. A row such as `1 … 4 5 6 … 20` lists the places in order.
- **The region** is the element with `role="region"` that holds the table (A11Y-09). **The alert** is the alert of
  RND-05. **The failed notice** is the element of A11Y-15 that holds the failed message (it also has
  `role="alert"`; a test tells the two apart by their text). **The live count** is the polite live region of A11Y-05,
  an element with `aria-live="polite"` and no role. **The status region** is the element with `role="status"` of
  A11Y-14. They are two elements, and both are in the document in every state, the alert's included, where both are
  empty. A test finds the live count by its attribute, `[aria-live="polite"]:not([role])` within the component,
  the one element a test finds by an attribute, because the count has no role of its own.
- **Shown columns.** Every given column is shown until the column statements add hiding.
- **"Emits X once"** (used by the statements that add user actions) means the callback prop `X` is called exactly once for that user action
  and no other callback is called.
- **Empty.** A text or an id is empty when nothing is left after trimming white space; `" "` is empty. A row id that
  is a number is never empty; a column id or a text that is not a string counts as empty (RND-05).
- **Same row id.** Two row ids are the same when their text forms are equal: the number 1 and the string "1" are the
  same id.
- **Queries.** A test finds elements by role, accessible name and visible text, may read the tag, the ARIA and HTML
  attributes, the ancestors and the descendants of an element so found, and may assert that the component holds no
  element of a named tag or selector; never a test id or a class, except THEME-09, which tests the public classes
  of PRD-K3 themselves.
- **Words.** Quoted words are the English defaults. Every fixed word is a prop (RND-06, SORT-17, PAGE-19).
- **Data.** Example data is synthetic: rows such as `{ id: 'r1', name: 'Beta' }`.
- **Ids.** A statement keeps its id while its meaning stays, also when it is narrowed. A new or split-off behaviour
  takes the next free number in its group; SORT-07, SORT-08 and A11Y-11 are reserved for the draft statements of
  those numbers, which later groups write. A requirement id from `docs/PRD.md` is written `PRD-B1`.
- **Before its test.** A statement may land before the test that proves it; what an untested statement blocks is
  the method's rule (section 2, step 7).
- **One milestone per statement.** Every example of a statement can be run inside the milestone that owns the
  statement. A group written for a later milestone never adds a row, a prop or a component to an earlier statement;
  it writes a new statement with the next free id in its own group, which may cite the earlier one ("as RND-05, for
  the sort props"). A statement's test arrives with the pull request that makes its last example runnable. Reason: a
  statement is not yet tested until all its examples run, and that blocks the close of its milestone (the method,
  section 2, step 7).
- **What a statement covers.** A statement covers what its examples show. Where a later group's controls or states
  need the same rule, that group's own statement states it; an earlier statement is never widened to anticipate them.

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
  | a column `label` |
  | a default cell (`value(row)`) |
  | each entry of `messages`, the returned text of `rowCount` included |

  In every row the literal text appears on the page, in an accessible name or in an accessible description, and the
  component holds no `img` and no `none` element. Later groups state their own props in their own statements (SORT-23 for sort, PAGE-20 for the pager). (`regionLabel` has no
  row: an attribute value has no markup path.)
- Reason: the values come from a server and may hold anything; any markup path is a cross-site scripting path.
- Layer: component.
- Traces: PRD-S2.

**RND-04** The component source MUST NOT contain a raw-HTML path.
- Examples (each row, placed in a canary file, is a finding of the ban that names it; that the component source,
  holding none of them, is not a finding is checked from the pull request that adds `src/lib`):

  | Raw-HTML path in a canary file |
  |---|
  | `{@html x}` |
  | `el.innerHTML = x` |
  | `el["innerHTML"] = x` |
  | `el.outerHTML = x` |
  | `Object.assign(el, { innerHTML: x })` |
  | `Object.assign(el, { outerHTML: x })` |
  | `Object.assign(el, { srcdoc: x })` |
  | `el.insertAdjacentHTML("beforeend", x)` |
  | `document.write(x)` |
  | `document.writeln(x)` |
  | `window.document.write(x)` |
  | `el.ownerDocument.write(x)` |
  | `document.execCommand("insertHTML", false, x)` |
  | `range.createContextualFragment(x)` |
  | `new DOMParser().parseFromString(x, "text/html")` |
  | `Document.parseHTML(x)` |
  | `Document.parseHTMLUnsafe(x)` |
  | `el.setHTML(x)` |
  | `el.setHTMLUnsafe(x)` |
  | `createRawSnippet(() => ({ render: () => x }))` |
  | `<iframe srcdoc={x}></iframe>` |
  | `<iframe {srcdoc}></iframe>` |
  | `el.srcdoc = x` |
  | `el.setAttribute("srcdoc", x)` |

  A static check sees literal names and plain string literals only: a name built at run time, a template literal, a
  cast, an alias (`const d = document; d.write(x)`), `Reflect.set`, `setAttributeNS` or a computed `svelte:element`
  `this` is not seen, and such code is left to review.
- Reason: RND-03 sweeps the props that exist; the check also covers every prop added later and each listed API that
  turns a string into markup, Svelte's own `createRawSnippet` among them.
- Layer: static check.
- Traces: PRD-S2.

**RND-05** For invalid input the table MUST render one alert with a fixed message instead of the table.
- Examples (the test runs every row: one element with `role="alert"` holding the default text, and no `table`
  element):

  | Invalid input | Message key | Alert text (default) |
  |---|---|---|
  | `caption` is empty | `captionEmpty` | "Table caption must not be empty." |
  | `caption` is not a string (left out by a plain JavaScript caller) | `captionEmpty` | "Table caption must not be empty." |
  | `regionLabel` is empty | `regionLabelEmpty` | "Table region label must not be empty." |
  | `columns` is empty | `noColumns` | "Table has no columns." |
  | `columns` is not an array (left out) | `noColumns` | "Table has no columns." |
  | a column id is empty | `columnIdEmpty` | "A column id is empty." |
  | a column id is not a string (the number 7) | `columnIdEmpty` | "A column id is empty." |
  | two columns share an id | `columnIdDuplicate` | "Two columns share an id." |
  | a column label is empty | `columnLabelEmpty` | "A column label is empty." |
  | a column label is not a string (left out) | `columnLabelEmpty` | "A column label is empty." |
  | two column labels are equal after trimming ("Name" and "Name ") | `columnLabelDuplicate` | "Two columns share a label." |
  | a column has neither `value` nor `cell` | `columnContentMissing` | "A column has no value and no cell." |
  | `rows` is not an array (left out), with `status 'ready'` | `rowsNotList` | "Table has no list of rows." |
  | a row id is empty | `rowIdEmpty` | "A row id is empty." |
  | two rows share an id | `rowIdDuplicate` | "Two rows share an id." |
  | two rows share an id in its text form (the number 1 and the string "1") | `rowIdDuplicate` | "Two rows share an id." |
  | `getRowId` throws | `rowIdUnreadable` | "A row id could not be read." |
  | `getRowId` returns a value that is neither a string nor a finite number (`NaN`, `Infinity`, `null`) | `rowIdUnreadable` | "A row id could not be read." |

  A finite number is a valid row id: rows with ids 0 and 1 (numbers, as server JSON gives them) show the table and
  no alert. `rows` that is not an array is no fault while `status` is `loading` or `failed` (STATE-08).

  With several faults at once, the alert shows the message of the first row of this table that applies (for example
  an empty caption and two rows sharing an id: "Table caption must not be empty."). Later groups state the faults of
  their own props in their own statements (SORT-15 for sort).
- Reason: a wrong table is worse than none; the user would read, and later select or export, the wrong rows.
- Layer: component.
- Traces: PRD-B16, PRD-B3.

**RND-09** The alert MUST hold no value taken from the rows, the column definitions or a thrown error.
- Examples (the test runs every row, and in each it first finds the alert holding the RND-05 message for that
  input):

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

**RND-13** While the input is invalid, the alert MUST be the only state the table shows, whatever `status` is.
- Examples (the test runs every row, each with `columns []`; in every row exactly one element has `role="alert"` and
  it holds "Table has no columns."):

  | `status` | `busy` | Not shown |
  |---|---|---|
  | `loading` | false | "Loading data…" |
  | `failed` | false | "The rows could not be loaded." |
  | `ready` | false | "No records." and any count text |
  | `ready` | true | any count text |

- Reason: a state message beside the alert would describe a table that is not there, and two alerts compete for the
  screen reader.
- Layer: component.
- Traces: PRD-B16, PRD-B15.

**RND-14** The `heading` snippet MUST render before the region, or before the alert where there is no region, in
every state.
- Examples (the test runs every row; a `heading` snippet holding the heading "Orders"; the heading comes before the
  region in document order, and before the alert where there is no region):

  | State |
  |---|
  | `status 'loading'` |
  | `status 'failed'` |
  | `status 'ready'`, no rows |
  | `status 'ready'`, with rows |
  | the alert of RND-05 |

- Reason: the heading names what follows; read or tabbed after the table it would name nothing.
- Layer: component.
- Traces: PRD-A3, PRD-B16.

**RND-15** After `rows` changes to the same row ids in another order, each row MUST be rendered by the same element as
before.
- Example: `rows` r1, r2, r3 (by `getRowId`) are rendered; the consumer passes new row objects with the same ids and
  data in the order r3, r1, r2. For each id, the `tr` that rendered it before is the same element (`===`) that renders
  it after, now in the new order. Break that turns it red: the rows' key changed to the index (or to the row object).
- Reason: a server answer brings new objects for the same rows; without a stable element per row, the element at a
  place would show another row's data, and focus, a text selection or a cell snippet's own state held there would pass
  to that other row.
- Layer: component.
- Traces: PRD-B1.

**RND-16** After `columns` changes to the same column ids in another order, each column's header cell and each of its
cells MUST be rendered by the same element as before.
- Example: columns `name`, `city` over rows r1 and r2 are rendered; the consumer passes new column objects with the
  same ids in the order `city`, `name`. For each column id, its `th` and its `td` in r1 and in r2 are the same elements
  (`===`) as before, now in the new order. Breaks that turn it red: the header cells' key changed to the index (or to
  the column object); the cells' key changed to the index (or to the column object).
- Reason: column order is app state the consumer changes; without a stable element per column, the header cell at a
  place would show another column, and focus on its sort button (which sits inside the header cell) or a cell
  snippet's own state would pass to that other column.
- Layer: component.
- Traces: PRD-B1.

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
  `rowCount: (n) => n + ' Zeilen'` makes the live count say "2 Zeilen". Later groups state their own words in their own
  statements (SORT-17 for sort, PAGE-19 for the pager).
- Reason: consumers translate and reword without forking the component.
- Layer: component.
- Traces: PRD-I1, PRD-I2.

**RND-07** A column that is not sortable MUST NOT show a sort button.
- Example: the columns Name and Note, neither configured as sortable: no button whose name starts with "Sort by"
  exists, and neither header cell holds a button. (SORT-10 is the positive half.)
- Reason: a control that does nothing misleads.
- Layer: component.
- Traces: PRD-B3.

**RND-11** A column without a filter MUST NOT show a filter button.
- Example: the columns Name and Note, neither with a filter: no button whose name starts with "Filter" exists. (The
  filter group states the positive half in its own statement.)
- Reason: a control that does nothing misleads.
- Layer: component.
- Traces: PRD-B3.

**RND-12** The "Reset table" button MUST NOT be shown while no column is sortable or has a filter.
- Example: two columns with neither: no button "Reset table" exists, in every state (STATE-01 to STATE-07 and the
  alert). (The filter group states the positive half in its own statement.)
- Reason: read-only tables are a common use and should carry no dead controls.
- Layer: component.
- Traces: PRD-B3, PRD-B8.

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
- Example: three columns, `rows []`: one body cell with `colspan="3"` holding "No records."; the same with
  `busy true` (a newer answer is on its way, and STATE-05 keeps what is shown). (The selection statements state
  that the selection column is counted too, in their own statement.)
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

**STATE-05** While `status` is `ready` and `busy` is true, the table MUST keep showing the rows it was given.
- Example: 25 rows with `status 'ready'` and `busy true`: 25 body rows are shown.
- Reason: the user keeps their context while the next page loads.
- Layer: component.
- Traces: PRD-B2, PRD-B1.

**STATE-06** With `status 'loading'`, the table MUST show the loading message and none of the rows it is given.
- Example: `status 'loading'` with three rows Beta, Gamma, Delta: "Loading data…" is shown, and no body cell holds
  "Beta", "Gamma" or "Delta"; the same with `busy true`.
- Reason: `loading` means there is no answer yet, so any rows shown are not the answer; a refetch that keeps the
  rows on screen is `busy`, not `loading` (STATE-05).
- Layer: component.
- Traces: PRD-B15.

**STATE-07** With `status 'failed'`, the table MUST show none of the rows it is given.
- Example: `status 'failed'` with three rows Beta, Gamma, Delta: "The rows could not be loaded." is shown, and no
  body cell holds "Beta", "Gamma" or "Delta".
- Reason: `failed` means the answer did not arrive, and PRD-B15 gives the failed state no count; a consumer that wants
  to keep the last rows after a failed refetch keeps `status 'ready'` and reports the failure itself.
- Layer: component.
- Traces: PRD-B15.

**STATE-08** With `status 'loading'` or `status 'failed'`, the table MUST show that state's message, and not the
alert, when `rows` is not an array.
- Examples (the test runs every row; columns Name and Code, `rows` as given; no element holds a message of RND-05):

  | `status` | `rows` | Shown |
  |---|---|---|
  | `loading` | `undefined` | "Loading data…" |
  | `loading` | `null` | "Loading data…" |
  | `failed` | `undefined` | "The rows could not be loaded." |

- Reason: a plain JavaScript caller whose request is still pending, or has failed, often has no rows to pass yet; the
  state already says what the user sees, and the alert would call a normal wait a fault. With `status 'ready'` the
  same input is a fault (RND-05). The type keeps `rows` a required array, as for the "left out" rows of RND-05: this
  serves callers the type does not reach, and a test passes such a value through a cast.
- Layer: component.
- Traces: PRD-B15, PRD-B16.

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
- Decided at spec review (2026-11-17): the caption is hidden visually. The consumer's heading is the visible title,
  and a visually hidden caption is the standard way to name a table that already has a visible heading.
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
  | the 30-column table with an `actions` snippet holding "Export" and a cell link "Open Beta" in its first column | yes: Tab from "Export" lands on the region, the next Tab on "Open Beta" |

  (The sticky group states `stickyHeader` in its own statement: the region is then no scroll container and so never a
  stop.)
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
  states the selection column's header in its own statement.)
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

**A11Y-10** The Tab order MUST follow the reading order: the `heading` snippet's controls, then the `actions`
snippet's controls, then the region while it is a stop, then the controls in the cells row by row, each row from its first column to its last.
- Example: a table that fits its viewport, an `actions` snippet holding "Export", and a `cell` snippet holding a link
  "Open <name>" in the first of two columns and "Edit <name>" in the second, for rows Beta and Gamma: Tab from the
  start reaches "Export", "Open Beta", "Edit Beta", "Open Gamma", "Edit Gamma". (Later groups state the order of
  their own controls in their own statements.) Second example: the same with a `heading` snippet holding a link "All orders": Tab reaches "All
  orders", "Export", "Open Beta", "Edit Beta", "Open Gamma", "Edit Gamma". Where the region is a stop needs layout,
  so A11Y-12 proves its place between the actions and the cells.
- Reason: keyboard users meet the controls in the order they see them (WCAG 2.4.3).
- Layer: component.
- Traces: PRD-A3.

**A11Y-05** A polite live region MUST state the row count exactly when `status` is `ready` and `busy` is false.
- Examples (the test runs every row; in every row the live region is in the document, so a later count is
  announced; a `failed` row is also the "no count" of PRD-B15):

  | `status` | `busy` | Rows | Live count |
  |---|---|---|---|
  | `ready` | false | 2 | "2 rows displayed" |
  | `ready` | false | 0 | "0 rows displayed" |
  | `ready` | true | 2 | empty |
  | `ready` | true | 0 | empty |
  | `loading` | false | 2 | empty |
  | `failed` | false | 0 | empty |

- Reason: a count announced while the next answer is on its way, or after a failure, would be wrong.
- Layer: component.
- Traces: PRD-A4, PRD-B15.

**A11Y-14** The loading message MUST be inside a polite live region that was in the document before `status` became
`loading`.
- Example: rerender from `status 'ready'` to `status 'loading'`: "Loading data…" appears inside an element with
  `role="status"` (a polite live region), and that element was in the document before the rerender. Mounted with
  `status 'loading'`: the same element holds "Loading data…".
- Reason: a live region only announces changes to content it already held, so the user hears that loading started.
- Layer: component.
- Traces: PRD-A4.

**A11Y-15** The failed message MUST be inside an element with `role="alert"` (the failed notice).
- Example: rerender from `status 'loading'` to `status 'failed'`: `getByRole('alert')` holds "The rows could not be
  loaded.".
- Reason: a failure must be announced at once, not only when the user reaches the table.
- Layer: component.
- Traces: PRD-A4, PRD-B15.

**A11Y-16** Hovering or focusing any part of the table MUST NOT make content appear, other than the focused element's
own focus indicator.
- Example: the 30-column, 25-row table with a link in one column: hover every header cell and every body cell in turn,
  and focus the region and each link; after each step the page's visible text and the set of visible elements equal
  those before the step. Visible means rendered and not hidden by CSS (`display`, `visibility`, `opacity`, `hidden`),
  whatever the scroll position, so a region that scrolls a focused link into view changes nothing.
- Reason: content that appears on hover or focus can cover what the user reads and must be dismissable; showing none
  meets WCAG 1.4.13 by design.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A10, PRD-A1.

**A11Y-07** The region MUST show a visible focus indicator when it is focused by keyboard.
- Example: the region of the 30-column table of A11Y-12: Tab to it; its computed outline, or at least one entry of its
  computed box shadow, has a width (outline) or a spread or blur (shadow) of at least 1 CSS px with a colour whose
  alpha is above 0, and differs from its unfocused style; a transparent outline fails. Its contrast is a later
  statement (PRD-A12).
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

  Later groups state their own states in their own statements.
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

  Later groups state their own intents in their own statements. Break that turns it red: the table calls `scrollIntoView` on its first row when
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

**A11Y-19** After a pointer press on a sort button or a pager button, focus MUST be on that button, also in an engine
that does not focus a button on a click.
- Examples (the test runs every row on a test-site page that stops the browser's own focus-on-click with a capturing
  `mousedown` listener that prevents the default; focus starts on the body; Name sortable at order `[]`, a pager at
  `offset 20, limit 10, total 95`; after the click, and after the consumer passes the new props, the focused element
  is the button named):

  | Click on | Focused afterwards |
  |---|---|
  | "Sort by Name" | "Sort by Name" |
  | "Next page" | "Next page" |
  | "Page 5" | "Page 5" |

  Break that turns it red: the component leaves focus to the browser.
- Reason: WebKit on macOS (Safari) does not focus a clicked button, so without this focus would stay on the page body
  after an intent (PRD-A3); the test page makes every engine behave that way, so the row can fail in CI.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A3.

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

**EXP-01** The component MUST offer no export control of its own.
- Example: in every state of EXP-02, with an `actions` snippet that holds no control, no button, link or menu item
  whose accessible name contains "export" or "download" (any case) exists.
- Reason: file formats, formula-injection guards and file names are the consumer's policy; the consumer already holds
  the rows it needs.
- Layer: component.
- Traces: PRD-B17.

**EXP-03** The component MUST NOT start a download.
- Example: `URL.createObjectURL` is replaced by a spy (the simulated DOM has none); during mount, a rerender through
  every state of EXP-02 and a Tab through the table, the spy is not called and no `a[download]` element appears.
- Reason: downloads are the consumer's; a component that writes files works around the consumer's policy.
- Layer: component.
- Traces: PRD-S3, PRD-B17.

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
  and unmount a control component that handles every event type the table's own elements handle to measure the listeners Svelte itself
  delegates to the document, which are excluded. Then mount the table through the states of FOOT-01: while it is
  mounted, the listeners added minus those removed, per target and event type, are none; after unmount, likewise none.
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

**FOOT-04** The component source MUST NOT add a style, link or script element or a style sheet to the page, nor
anything to the document head.
- Examples (each row, placed in a canary file, is a finding of the ban that names it; that the component source,
  holding none of them, is not a finding is checked from the pull request that adds `src/lib`):

  | Injection in a canary file |
  |---|
  | `<svelte:head><title>x</title></svelte:head>` |
  | `<link rel="stylesheet" href={x} />` |
  | `<div><script src={x}></script></div>` |
  | `<div><style></style></div>` |
  | `<svelte:element this="style"></svelte:element>` |
  | `<svelte:element this={"script"}></svelte:element>` |
  | `document.createElement("style")` |
  | `document.createElement("link")` |
  | `document.createElement("script")` |
  | `new CSSStyleSheet()` |
  | `document.adoptedStyleSheets = [sheet]` |
  | `sheet.insertRule(rule)` |

  A static check sees literal names and plain string literals only: a name built at run time, a template literal, a
  cast, an alias (`const make = document.createElement.bind(document); make("style")`), `Reflect.set`, `setAttributeNS` or a computed `svelte:element`
  `this` is not seen, and such code is left to review.
- Reason: PRD-S1 asks that the component inject no style, link or script, and PRD-T3 and PRD-T15 that the one shipped
  stylesheet is the only CSS: an injected inline style or script is refused under the strict policy, so a consumer would
  have to loosen its policy, and a sheet the component adds is not the one the application imports; the document head
  belongs to the app (PRD-B19).
- Layer: static check.
- Traces: PRD-S1, PRD-T3, PRD-T15, PRD-B19.

---

## 6. Theming (THEME)

The component's look comes from prefixed custom properties the consumer may define. Without them it falls back to
the browser's system colours and stays usable.

**THEME-01** Every colour value in a declaration of the package's stylesheet MUST read a `--sdt-*` custom property
with a CSS system-colour fallback, except the keywords `inherit`, `currentColor` and `transparent`, a zero-width
border, and declarations inside `@media (forced-colors: active)`.
- Examples (the scan runs every row against a canary stylesheet holding it; only the last four rows pass):

  | Declaration in a canary stylesheet | Result |
  |---|---|
  | `.sdt-x { color: #333 }` | finding |
  | `.sdt-x { border: 1px solid blue }` (a shorthand with a named colour) | finding |
  | `.sdt-x { background-image: linear-gradient(red, var(--sdt-a, Canvas)) }` (a gradient with one raw colour) | finding |
  | `.sdt-x { color: var(--sdt-text, #333) }` (fallback is not a system colour) | finding |
  | `.sdt-x { color: var(--sdt-text) }` (no fallback) | finding |
  | `.sdt-x { color: var(--app-text, CanvasText) }` (not the `--sdt-` prefix) | finding |
  | `.sdt-x { color: Canvas }` (a system colour outside `forced-colors` and outside a fallback) | finding |
  | `.sdt-x { color: var(--sdt-text, CanvasText) }` | pass |
  | `.sdt-x { color: currentColor; border: 0 solid red }` (a keyword; a zero-width border) | pass |
  | `@media (forced-colors: active) { .sdt-x { outline-color: Highlight } }` | pass |
  | `.sdt-x { background: transparent }` | pass |

  A colour value is a CSS Color 4 colour anywhere in a property's value: a named colour, a hex colour or a colour
  function (`rgb()`, `hsl()`, `oklch()`, `color-mix()` and the others of CSS Color 4 and 5), or a system colour
  anywhere but as the fallback of a `--sdt-*` property. A system colour is one of
  the system-colour keywords of CSS Color 4 (for example `Canvas`, `CanvasText`, `ButtonText`, `Highlight`). The scan
  reads the package's stylesheet (THEME-04) in the source and, once the package is built (PRD-K2), in the tarball; it
  reports how many declarations it read, and with no stylesheet or 0 declarations it reports "could not check", which
  blocks like a finding.
- Reason: prefixed names cannot collide with an application's tokens, and a raw colour would ignore the consumer's
  theme; the system-colour fallback keeps the table usable without tokens (PRD-T2).
- Layer: static check.
- Traces: PRD-T1.

**THEME-02** The token table in the documentation MUST list exactly the `--sdt-*` names the package's stylesheet
reads.
- Example: a declaration reading `var(--sdt-border, CanvasText)` with no `--sdt-border` row in the table is a
  finding; a table row `--sdt-unused` that no declaration reads is a finding. The stylesheet is read as in THEME-01;
  with no token table, or 0 names read from the stylesheet, the check reports "could not check".
- Reason: the token names are public interface (PRD-K3); a list kept by hand drifts from the stylesheet unless a
  check compares them.
- Layer: static check.
- Traces: PRD-T1.

**THEME-03** With no `--sdt-*` property defined, axe MUST find no serious or critical violation in any state of the
table.
- Example: a site page with the package's stylesheet and no token definitions, in each state of A11Y-06: axe reports
  0 serious or critical violations (its colour-contrast rule included).
- Reason: the system-colour fallbacks are what make "usable without tokens" true; a consumer who themes nothing must
  get a plain table, not a broken one.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T2, PRD-A1.

**THEME-06** With no `--sdt-*` property defined, the keyboard-focused region MUST show a visible focus indicator.
- Example: the same page, measured as A11Y-07 measures, on the region of A11Y-07: Tab to it; its
  outline, or at least one entry of its box shadow, has a width (outline) or a spread or blur (shadow) of at least
  1 CSS px with a colour whose alpha is above 0, and differs from its unfocused style.
- Reason: the focus indicator must not depend on a token the consumer may not define.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T2, PRD-A1.

**THEME-04** The package MUST ship exactly one stylesheet, which holds no `@layer` and no `@import` rule, and no
`.svelte` file of the component may hold a `<style>` block.
- Examples (the first row is the real source; every other row is a canary planted in a copy of it, which must be
  found):

  | Source | Result |
  |---|---|
  | the real source: one `.css` file under `src/lib`, no `<style>` block | passes |
  | a second `.css` file under `src/lib` | finding: two stylesheets |
  | no `.css` file under `src/lib` | finding: no stylesheet |
  | `@layer sdt { .sdt-x { color: inherit } }` in the stylesheet | finding: a layer |
  | `@import "./more.css";` in the stylesheet | finding: an import |
  | `<style>.x { color: inherit }</style>` at the top level of a `.svelte` file under `src/lib` | finding: a style block |

  Once the package is built (PRD-K2), the same holds for the tarball: exactly one `.css` file, the target of the
  `./styles.css` export (PKG-05 of `spec/package.md`). An added `<style>` element is FOOT-04's.
- Reason: PRD-T3 asks for one static, unlayered file: an unlayered file held under Bootstrap 5.3's unlayered reboot
  where a layered copy failed (MEASURED 2026-11-18, PRD-T3), the application chooses the layer when it imports the
  file, and an `@import` would make the consumer's bundler fetch a second file (INFERRED); a `<style>` block is
  compiled by the application's Svelte settings (PRD-T15, INFERRED).
- Layer: static check.
- Traces: PRD-T3, PRD-T15.

**THEME-08** Every class the component writes MUST be `sdt` or start with `sdt-`, or come from a hook prop.
- Examples (the scan runs every row as a canary planted in a copy of the source, which must be found unless the row
  says it passes; the real source passes):

  | Canary | Result |
  |---|---|
  | `<td class="app-x">` in a `.svelte` file | finding |
  | ``<td class={`x-${kind}`}>`` in a `.svelte` file (a form not in the list) | finding |
  | `<td class={["sdt-cell", "app-x"]}>` in a `.svelte` file | finding |
  | `<td class={{ "app-x": on }}>` in a `.svelte` file (a form not in the list) | finding |
  | `export const stripe = "app-x";` in `src/lib/classes.ts` | finding |
  | `const c = rowClass(row);` then `<tr class={c}>` (a form not in the list) | finding |
  | `<td class={["sdt-cell", end && "sdt-end", column.class]}>` | passes |
  | `<tr class={["sdt-row", rowClass?.(row)]}>` | passes |

  The scan reads every `class` attribute of the `.svelte` files under `src/lib`. It knows these forms: a quoted literal
  (`class="sdt-x sdt-y"`); and an expression that is a string literal or an array whose elements are each a string
  literal, `condition && "literal"`, a member `class` or `headerClass` of a column value (PRD-T7, PRD-T14), a call of
  `rowClass` or `cellClass`, optional call included (PRD-T8), or a name imported from `src/lib/classes.ts`. Every
  literal must consist of class names that are `sdt` or start with `sdt-`, and so must every string in
  `src/lib/classes.ts`, the one `.ts` file that holds class strings (a `.ts` file elsewhere holds none: review, PRD-G2
  (e)). A class attribute in any other form is a finding; a form joins this list when a statement needs it. Once the
  package is built (PRD-K2), the same holds for the tarball. The scan reports how many class attributes it read; with 0
  it reports "could not check".
- Reason: one prefix keeps the component's classes from colliding with an application's or a framework's (PRD-T15),
  and the application's own classes enter only where it put them.
- Layer: static check.
- Traces: PRD-T15.

**THEME-09** The public classes MUST sit exactly on these elements: `sdt` on the one element that holds everything
the table component renders (the `heading` and `actions` snippets, the region, and the alert of RND-13),
`sdt-table` on the `table`, `sdt-head-row` on the header row, `sdt-th` on every header cell, `sdt-row` on every body
data row, `sdt-cell` on every body cell, and `sdt-pager` on the pager's `nav`.
- Examples (the test counts the elements carrying each class, and checks each sits on the element named):

  | Props | `sdt` | `sdt-table` | `sdt-head-row` | `sdt-th` | `sdt-row` | `sdt-cell` |
  |---|---|---|---|---|---|---|
  | `status 'ready'`, 3 rows, 2 columns | 1 | 1 | 1 | 2 | 3 | 6 |
  | `status 'ready'`, 0 rows, 2 columns (the empty text in its body row) | 1 | 1 | 1 | 2 | 0 | 1 |
  | `status 'ready'`, 2 rows, 2 columns, a `heading` and an `actions` snippet | 1 | 1 | 1 | 2 | 2 | 4 |
  | `columns []` (the alert of RND-13), a `heading` snippet | 1 | 0 | 0 | 0 | 0 | 0 |

  In every row the element with `sdt` contains the heading, the actions, the region and the alert where they are
  rendered. A `Pagination` with `offset 0, limit 10, total 25` has exactly one element with `sdt-pager`, its `nav`. No
  other element carries one of the seven classes.
- Reason: the seven classes are public interface, and removing one or moving it to another element is a breaking
  change (PRD-K3); an application's selectors rely on where they sit.
- Layer: component.
- Traces: PRD-K3.

**THEME-10** On each host page, every element of the table MUST have, for each property of PRD-T11's named set
listed for it below, the computed value that the literal table of its test states.
- Examples (the test loads each host page in its own browser context and first asserts the order of
  `document.styleSheets`; then it runs every row on both hosts, with a table of `caption` "Orders", `regionLabel`
  "Orders table", 2 columns, none sortable, and 2 rows, `status 'ready'`, then again with 0 rows; the page holds no
  `Pagination`):

  | Host page | Its stylesheets, in this order, each a static file linked unbundled |
  |---|---|
  | none | the package's stylesheet |
  | Bootstrap 5.3 | Bootstrap 5.3's compiled CSS (unlayered), then the package's stylesheet |

  | Element | Properties |
  |---|---|
  | the region of A11Y-09 | `display`, `position`, `box-sizing`, `margin-*`, `padding-*`, `border-*-width`, `border-*-style` |
  | `table` | the region's, and `border-collapse` |
  | `caption` | the region's, `caption-side`, `text-align`, `clip`, `clip-path`, `overflow`, `white-space`, `width`, `height` |
  | the header row and each body row (the empty message's row included) | the region's |
  | each header cell, each body cell, the empty message's cell (STATE-03) | the region's, and `text-align` |
  | every element above | `font-family`, `font-size` and `line-height` equal those of its parent element |

  The builder writes each expected value literally: the computed form of the stylesheet's declaration for that element
  and property (lengths in CSS px at a 16 px root), or, where the stylesheet sets nothing for it, the value computed on
  the "none" page in each engine; where the engines differ, the row gives one value per engine. The default row divider
  (no `row-border` variant, `docs/departures.md`) is in these rows: each body data row but the last has a block-end
  border on its cells; the last row and the empty message's cell have none. The caption also measures at most 1 by 1 CSS
  px on both hosts, as A11Y-13 measures. The test lands with the first stylesheet commit (PRD-T11), so that commit comes
  with or after the first commit after which the CI `browser` job (`docs/engineering/gates.md`) runs a test; until
  then this statement is not yet tested.
- Reason: the table must look the same whatever the application loaded first (PRD-T11 (a)); a literal table makes the
  "none" host able to fail, where a comparison with it could not. Bootstrap's reboot changed caption padding, `th`
  alignment and the dividers of a seed table (MEASURED 2026-11-18 in an earlier probe). Loaded in the reverse order (the
  stylesheet before Bootstrap 5.3.9), a stub of the stylesheet whose selectors are at most one class, on that seed table
  (a caption, a header row and 20 body rows), gave computed values with 0 differences from the advised order in 22
  properties of the table, caption, header cell, body cell and first and last body rows (MEASURED 2026-11-18, headless
  Chrome 157 only); the properties the stub set nowhere took Bootstrap's values in both orders (among them the caption's
  and rows' `box-sizing` and the inherited `caption-side`, font and colour), which is why every named property is a row.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T11.

**THEME-11** On each host, an application rule of a class and an element on a body cell MUST override the
stylesheet's padding.
- Example: each host page of THEME-10 with, after the package's stylesheet, one application file holding
  `.app td { padding: 4px }`, and the table of THEME-10 inside an element with class `app`: every body cell's
  `padding-top`, `padding-right`, `padding-bottom` and `padding-left` compute to `4px`. A second table outside
  `.app`, `regionLabel` "Other table", on the same page keeps the stylesheet's padding. These are their own pages:
  THEME-10's pages hold no application file. Not yet tested until then, as THEME-10.
- Reason: an application restyles the table with an ordinary rule, without `!important` (PRD-T11 (b), PRD-D9); the
  stylesheet's one-class selectors (THEME-12) make that hold in this load order.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T11, PRD-D9.

**THEME-12** A selector of the package's stylesheet MUST NOT have a specificity above one class (0,1,0), counted
without its pseudo-elements, and a declaration MUST NOT carry `!important`.
- Examples (the check runs every row against a canary stylesheet holding it):

  | Rule in a canary stylesheet | Result |
  |---|---|
  | `.sdt-a .sdt-b { color: inherit }` (0,2,0) | finding |
  | `.sdt-row:not(:last-child) { color: inherit }` (0,2,0) | finding |
  | `#x { color: inherit }` (1,0,0) | finding |
  | `:is(.sdt-a, .sdt-b .sdt-c) { color: inherit }` (0,2,0, the most specific argument) | finding |
  | `.sdt-a:has(.sdt-b) { color: inherit }` (0,2,0) | finding |
  | `.sdt-a { & .sdt-b { color: inherit } }` (nested: 0,2,0) | finding |
  | `.sdt-x { color: inherit !important }` | finding |
  | `.sdt-x { color: inherit }` (0,1,0) | passes |
  | `.sdt-x::after { content: "" }` (0,1,0 without the pseudo-element) | passes |
  | `.sdt-row:where(:not(:last-child)) { color: inherit }` (0,1,0) | passes |

  Specificity follows Selectors Level 4 (`:is()`, `:not()` and `:has()` take their most specific argument, `:where()`
  counts 0), a nested rule counts with its parents, and the pseudo-elements are left out. The check reads the
  stylesheet of THEME-04, reports how many selectors it read, and with 0 reports "could not check".
- Reason: an application's unlayered rule of a class and an element (0,1,1) then wins in any load order, and an
  `!important` in the shipped sheet would beat every override (PRD-T16, PRD-D9).
- Layer: static check.
- Traces: PRD-T16.

**THEME-07** The component source MUST NOT give an element a `style` attribute, in markup or through
`setAttribute`, nor a `style:` directive.
- Examples (each row, placed in a canary file, is a finding of the ban that names it; that the component source,
  holding none of them, is not a finding is checked from the pull request that adds `src/lib`):

  | Inline style in a canary file |
  |---|
  | `<p style="color: red"></p>` |
  | `<p style={x}></p>` |
  | `<svelte:element this="p" style="color: red"></svelte:element>` |
  | `<p {style}></p>` |
  | `<p style:color="red"></p>` |
  | `el.setAttribute("style", x)` |

  Setting one property of an element's `style` object (`el.style.width = w`, `el.style.setProperty("width", w)`)
  stays allowed: the policy does not refuse it.
  A static check sees literal names and plain string literals only: a name built at run time, a template literal, a
  cast, an alias (`const set = el.setAttribute.bind(el); set("style", x)`), `Reflect.set`, `setAttributeNS` or a computed `svelte:element`
  `this` is not seen, and such code is left to review.
- Reason: server rendering writes each markup form as a `style="..."` attribute (MEASURED 2026-11-18, Svelte 5.57.3), which the
  strict policy refuses (PRD-S1), and `setAttribute("style", ...)` is refused in the browser; a `style:` directive is
  also a form the mutation tool does not mutate (PRD-G2).
- Layer: static check.
- Traces: PRD-S1, PRD-G2.

**THEME-13** Each rule of the package's stylesheet MUST be directly preceded by a marker comment naming a
real-browser statement.
- Examples (the check runs every row against a canary stylesheet holding it; the marker is `/* @spec("<id>") */`, the
  id form of the test markers):

  | Canary stylesheet | Result |
  |---|---|
  | `/* @spec("THEME-10") */ .sdt-x { color: inherit }` | passes |
  | `.sdt-x { color: inherit }` | finding: no marker |
  | `/* @spec("THEME-99") */ .sdt-x { color: inherit }` | finding: no spec holds the id |
  | `/* @spec("THEME-12") */ .sdt-x { color: inherit }` | finding: THEME-12 is not a real-browser statement |
  | `@media (min-width: 40rem) { /* @spec("THEME-10") */ .sdt-x { color: inherit } }` | passes |
  | `/* @spec("THEME-10") */ @media (min-width: 40rem) { .sdt-x { color: inherit } }` | finding: the rule inside has no marker |
  | `/* @spec("THEME-10") */ @keyframes sdt-spin { from { opacity: 0 } to { opacity: 1 } }` | passes: one rule |
  | `@charset "utf-8";` and nothing else | could not check: content and 0 rules |

  A rule is a style rule (also inside `@media`, `@supports` or `@container`), a `@keyframes` block (its keyframe
  selectors are not rules), a `@font-face` or a `@property` rule. The check reads the stylesheet of THEME-04 and
  reports how many rules it read; while that stylesheet does not exist it reports "not applicable: no stylesheet".
  It lands in the walking-skeleton milestone, with the gate's trace check and the stylesheet, and is not yet tested
  until then.
- Reason: the gate's other checks cannot see the stylesheet (PRD-G4); a rule that names the statement whose test
  proves it is what THEME-14 deletes and checks, and only a real-browser test can turn red when a rule goes.
- Layer: static check.
- Traces: PRD-G4.

**THEME-14** At each step boundary, deleting a rule of the package's stylesheet that the step changed MUST turn the
tests of the statement its marker names red by a failed assertion.
- Examples (the wrapper runs every row on a canary step that changes one rule marked `@spec("THEME-10")`):

  | Tests of THEME-10 with the rule deleted | Run | Result |
  |---|---|---|
  | red by a failed assertion in at least one engine | CI, Chromium, Firefox and WebKit | passes |
  | green in all three engines | CI | finding: the rule is not proven by THEME-10's tests |
  | not run in WebKit | CI | could not check |
  | a crash, a time-out or no test run | CI or local | could not check |
  | green in Chromium | local (Chromium only) | not applicable: "CI decides: not red in Chromium", naming the rule and THEME-10 |
  | red by a failed assertion in Chromium | local | passes |

  A rule is changed when its at-rule context, selector, declarations and marker, white space normalised, have no
  equal at the base. A stylesheet diff with no changed rule is "not applicable: format only" when the two normalised
  stylesheets are equal, and "could not check" otherwise. It lands in the walking-skeleton milestone, once the gate's
  step-boundary harness and the three engines of the real-browser tests exist, and is not yet tested until then.
  Limit: a rule its tests do not prove shows red only in CI.
- Reason: a rule no test needs is dead or unproven (PRD-G4); no established practice for deleting CSS rules was found
  (searched 2026-11-18), so this is the stylesheet's analogue of mutation at step boundaries.
- Layer: gate wrapper at step boundaries.
- Traces: PRD-G4.

## 7. Server-driven sort (SORT)

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

  While loading or failed the table with its header and sort buttons stays (the `table` element is present in both
  states, STATE-04); STATE-06 and STATE-07 hide the rows, not the header.

- Reason: a keyboard user who sorts twice in a row must not have to find the button again, and focus must never fall
  to the page body (WCAG 2.4.3).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A3.

**A11Y-03** Only the header of the column leading the order MUST carry `aria-sort`.
- Examples (the test runs every row; Code and Name are both sortable):

  | Order | Code header | Name header |
  |---|---|---|
  | `[code asc, name desc]` | `aria-sort="ascending"` | no `aria-sort` |
  | `[name desc]` | no `aria-sort` | `aria-sort="descending"` |
  | `[]` | no `aria-sort` | no `aria-sort` |

  The column group states the case where the lead column is hidden in its own statement.
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
  punctuate it freely (SORT-17). `direction` is `'asc'`, `'desc'` or `null` (unsorted); `rank` is the column's place
  in the order while two or more columns are sorted, else `null`. The four rows above call it with
  `{ direction: 'asc', rank: null }`, `{ direction: 'desc', rank: 1 }`, `{ direction: 'desc', rank: 3 }` and
  `{ direction: null, rank: null }`.
- Reason: `aria-sort` is on one header only (A11Y-03), so the other sorted columns need words.
- Layer: component.
- Traces: PRD-B5, PRD-A2.

**SORT-14** The table MUST render the rows in exactly the order given also while a `sort` prop names an order.
- Example (as RND-01, for the sort props): rows r3 "Gamma", r1 "Alpha", r2 "Beta", Name sortable, `sort` `[name asc]`,
  `onsort` given: the body shows r3, r1, r2.
- Reason: `sort` describes the order the server applied; the table showing another order would contradict the server.
- Layer: component.
- Traces: PRD-B1.

**SORT-15** For invalid sort input the table MUST render the alert of RND-05 with the fixed message the examples below
list.
- Examples (as RND-05, for the sort props; the test runs every row: one element with `role="alert"` holding the
  default text, and no `table` element):

  | Invalid input | Message key | Alert text (default) |
  |---|---|---|
  | a column's `sortable` lists no direction, or a direction other than `asc` and `desc` | `sortableInvalid` | "A column's sort directions are invalid." |
  | a column is sortable and `onsort` is not given | `sortHandlerMissing` | "A sortable column has no sort handler." |
  | `sort` names a column that is not configured | `sortColumnUnknown` | "The sort names an unknown column." |
  | `sort` names a column that is not sortable | `sortColumnNotSortable` | "The sort names a column that cannot be sorted." |
  | `sort` gives a column a direction it does not allow | `sortDirectionNotAllowed` | "The sort uses a direction a column does not allow." |
  | `sort` names a column twice | `sortColumnDuplicate` | "The sort names a column twice." |

  With several faults at once, a fault of RND-05's table wins over one of the table above, and within the table above
  the first row that applies wins (for example an empty caption and an unknown sort column: "Table caption must not be
  empty.").
- Reason: a sort the table cannot show is a wrong table; the user would believe an order the rows do not have.
- Layer: component.
- Traces: PRD-B16, PRD-B3, PRD-B4.

**SORT-16** The alert MUST hold no value taken from the `sort` prop or from the definitions of the columns it names.
- Examples (as RND-09, for the sort props; the test runs every row, and in each it first finds the alert holding the
  SORT-15 message for that input):

  | Invalid input | Text that must not appear in the alert |
  |---|---|
  | `sort` `[col-z3 asc]`, no column `col-z3` | "col-z3" |
  | `sort` names the column `col-w4`, labelled "Secret-5", twice | "col-w4", "Secret-5" |

- Reason: alerts are often logged or screenshotted, and column ids and labels can name confidential things.
- Layer: component.
- Traces: PRD-S4, PRD-B16.

**SORT-17** Every fixed word of sort MUST come from a prop with an English default.
- Examples (as RND-06, for the sort words; the test runs every row in the set-up of its "Shown by" statement, the
  alert rows with that statement's invalid input; it passes a full `messages` object of non-English words, then
  checks that each replacement appears where the row says and that no English default is left on the page, in an
  accessible name or in a description):

  | Message | English default | Shown by |
  |---|---|---|
  | `sortBy` (a function of the label) | "Sort by Name" for the label "Name" | SORT-09 |
  | `sortRank` (a function of the rank) | "2" for rank 2 | SORT-05, I18N-01 |
  | `sortDescription` (a function of `{ direction, rank }`, SORT-06) | the four descriptions of SORT-06 | SORT-06, I18N-01 |
  | each alert message of SORT-15 | its default in SORT-15 | SORT-15 |

- Reason: consumers translate and reword without forking the component.
- Layer: component.
- Traces: PRD-I1, PRD-I2.

**SORT-18** Hovering or focusing a sort button MUST NOT make content appear, other than its own focus indicator.
- Example (as A11Y-16, for the sort buttons): three sortable columns and the order `[code asc, name desc]`: hover and
  focus each sort button in turn; after each step the page's visible text and the set of visible elements equal those
  before the step (visible as A11Y-16 defines it).
- Reason: content that appears on hover or focus can cover what the user reads (WCAG 1.4.13).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A10, PRD-A1.

**SORT-19** A sort button MUST show a visible focus indicator when it is focused by keyboard.
- Example (as A11Y-07, for the sort buttons): Tab to "Sort by Name"; its computed outline, or at least one entry of
  its computed box shadow, has a width (outline) or a spread or blur (shadow) of at least 1 CSS px with a colour
  whose alpha is above 0, and differs from its unfocused style; a transparent outline fails. Its contrast is a later
  statement (PRD-A12).
- Reason: keyboard users must see where they are (WCAG 2.4.7).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A1.

**SORT-20** axe MUST find no serious or critical violation in a table with sortable columns.
- Examples (as A11Y-06, for the sort controls; the test runs every row, at scroll 0; an axe *incomplete* item is
  listed for the maintainer's manual "contrast review of the listed nodes" and never counts as a pass):

  | State |
  |---|
  | three sortable columns, order `[]` |
  | three sortable columns, order `[code asc, name desc]` |

- Reason: an automated check catches regressions in names, roles and contrast that the statements above do not name.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A1.

**SORT-21** With no `--sdt-*` property defined, axe MUST find no serious or critical violation in the states of
SORT-20.
- Example (as THEME-03, for the sort controls): a site page with the package's stylesheet and no token definitions, in
  each state of SORT-20: axe reports 0 serious or critical violations (its colour-contrast rule included).
- Reason: the system-colour fallbacks are what make "usable without tokens" true for the sort controls too.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T2, PRD-A1.

**SORT-22** With no `--sdt-*` property defined, a keyboard-focused sort button MUST show a visible focus indicator.
- Example (as THEME-06, for the sort buttons): the page of SORT-21, measured as SORT-19 measures.
- Reason: the focus indicator must not depend on a token the consumer may not define.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T2, PRD-A1.

**SORT-23** Every text of sort MUST render as text, never as markup.
- Examples (as RND-03, for the sort words; the test runs every row, once with the value `<img src=x onerror=alert(1)>`
  and once with `<none>`, in the set-up of the statement the row names):

  | Prop that carries the text | Set-up |
  |---|---|
  | the returned text of `sortBy`, `sortRank` and `sortDescription` | SORT-17 |
  | each alert message of SORT-15 | SORT-15 |

  In every row the literal text appears on the page, in an accessible name or in an accessible description, and the
  component holds no `img` and no `none` element.
- Reason: a translation can come from anywhere, and any markup path is a cross-site scripting path.
- Layer: component.
- Traces: PRD-S2.

**SORT-24** While mounted and after unmount, a table with sortable columns MUST hold no event listener on `document`
or `window` beyond those Svelte adds for any component.
- Example (as FOOT-02, for the sort buttons): before the first mount, wrap `addEventListener` and
  `removeEventListener` on `document` and `window`; mount and unmount a control component that handles every event
  type the sort buttons handle to measure the listeners Svelte itself delegates to the
  document, which are excluded. Then mount a table with three sortable columns and the order `[code asc, name desc]`,
  press "Sort by Name" with and without Shift, rerender it with a new order, and unmount it: while it is mounted, the
  listeners added minus those removed, per target and event type, are none; after unmount, likewise none.
- Reason: a global listener (for example one that tracks the Shift key) outlives the component or fights the app's own
  handlers.
- Layer: component.
- Traces: PRD-B19.

**SORT-25** On each host page of THEME-10, each sort button MUST have, for each property listed for it below, the
computed value that the literal table of its test states.
- Example (as THEME-10, for the sort buttons: its host pages, its order check and its rule for the expected values;
  the table's first column sortable with an `onsort`):

  | Element | Properties |
  |---|---|
  | each sort button (SORT-10) | THEME-10's properties of the region, `appearance` and `text-align` |
  | each sort button | `font-family`, `font-size` and `line-height` equal those of its parent element |

- Reason: the sort controls must look the same whatever the application loaded first, as THEME-10 states for the
  table (PRD-T11 (a)).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T11.

## 8. The pager (PAGE)

`Pagination` is a separate component, so a consumer can place it anywhere or leave it out. The current page is
`offset / limit` rounded down, plus 1, except while `offset` is above 0 and at or past `total`, when no page is
current (PAGE-25); the number of pages is `total / limit` rounded up, and at least 1. "First page" and "Previous page"
can move unless `offset` is 0; "Next page" and "Last page" can move while the page that holds `offset` ends
before `total` (its number, `offset / limit` rounded down plus 1, times `limit` is below `total`). "Previous page"
moves to the page before the current one, or to offset 0 from page 1; past `total` it moves as PAGE-26 says.

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

**PAGE-25** With an `offset` above 0 at or past `total`, the pager MUST show the places of its last page with no
current page.
- Examples (the test runs every row; `limit 10`; no element in the pager has `aria-current`, and no alert is shown):

  | `offset` | `total` | Places shown |
  |---|---|---|
  | 100 | 95 | `1 … 6 7 8 9 10` |
  | 90 | 90 | `1 … 5 6 7 8 9` |
  | 25 | 0 | `1` |

- Reason: rows deleted between two requests leave an offset past the end; the pager shows where the data ends
  instead of marking a page that does not exist, and keeps the way back.
- Layer: component.
- Traces: PRD-B9.

**PAGE-26** With an `offset` above 0 at or past `total`, "Previous page" MUST emit the last page's offset.
- Examples (the test runs every row; `limit 10`; "Next page" and "Last page" are `aria-disabled` here, PAGE-05):

  | `offset` | `total` | "Previous page" emits |
  |---|---|---|
  | 100 | 95 | 90 |
  | 200 | 95 | 90 |
  | 25 | 0 | 0 |

  The second row tells the last page's offset from `offset` minus `limit` (190).
- Reason: the user's step back lands on real rows.
- Layer: component.
- Traces: PRD-B9.

**PAGE-27** With an `offset` that is not a multiple of `limit`, the step buttons and the page numbers MUST emit
offsets on the page grid.
- Examples (the test runs every row; an enabled button only, PAGE-05):

  | `offset`, `limit`, `total` | Current page, places | Press | `onpage` receives |
  |---|---|---|---|
  | 25, 10, 95 | 3, `1 2 3 4 5 … 10` | First page | 0 |
  | 25, 10, 95 | 3 | Previous page | 10 |
  | 25, 10, 95 | 3 | Next page | 30 |
  | 25, 10, 95 | 3 | Last page | 90 |
  | 25, 10, 95 | 3 | Page 5 | 40 |
  | 25, 10, 95 | 3 | Page 3 (the current page) | 20 |
  | 25, 50, 95 | 1, `1 2` | First page | 0 |
  | 25, 50, 95 | 1 | Previous page | 0 |
  | 25, 50, 95 | 1 | Next page | 50 |
  | 25, 50, 95 | 1 | Last page | 50 |
  | 91, 10, 95 | 10, `1 … 6 7 8 9 10` | Previous page | 80 |
  | 85, 10, 95 | 9, `1 … 6 7 8 9 10` | Next page | 90 |
  | 91, 10, 95 | 10 | Page 10 (the current page) | 90 |

- Reason: a consumer that keeps its offset after a size change still gets whole pages back, and the rows it skipped
  stay reachable.
- Layer: component.
- Traces: PRD-B9.

**PAGE-04** The current page's button MUST carry `aria-current="page"`, and no other control of the pager does.
- Example: `offset 25, limit 25, total 130`: "Page 2" has `aria-current="page"`; no other element in the pager has
  `aria-current`.
- Reason: assistive technology announces which page is shown, and colour alone would not (WCAG 1.4.1).
- Layer: component.
- Traces: PRD-B9, PRD-A1.

**PAGE-12** A press on the current page's button MUST emit nothing while `offset` is that page's own offset.
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
  | `offset 100, total 95` (past the last page) | Next page, Last page |
  | `offset 25, limit 50, total 95` (off the grid, on page 1 of 2) | none |
  | `offset 91, total 95` (off the grid, on the last page) | Next page, Last page |
  | `offset 85, total 95` (off the grid, on page 9 of 10) | none |

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
- Example: `limit 25, sizes [10, 25, 50]`: the element holding "entries per page" lies inside the viewport and inside
  the pager's box, is at least as wide as its text, has neither `clip` nor `clip-path` set, and its text colour has an
  alpha above 0; that text is the select's accessible name. With `messages.sizeLabel` "Zeilen" the visible text and the
  name are both "Zeilen". A visually hidden label (clipped to 1 by 1 CSS px) or one moved off-screen fails.
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
  | each entry of `messages`, the returned text of every function included |

  In every row the literal text appears in the pager's text or accessible names, and the pager holds no `img` and
  no `none` element. (`label` has no row: an attribute value has no markup path.)
- Reason: a translation can come from anywhere, and any markup path is a cross-site scripting path.
- Layer: component.
- Traces: PRD-S2.

**PAGE-28** Hovering or focusing any control of the pager MUST NOT make content appear, other than the focused
control's own focus indicator.
- Example (as A11Y-16, for the pager): a `Pagination` of 20 pages on page 11, with `sizes`: hover and focus each of its
  controls in turn; after each step the page's visible text and the set of visible elements equal those before the
  step (visible as A11Y-16 defines it).
- Reason: content that appears on hover or focus can cover what the user reads (WCAG 1.4.13).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A10, PRD-A1.

**PAGE-29** Every control of the pager MUST show a visible focus indicator when it is focused by keyboard.
- Examples (as A11Y-07, for the pager; the test runs every row; Tab to the element; its computed outline, or at least
  one entry of its computed box shadow, has a width (outline) or a spread or blur (shadow) of at least 1 CSS px with a
  colour whose alpha is above 0, and differs from its unfocused style; a transparent outline fails; its contrast is a
  later statement, PRD-A12):

  | Element |
  |---|
  | each step button and a page number button of a `Pagination` of 20 pages on page 11, with `sizes` |
  | "First page" and "Previous page", both `aria-disabled`, of the same pager on page 1 (`offset 0`) |
  | the page-size select |

- Reason: keyboard users must see where they are (WCAG 2.4.7).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A1.

**PAGE-30** axe MUST find no serious or critical violation in any state of the pager.
- Examples (as A11Y-06, for the pager; the test runs every row, at scroll 0; an axe *incomplete* item is listed for the
  maintainer's manual "contrast review of the listed nodes" and never counts as a pass):

  | State |
  |---|
  | a `Pagination` of 20 pages on page 11, with `sizes` |
  | a `Pagination` with `total 0` |
  | the alert of PAGE-16 |

- Reason: an automated check catches regressions in names, roles and contrast that the statements above do not name.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A1.

**PAGE-31** Mounting, rerendering and unmounting the pager MUST leave the root element's attributes and inline style
unchanged.
- Example (as FOOT-01, for the pager): snapshot the attributes and the inline style of `document.documentElement`;
  mount a `Pagination` with `sizes`, rerender it to another offset, then unmount it: after mount, after the rerender
  and after unmount, both equal the snapshot.
- Reason: the root element belongs to the app; a component that writes there fights the app's own layout.
- Layer: component.
- Traces: PRD-B19.

**PAGE-32** While mounted and after unmount, the pager MUST hold no event listener on `document` or `window` beyond
those Svelte adds for any component.
- Example (as FOOT-02, for the pager): before the first mount, wrap `addEventListener` and `removeEventListener` on
  `document` and `window`; mount and unmount a control component that handles every event type the pager's own
  elements handle (`click`, `keydown` and `change`) to measure the listeners Svelte itself delegates to the document,
  which are excluded. Then take a `Pagination` with `sizes` through the steps of PAGE-31: while it is mounted, the
  listeners added minus those removed, per target and event type, are none; after unmount, likewise none.
- Reason: a global listener outlives the component or fights the app's own handlers.
- Layer: component.
- Traces: PRD-B19.

**PAGE-33** Mounting the pager, giving it a new offset and unmounting it MUST NOT scroll the window.
- Example (as FOOT-03, for the pager): the test page of FOOT-03 with a `Pagination` in place of the table, the window
  scrolled to 1200 px: mount it, give it a new offset, unmount it: after each step the window's `scrollX` and
  `scrollY` are unchanged.
- Reason: users keep their place; a pager that scrolls the page to itself takes the reader away from what they read.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B19, PRD-A3.

**PAGE-34** With no `--sdt-*` property defined, axe MUST find no serious or critical violation in any state of the
pager.
- Example (as THEME-03, for the pager): a site page with the package's stylesheet and no token definitions, in
  each state of PAGE-30:
  axe reports 0 serious or critical violations (its colour-contrast rule included).
- Reason: the system-colour fallbacks are what make "usable without tokens" true for the pager too.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T2, PRD-A1.

**PAGE-35** With no `--sdt-*` property defined, a keyboard-focused control of the pager MUST show a visible focus
indicator.
- Example (as THEME-06, for the pager): the page of PAGE-34, measured as PAGE-29 measures, on each row of PAGE-29.
- Reason: the focus indicator must not depend on a token the consumer may not define.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T2, PRD-A1.

**PAGE-36** On each host page of THEME-10, the pager's elements MUST have, for each property listed for them below,
the computed value that the literal table of its test states.
- Example (as THEME-10, for the pager: its host pages, its order check and its rule for the expected values; beside
  the table each page holds a `Pagination` with `label` "Pages", `offset 0, limit 10, total 25` and `sizes [10, 25]`):

  | Element | Properties |
  |---|---|
  | the pager's `nav` | THEME-10's properties of the region |
  | each button of the pager and its page-size `select` | THEME-10's properties of the region, and `appearance` |
  | every element above | `font-family`, `font-size` and `line-height` equal those of its parent element |

- Reason: the pager must look the same whatever the application loaded first, as THEME-10 states for the table
  (PRD-T11 (a)).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T11.

## 9. Ids across instances and server rendering (ID)

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

## 10. Numbers (I18N)

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

## Trace

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
| RND-13 | PRD-B16, PRD-B15 |
| RND-14 | PRD-A3, PRD-B16 |
| RND-15 | PRD-B1 |
| RND-16 | PRD-B1 |
| RND-06 | PRD-I1, PRD-I2 |
| RND-07 | PRD-B3 |
| RND-11 | PRD-B3 |
| RND-12 | PRD-B3, PRD-B8 |
| STATE-01 | PRD-B15 |
| STATE-02 | PRD-B15 |
| STATE-03 | PRD-B15 |
| STATE-04 | PRD-B15 |
| STATE-05 | PRD-B2, PRD-B1 |
| STATE-06 | PRD-B15 |
| STATE-07 | PRD-B15 |
| STATE-08 | PRD-B15, PRD-B16 |
| A11Y-01 | PRD-A2 |
| A11Y-13 | PRD-A2 |
| A11Y-09 | PRD-A2 |
| A11Y-12 | PRD-A2, PRD-A3 |
| A11Y-08 | PRD-A3, PRD-A2 |
| A11Y-02 | PRD-A2 |
| A11Y-04 | PRD-A2 |
| A11Y-10 | PRD-A3 |
| A11Y-05 | PRD-A4, PRD-B15 |
| A11Y-14 | PRD-A4 |
| A11Y-15 | PRD-A4, PRD-B15 |
| A11Y-16 | PRD-A10, PRD-A1 |
| A11Y-07 | PRD-A1 |
| A11Y-06 | PRD-A1 |
| EXP-02 | PRD-B17, PRD-B16 |
| EXP-01 | PRD-B17 |
| EXP-03 | PRD-S3, PRD-B17 |
| FOOT-01 | PRD-B19 |
| FOOT-02 | PRD-B19 |
| FOOT-03 | PRD-B19, PRD-A3 |
| FOOT-04 | PRD-S1, PRD-T3, PRD-T15, PRD-B19 |
| THEME-01 | PRD-T1 |
| THEME-02 | PRD-T1 |
| THEME-03 | PRD-T2, PRD-A1 |
| THEME-06 | PRD-T2, PRD-A1 |
| THEME-04 | PRD-T3, PRD-T15 |
| THEME-08 | PRD-T15 |
| THEME-09 | PRD-K3 |
| THEME-10 | PRD-T11 |
| THEME-11 | PRD-T11, PRD-D9 |
| THEME-12 | PRD-T16 |
| THEME-13 | PRD-G4 |
| THEME-14 | PRD-G4 |
| THEME-07 | PRD-S1, PRD-G2 |
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
| SORT-14 | PRD-B1 |
| SORT-15 | PRD-B16, PRD-B3, PRD-B4 |
| SORT-16 | PRD-S4, PRD-B16 |
| SORT-17 | PRD-I1, PRD-I2 |
| SORT-18 | PRD-A10, PRD-A1 |
| SORT-19 | PRD-A1 |
| SORT-20 | PRD-A1 |
| SORT-21 | PRD-T2, PRD-A1 |
| SORT-22 | PRD-T2, PRD-A1 |
| SORT-23 | PRD-S2 |
| SORT-24 | PRD-B19 |
| SORT-25 | PRD-T11 |
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
| PAGE-28 | PRD-A10, PRD-A1 |
| PAGE-29 | PRD-A1 |
| PAGE-30 | PRD-A1 |
| PAGE-31 | PRD-B19 |
| PAGE-32 | PRD-B19 |
| PAGE-33 | PRD-B19, PRD-A3 |
| PAGE-34 | PRD-T2, PRD-A1 |
| PAGE-35 | PRD-T2, PRD-A1 |
| PAGE-36 | PRD-T11 |
| ID-01 | PRD-B18 |
| ID-02 | PRD-B18 |
| ID-03 | PRD-B18, PRD-K4 |
| I18N-01 | PRD-I2, PRD-I1 |
| A11Y-17 | PRD-A3 |
| A11Y-18 | PRD-A1 |
| A11Y-19 | PRD-A3 |
| PAGE-25 | PRD-B9 |
| PAGE-26 | PRD-B9 |
| PAGE-27 | PRD-B9 |

### PRD must -> statements (the musts the statements so far touch)

"In full" means the statements so far are every statement the requirement needs; "in part" names what later groups
state in their own statements.

| PRD id | Statements | Coverage |
|---|---|---|
| PRD-B1 | RND-01, STATE-05, SORT-14, RND-15, RND-16 | in part: the filter group states in its own statement that given filters still leave the rows unfiltered; an empty or duplicate row or column id is refused by RND-05 (PRD-B16) |
| PRD-B2 | STATE-05, SORT-01, SORT-03, SORT-12, PAGE-01, PAGE-12, PAGE-13, PAGE-14, PAGE-21, PAGE-22 | in part: the filter, column and selection groups add their one-callback and props-only statements and the rest of the internal-state list |
| PRD-B3 | RND-02, RND-08, RND-05, RND-07, RND-11, RND-12, SORT-10, SORT-15 | in part: the filter group states the positive halves of RND-11 and RND-12 in its own statements |
| PRD-B4 | SORT-10, SORT-01, SORT-02, SORT-03, SORT-04, SORT-12, SORT-15 | in part: the column group adds "hidden columns keep their place" |
| PRD-B5 | SORT-09, SORT-13, SORT-05, SORT-06 | in part: the column group states, in its own statements, ranks that count hidden columns and the toolbar summary while a sorted column is hidden |
| PRD-B8 | RND-12 | in part: the filter statements add the badges, "Clear column filters", "Reset table" and the `criteria` snippet |
| PRD-B9 | PAGE-01 to PAGE-27 except PAGE-19 and PAGE-20 | in full |
| PRD-B15 | STATE-01, STATE-02, STATE-03, STATE-04, STATE-06, STATE-07, STATE-08, A11Y-15, RND-13, A11Y-05 | in full |
| PRD-B16 | RND-05, RND-09, RND-10, RND-13, RND-14, STATE-08, EXP-02, SORT-15, SORT-16 | in full for the props so far; later groups state the faults of their own props in their own statements |
| PRD-B17 | EXP-02, EXP-01, EXP-03 | in full |
| PRD-B18 | ID-01, ID-02, ID-03 | in part: each later group that adds an id reference states its instances in its own statement |
| PRD-B19 | FOOT-01, FOOT-02, FOOT-03, FOOT-04, SORT-24, PAGE-31, PAGE-32, PAGE-33 | in part: the dialog groups add the one passive outside-press listener and the Escape rule |
| PRD-A1 | A11Y-06, A11Y-07, A11Y-16, A11Y-18, THEME-03, THEME-06, SORT-09, SORT-13, SORT-18, SORT-19, SORT-20, SORT-21, SORT-22, PAGE-09, PAGE-11, PAGE-04, PAGE-24, PAGE-28, PAGE-29, PAGE-30, PAGE-34, PAGE-35 | in part: "with none" (no tokens) is THEME-03, THEME-06, SORT-21, SORT-22, PAGE-34 and PAGE-35; "with the example tokens" arrives with PRD-T4; target size for the sort and pager controls arrives with the PRD-A6 statements; the remaining criteria of PRD section 4.3 arrive with the controls they concern |
| PRD-A2 | A11Y-01, A11Y-13, A11Y-09, A11Y-12, A11Y-08, A11Y-02, A11Y-04, A11Y-03, SORT-06 | in part: the column group states the hidden-lead case and the sticky group the `stickyHeader` case, each in its own statement |
| PRD-A3 | A11Y-12, A11Y-08, A11Y-10, FOOT-03, RND-14, SORT-11, PAGE-10, PAGE-05, PAGE-21, PAGE-06, PAGE-23, A11Y-17, A11Y-19, PAGE-33 | in part: focus and no-scroll after the intents of later groups, and the place of the sort buttons and "Reset table" in the Tab order, arrive as the later groups' own statements |
| PRD-A4 | A11Y-05, A11Y-14, A11Y-15 | in part: the column group states the column-move announcement |
| PRD-A10 | A11Y-16, SORT-18, PAGE-28 | in part: the skip-link and dialog groups state their own controls in their own statements |
| PRD-I1 | RND-06, SORT-17, PAGE-19, I18N-01 | in part: later groups state their own words in their own statements |
| PRD-I2 | RND-06, SORT-17, I18N-01 | in part: later groups state the numbers they show in their own statements |
| PRD-S1 | FOOT-04, THEME-07 | in part: the client-rendered zero-violation half is `spec/site.md`'s (POL-01, POL-02, POL-04); the server-rendered half is `spec/package.md`'s (CON-03 to CON-05), its zero-violation check not yet stated (CON-07 reserved); no `eval`, `new Function` or string timers in the build comes with the built-package scans (PRD-K2) |
| PRD-S2 | RND-03, RND-04, SORT-23, PAGE-20 | in part: later groups state their own props in their own statements |
| PRD-S3 | EXP-03 | in part: no network request, cookie or web storage arrive with the strict-policy group |
| PRD-S4 | RND-09, SORT-16, PAGE-16 | in part: the filter group states its refusal messages in its own statement |
| PRD-P2 | PAGE-03 | in part: the large-pages group adds the time budgets |
| PRD-K4 | ID-03 | in part: the release and site specs prove it on the packed package and in three engines |
| PRD-T1 | THEME-01, THEME-02 | in part: the built-package half of each scan runs once the package is built (PRD-K2) |
| PRD-T2 | THEME-03, THEME-06, SORT-21, SORT-22, PAGE-34, PAGE-35 | in part: the sticky group states "the header is opaque over rows" |
| PRD-T3 | THEME-04, FOOT-04 | in part: the export path is PKG-05 and the consumer's layered import CON-10, both of `spec/package.md`; the documented import lines arrive with PRD-D1; the built-package half runs once the package is built (PRD-K2) |
| PRD-T15 | THEME-04, THEME-08, FOOT-04 | in part: the built-package half runs once the package is built (PRD-K2); the hook props' own classes are stated with PRD-T7, PRD-T8 and PRD-T14 |
| PRD-T11 | THEME-10, THEME-11, SORT-25, PAGE-36 | in part: the Tailwind 4 host is CON-12 and CON-13 of `spec/package.md`, which land with the consumer project's build step, after the first stylesheet commit; the sort buttons (SORT-25) and the pager (PAGE-36) land with their own milestones; the fields, the sort marks, the chooser, the dialogs and the progress indicator add their own statements as THEME-10 for them; the owner's checkpoint at the end of the walking-skeleton milestone is the plan's |
| PRD-T16 | THEME-12 | in full |
| PRD-K3 | THEME-09 | in part: the public classes on their elements; the documented ARIA state selectors and what counts as breaking are not stated yet |
| PRD-G2 | THEME-07 | in part: rule (b) for `style:` only; the other forms and rules (a), (c) to (e) come with the gate statements |
| PRD-G4 | THEME-13, THEME-14 | in full |

### PRD musts not yet traced

- Filter and criteria: PRD-B6, PRD-B7.
- Columns (chooser, reorder, resize): PRD-B10, PRD-B11, PRD-B12.
- Selection: PRD-B13.
- Sticky layout: PRD-B14.
- Accessibility beyond the read-only table: PRD-A5, PRD-A6, PRD-A7, PRD-A8, PRD-A9, PRD-A11, PRD-A12.
- Theming: PRD-T4 (the example token set, light and dark), PRD-T7, PRD-T8, PRD-T10, PRD-T13, PRD-T14.
- Internationalisation: PRD-I3.
- Large pages, size and memory: PRD-P1, PRD-P3, PRD-P4, PRD-P5.
- Browsers: PRD-E1.
- Packaging: PRD-K1, PRD-K2 (in part in `spec/package.md`).
- Gate: PRD-G1, PRD-G3 (PRD-G2 in part, see above).
- Documentation: PRD-D1, PRD-D2, PRD-D3, PRD-D4, PRD-D5, PRD-D6, PRD-D7, PRD-D8, PRD-D9.
- Licence: PRD-L1.
- Supply chain and publishing: PRD-S5, PRD-S7.
- Test site and consumer project: PRD-W1, PRD-W2, PRD-W3, PRD-W4, PRD-W5, PRD-W6, PRD-W7, PRD-W8, PRD-W9, PRD-W10.
