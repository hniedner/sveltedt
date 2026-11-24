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
  functions, and focus and window scroll after a sort or pager intent. Then slow loads: the progress indicator,
  "Cancel", the stopped state and "Try again".

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
  order, a list of `{ id, direction }`, `direction` being `'asc'` or `'desc'`, lead first), a column's `sortable`
  (the directions it allows, `'asc'` and/or `'desc'`; a press steps through them in the order listed) and
  `onsort(next)`; and the props of `Pagination`:
  `offset`, `limit`, `total`, `label`, `sizes`,
  `messages`, `onpage(offset)`, `onsize(n)` and `unfilteredTotal` (optional). Later groups add their own props: the slow-load statements of
  milestone 3 add the `status` value `'stopped'`, `oncancel()`, `onretry()` and the `messages` keys `stillLoading`,
  `cancel`, `stopped` and `retry`; the filter statements of milestone 4 add a column's `filter`, `filters`,
  `onfilter(columnId, state)`, `searchDelay`, `searchOnEnter` and `maxLength` (section 11), and `onclearfilter(columnId)`,
  `onclearfilters()`, `onreset()` and the snippet `criteria`, and `search` and `onsearch(text)` (the global search);
  the column statements of milestone 5 add `columnState` and `oncolumnstate(next)` (section 12); the selection
  statements of milestone 6 add `selection`, `onselectrow(event)` and `onselectpage(selected)` (section 13), the
  sticky statements `stickyHeader`, `stickyTop` and a column's `sticky` (section 14), and the child-row statements the
  snippet `detail`, `detailName(row)`, `expanded` and `onexpand(event)` (section 15); and the class hooks of milestone 8
  a column's `class`, `headerClass` and `align`, `rowClass(row)` and `cellClass(row, column)` (section 17).
- **Orders in examples** are written `[code asc, name desc]`: the lead first; `asc` is `{ id, direction: 'asc' }`.
  Column Name has id `name`, Code has id `code`, Date has id `date`. Every sortable column in an example allows both
  directions unless the row says otherwise. An example with a sortable column passes an `onsort`; an example with a column filter passes `onfilter`,
  `onclearfilter` and `onclearfilters`; an example pager
  passes an `onpage`, and an `onsize` when it has `sizes`.
- **Pager places.** The pager shows page numbers and gaps; each counts as one place. "Page n" is a page number
  button. A row such as `1 … 4 5 6 … 20` lists the places in order.
- **The region** is the element with `role="region"` that holds the table (A11Y-09). **The alert** is the alert of
  RND-05. **The failed notice** is the element of A11Y-15 that holds the failed message (it also has
  `role="alert"`; a test tells the two apart by their text). **The live count** is the polite live region of A11Y-05,
  an element with `aria-live="polite"` and no role. **The status region** is the element with `role="status"` of
  A11Y-14, which is not atomic (`aria-atomic="false"`), so a reader says what is added to it and not all it holds.
  They are two elements, and both are in the document in every state, the alert's included, where both are empty. A
  test finds the live count by its attribute, `[aria-live="polite"]:not([role])` within the component,
  one of the three elements a test finds by an attribute, because the count has no role of its own. **The progress
  indicator** of PRD-B22 is the element with the attribute `data-sdt-progress` within the component, the second,
  because it is hidden from assistive technology and so has no role or name. **A column's grip** of COL-13 is the
  element `[data-sdt-grip]` within its header cell, the third, for the same reason.
- **Shown columns.** Every given column is shown until the column statements add hiding.
- **"Emits X once"** (used by the statements that add user actions) means the callback prop `X` is called exactly once for that user action
  and no other callback is called.
- **Empty.** A text or an id is empty when nothing is left after trimming white space; `" "` is empty. A row id that
  is a number is never empty; a column id or a text that is not a string counts as empty (RND-05).
- **Same row id.** Two row ids are the same when their text forms are equal: the number 1 and the string "1" are the
  same id.
- **Queries.** A test finds elements by role, accessible name and visible text, may read the tag, the ARIA and HTML
  attributes, the ancestors and the descendants of an element so found, and may assert that the component holds no
  element of a named tag or selector, and may read a checkbox's `checked` and `indeterminate` properties; never a test
  id or a class, except THEME-09 and THEME-48, which test the public
  classes of PRD-K3 themselves, and THEME-23, THEME-24, THEME-27, THEME-28 and THEME-29, which test the classes the
  hook props write and the THEME-09 classes beside them.
- **Words.** Quoted words are the English defaults. Every fixed word is a prop (RND-06, SORT-17, PAGE-19).
- **Data.** Example data is synthetic: rows such as `{ id: 'r1', name: 'Beta' }`.
- **Ids.** A statement keeps its id while its meaning stays, also when it is narrowed. A new or split-off behaviour
  takes the next free number in its group; A11Y-33 and A11Y-34 (reserved for the slow-load group, which needed
  neither), THEME-18, THEME-35 and THEME-40 stay unused. A requirement id from `docs/PRD.md` is written `PRD-B1`.
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
  One exception: a statement whose words name every state or the whole mounted life ("in every state", "whatever
  `status` is", "exactly while ... ready", "while mounted") also covers a later group's state or control; that group
  writes no sentence for it, lists the statement at the head of its own statements, and its build adds an example row
  to that statement's test, under its marker. The statement's text is not changed.

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

**RND-05** For invalid input the table MUST render one alert holding the fixed text `invalidInput` ("This table
cannot be shown.") instead of the table.
- Examples (the test runs every row: one element with `role="alert"` holding that text, and no `table` element; the
  code and the console text of each row are the line of RND-17):

  | Invalid input | Code | Console text (development) |
  |---|---|---|
  | `caption` is empty | `captionEmpty` | "Table caption must not be empty." |
  | `caption` is not a string (left out by a plain JavaScript caller) | `captionEmpty` | "Table caption must not be empty." |
  | `regionLabel` is empty | `regionLabelEmpty` | "Table region label must not be empty." |
  | `columns` is empty | `noColumns` | "Table has no columns." |
  | `columns` is not an array (left out) | `noColumns` | "Table has no columns." |
  | a column is not an object (`null`, the text "name") | `columnIdEmpty` | "A column id is empty." |
  | a column id is empty | `columnIdEmpty` | "A column id is empty." |
  | a column id is not a string (the number 7) | `columnIdEmpty` | "A column id is empty." |
  | two columns share an id | `columnIdDuplicate` | "Two columns share an id." |
  | a column label is empty | `columnLabelEmpty` | "A column label is empty." |
  | a column label is not a string (left out) | `columnLabelEmpty` | "A column label is empty." |
  | two column labels are equal after trimming ("Name" and "Name ") | `columnLabelDuplicate` | "Two columns share a label." |
  | a column has neither `value` nor `cell` | `columnContentMissing` | "A column has no value and no cell." |
  | a column's `value` is given and is not a function (the text "name"), and it has no `cell` snippet | `columnContentMissing` | "A column has no value and no cell." |
  | a column's `cell` is given and is not a snippet (the text "name"), and it has no `value` function | `columnContentMissing` | "A column has no value and no cell." |
  | `status` is a value outside its type (the text "done", `null`) | `statusUnknown` | "Table status is not known." |
  | `rows` is not an array (left out), with `status 'ready'` | `rowsNotList` | "Table has no list of rows." |
  | a row id is empty | `rowIdEmpty` | "A row id is empty." |
  | two rows share an id | `rowIdDuplicate` | "Two rows share an id." |
  | two rows share an id in its text form (the number 1 and the string "1") | `rowIdDuplicate` | "Two rows share an id." |
  | `getRowId` throws | `rowIdUnreadable` | "A row id could not be read." |
  | `getRowId` returns a value that is neither a string nor a finite number (`NaN`, `Infinity`, `null`) | `rowIdUnreadable` | "A row id could not be read." |

  A finite number is a valid row id: rows with ids 0 and 1 (numbers, as server JSON gives them) show the table and
  no alert. `rows` that is not an array is no fault while `status` is `loading`, `failed` or `stopped` (STATE-08,
  STATE-22).

  `status` left out or given as `undefined` takes its default, `'ready'`, and is no fault.

  A column with a `value` function or a `cell` snippet is valid when its other one is given and is not a function:
  it renders by RND-08 or RND-02 (a `value` function beside `cell` the text "name" shows the value's text; a `cell`
  snippet beside `value` the text "name" shows the snippet).

  Stated limits, not detected: a plain function given as `cell` is taken as a snippet (a snippet is a function, and
  the two cannot be told apart); a `value` function that throws is not caught, unlike `getRowId`.

  With several faults at once, the console line names the first row of this table that applies (for example an empty
  caption and two rows sharing an id: `captionEmpty`); the alert is the same for every fault. Later groups state the
  faults of their own props in their own statements (SORT-15 for sort).
- Reason: a wrong table is worse than none; the user would read, and later select or export, the wrong rows. One
  text for every fault keeps developer wording off the user's screen and out of every translator's list; the
  developer gets the cause on the console (RND-17).
- Layer: component.
- Traces: PRD-B16, PRD-B3.

**RND-09** The alert and the console line of RND-17 MUST hold no value taken from the rows, the column definitions or
a thrown error.
- Examples (the test runs every row, and in each it first finds the alert and the console line RND-17 gives that
  input):

  | Invalid input | Text that must not appear in the alert or the console line |
  |---|---|
  | two rows with id `r2`, the second named "Hidden-77" | "r2", "Hidden-77" |
  | a `getRowId` that throws an error saying "token-9" | "token-9" |
  | two columns with id `col-x9` | "col-x9" |
  | a column with id `col-y7` and an empty label | "col-y7" |

- Reason: alerts and console lines are often logged, screenshotted or sent to an error tracker, and row values may be
  confidential (PRD-S4).
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
  it holds "This table cannot be shown."):

  | `status` | `busy` | Not shown |
  |---|---|---|
  | `loading` | false | "Loading data…" |
  | `failed` | false | "The data could not be loaded." |
  | `stopped` | false | "Loading stopped" |
  | `ready` | false | "No data." and any count text |
  | `ready` | true | any count text |

- Reason: a state message beside the alert would describe a table that is not there, and two alerts compete for the
  screen reader.
- Layer: component.
- Traces: PRD-B16, PRD-B15.

**RND-17** For invalid input the table MUST write one `console.error` line naming the fault, once for each change of
the fault, in the browser only.
- Examples (the test runs every row with a spy on `console.error`; "development" is a build in which `esm-env`'s
  `DEV` is true, "production" one in which it is false; the codes and texts are those of RND-05's and SORT-15's
  tables):

  | Case | `console.error` calls |
  |---|---|
  | each row of RND-05's and SORT-15's tables, in development | one: `SvelteDT: <code>: <console text>` |
  | the same rows, in production | one: `SvelteDT: <code>` |
  | valid input | none |
  | the same fault, props rerendered | still one |
  | a fault, then another fault | two, one per code |
  | a fault, then valid input, then the same fault | two |
  | two mounted tables with a fault each | one each |
  | several faults at once | one, naming the first row that applies (RND-05's table, then SORT-15's) |
  | the table rendered on the server | none |

  Each mounted table logs once for each change of its fault, so a remount logs again. The line is for the developer,
  not a word the table shows: English only, no entry of `messages`. In production the texts are absent and the code
  remains, as in Svelte's own warnings and AG Grid's errors. The line holds no value from the input (RND-09).
- Reason: the user needs no developer text and a translator no list of them, but the developer needs the cause, and
  the code is what they search for; texts that only development shows keep every production bundle free of them.
- Layer: component; the server row is a component test in a Node environment.
- Traces: PRD-B16, PRD-S4.

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
  | `failed` | "The data could not be loaded." | STATE-02 |
  | `empty` | "No data." | STATE-03 |
  | `rowCount` (a function of the count) | "2 rows displayed" for 2 rows; "1 row displayed" for 1 row | A11Y-05 |
  | `invalidInput` | "This table cannot be shown." | RND-05 |
  | any entry given as `undefined` (a translation lookup that misses) or `null`, or not of its type (the number 5 for a word; a text for `rowCount`), or an empty or blank text | that entry's English default | the statement that shows the entry |

  For example `messages={{ loading: 'Laden…' }}` shows "Laden…" while `status` is `loading`, and
  `rowCount: (n) => n + ' Zeilen'` makes the live count say "2 Zeilen". Later groups state their own words in their own
  statements (SORT-17 for sort, PAGE-19 for the pager).
- Reason: consumers translate and reword without forking the component.
- Layer: component.
- Traces: PRD-I1, PRD-I2.

**RND-07** A column that is not sortable MUST NOT show a sort button.
- Example: the columns Name and Note, neither configured as sortable: neither header cell holds a button, and the
  page holds no button named "Name" or "Note". (SORT-10 is the positive half.)
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
- Example: `status 'loading'`, `rows []`: "Loading data…" is shown and "No data." is not.
- Reason: "no data" before the answer arrives is a false statement about the data.
- Layer: component.
- Traces: PRD-B15.

**STATE-02** With `status 'failed'`, the table MUST show the failed message and MUST NOT show the empty message.
- Example: `status 'failed'`, `rows []`: "The data could not be loaded." is shown and "No data." is not.
- Reason: a failure is not an empty result, and the user must know to try again.
- Layer: component.
- Traces: PRD-B15.

**STATE-03** With `status 'ready'` and no rows, the body MUST show the empty message in one cell that spans every
shown column.
- Example: three columns, `rows []`: one body cell with `colspan="3"` holding "No data."; the same with
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
- Example: `status 'failed'` with three rows Beta, Gamma, Delta: "The data could not be loaded." is shown, and no
  body cell holds "Beta", "Gamma" or "Delta".
- Reason: `failed` means the answer did not arrive, and PRD-B15 gives the failed state no count; a consumer that wants
  to keep the last rows after a failed refetch keeps `status 'ready'` and reports the failure itself.
- Layer: component.
- Traces: PRD-B15.

**STATE-08** With `status 'loading'` or `status 'failed'`, the table MUST show that state's message, and not the
alert, when `rows` is not an array.
- Examples (the test runs every row; columns Name and Code, `rows` as given; no element holds the alert text of RND-05):

  | `status` | `rows` | Shown |
  |---|---|---|
  | `loading` | `undefined` | "Loading data…" |
  | `loading` | `null` | "Loading data…" |
  | `failed` | `undefined` | "The data could not be loaded." |

- Reason: a plain JavaScript caller whose request is still pending, or has failed, often has no rows to pass yet; the
  state already says what the user sees, and the alert would call a normal wait a fault. With `status 'ready'` the
  same input is a fault (RND-05). The type keeps `rows` a required array, as for the "left out" rows of RND-05: this
  serves callers the type does not reach, and a test passes such a value through a cast.
- Layer: component.
- Traces: PRD-B15, PRD-B16.

### Slow loads: the progress indicator, Cancel, the stopped state and "Try again" (milestone 3)

These statements add the `status` value `'stopped'`, `oncancel()`, `onretry()` and four `messages` keys (PRD-B22,
PRD-B23, PRD-B24). Times in their examples are counted from mount and are moved by fake timers: mounted loading or
busy, the indicator appears at 1000 ms and the still-loading text at 6000 ms. "Still loading"
is the still-loading text; "Cancel" and "Try again" are buttons found by those names.

Covered by earlier statements, rows added by this group's build (their words reach every state or the whole mounted
life): STATE-04 (`status 'stopped'`: "false"); A11Y-05 (`status 'stopped'`: the live count is empty); A11Y-22 (a step
from `failed` to `stopped`); RND-13 (`status 'stopped'`: "Loading stopped" is not shown; `status 'loading'` with
`oncancel` passed, at 6000 ms: no progress indicator, no "Still loading", no "Cancel"); RND-14 and EXP-02 (`status
'stopped'`, with and without `onretry`); EXP-01 and EXP-03 (the same states); FOOT-01 and FOOT-03 (a rerender run
through the indicator, the still-loading text with "Cancel", `stopped` with "Try again" and `failed` with "Try
again"); FOOT-02 (the same run, with a press on each button).

**STATE-09** While the input is valid, the progress indicator MUST appear once `status` has been `loading`, or `busy`
has been true, for 1 second without a gap, and not before.
- Examples (the test runs every row; "present" means the progress indicator is in the component):

  | Steps | Present at |
  |---|---|
  | mounted with `status 'loading'` | not at 999 ms; at 1000 ms |
  | mounted with `status 'ready'`, two rows, `busy true` | not at 999 ms; at 1000 ms |
  | `status 'loading'`; at 600 ms `status 'ready'` with two rows and `busy true` | at 1000 ms (a change from loading to busy is no gap) |
  | `status 'loading'`; at 600 ms `status 'ready'`, `busy false`; at 700 ms `status 'loading'` | not at 1000 ms nor at 1699 ms; at 1700 ms |

- Reason: a fast answer must not flash an indicator; a slow one must be visibly in progress (PRD-B22).
- Layer: component.
- Traces: PRD-B22.

**STATE-10** Once shown, the progress indicator MUST stay at least 500 ms, and MUST go once that time has passed and
neither `status 'loading'` nor `busy` true holds.
- Examples (the test runs every row; mounted with `status 'loading'`, so the indicator appears at 1000 ms):

  | Answer | Present at | Gone at |
  |---|---|---|
  | at 1100 ms `status 'ready'` with two rows, `busy false` | 1499 ms | 1500 ms |
  | at 1100 ms `status 'failed'` | 1499 ms | 1500 ms |
  | at 2000 ms `status 'ready'` with two rows, `busy false` | 1999 ms | 2000 ms |
  | at 2000 ms `status 'stopped'` | 1999 ms | 2000 ms |
  | at 1100 ms `status 'ready'` with two rows, `busy false`; at 1200 ms `status 'loading'`; at 2500 ms `status 'ready'` with two rows, `busy false` | 2499 ms | 2500 ms |

- Reason: an indicator that blinks for a frame reads as a glitch; once the answer is there and the minimum has passed,
  nothing is in progress any more (PRD-B22).
- Layer: component.
- Traces: PRD-B22.

**STATE-11** The progress indicator MUST be hidden from assistive technology and MUST hold no focusable element.
- Example: at 6000 ms with `status 'loading'` and `oncancel` passed: the indicator has `aria-hidden="true"`, and no
  element in it is focusable or a button, link or form control; the button "Cancel" is not in it.
- Reason: the indicator is decoration; what it means reaches a screen-reader user through the polite status, and a
  control inside a hidden element would be reachable but unnamed (PRD-B22, PRD-B23).
- Layer: component.
- Traces: PRD-B22, PRD-B23.

**STATE-12** While the input is valid, the still-loading text MUST be shown exactly while `status 'loading'` or `busy`
true holds and the progress indicator has been present for 5 seconds or more.
- Examples (the test runs every row; "Still loading" is looked for in the component's text):

  | Steps | "Still loading" |
  |---|---|
  | `status 'loading'`, at 5999 ms | not shown |
  | `status 'loading'`, at 6000 ms | shown |
  | `status 'ready'` with two rows, `busy true`, at 6000 ms | shown |
  | `status 'loading'`; at 7000 ms `status 'ready'` with two rows, `busy false` | not shown at 7000 ms |
  | `status 'loading'`; at 6100 ms `status 'failed'` | not shown at 6100 ms; the indicator also goes at 6100 ms (STATE-10) |
  | `status 'loading'`; at 1100 ms `status 'ready'`, `busy false`; at 1200 ms `status 'loading'` | shown at 6000 ms: the indicator never went, so its 5 seconds run from 1000 ms |

- Reason: a load that takes long must say so in words, not only by an indicator that has stopped moving (PRD-B22).
- Layer: component.
- Traces: PRD-B22.

**STATE-13** The progress indicator MUST move for the first 5 seconds after it appears and MUST NOT move after.
- Example: `matchMedia('(prefers-reduced-motion: reduce)').matches` is false; `status 'loading'`. The test moves time
  by fake timers and sets each animation's `currentTime` to the time since it appeared. At 1000 ms and at 5999 ms the
  indicator, or an element in it, has a running animation (`getAnimations({ subtree: true })` holds one whose
  `playState` is "running"); at 6000 ms none is running.
- Reason: a moving part beside content a user is reading must stop within 5 seconds (WCAG 2.2.2), and the strict
  policy lets it move through a class only (PRD-B22, PRD-S1).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B22.

**STATE-14** Under `prefers-reduced-motion: reduce`, the progress indicator MUST NOT move at any time.
- Example: `matchMedia('(prefers-reduced-motion: reduce)').matches` is true; `status 'loading'`: at 1000 ms and at
  6000 ms neither the indicator nor any element in it has a running animation.
- Reason: a user who asked the system for less motion gets a still indicator from the start (PRD-B22).
- Layer: real browser (Chromium, Firefox, WebKit), in the browser instance the test runner configures with reduced
  motion.
- Traces: PRD-B22.

**STATE-15** The position and size of the region, and of an element placed after the component, MUST be the same with
and without the progress indicator, the still-loading text and "Cancel".
- Examples (the test runs every row; `oncancel` passed; the `getBoundingClientRect()` x, y, width and height of the
  region and of a paragraph placed after the component are each equal at 500 ms, 1000 ms and 6000 ms):

  | State |
  |---|
  | `status 'loading'` |
  | `status 'ready'` with 25 rows, `busy true` |

- Reason: content that moves when the indicator appears puts something else under the pointer the user is about to
  press (PRD-B22).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B22, PRD-B23.

**STATE-16** The progress indicator, the still-loading text and "Cancel", each with its descendants, MUST overlap
neither the region nor a control of the `heading` or `actions` snippet, and MUST lie within the viewport's width.
- Example: 30 columns at least 120 px wide in a 600 px wide viewport, `status 'ready'` with 25 rows, `busy true`,
  `oncancel` passed, a `heading` snippet holding a link "All orders", an `actions` snippet holding "Export", the region
  scrolled to its right end; at 6000 ms the boxes of the indicator, of the still-loading text and of "Cancel", each with
  the boxes of all its descendants, intersect neither the region's box nor the boxes of "All orders" and "Export", and
  each lies within the viewport's width.
- Reason: outside the region they are never scrolled sideways out of view with a wide table, and they cover no control
  (PRD-B22).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B22, PRD-B23.

**STATE-17** While the input is valid, "Cancel" MUST be shown exactly while the still-loading text is shown and
`oncancel` is passed.
- Examples (the test runs every row):

  | Steps | `oncancel` | "Cancel" |
  |---|---|---|
  | `status 'loading'`, at 5999 ms | passed | not shown |
  | `status 'loading'`, at 6000 ms | passed | shown |
  | `status 'loading'`, at 6000 ms | not passed | not shown |
  | `status 'ready'` with two rows, `busy true`, at 6000 ms | passed | shown |
  | `status 'loading'`; at 7000 ms `status 'ready'` with two rows, `busy false` | passed | not shown at 7000 ms |

- Reason: a control that does nothing misleads (PRD-B3), so Cancel shows only when someone acts on it (PRD-B23).
- Layer: component.
- Traces: PRD-B23, PRD-B3.

**STATE-18** One press on "Cancel" or on "Try again" MUST emit that button's callback once.
- Examples (the test runs every row; "emits once" as the Conventions define it):

  | Button, state | Input | Emits once |
  |---|---|---|
  | "Cancel", `status 'loading'` at 6000 ms | click; Enter on the focused button; Space on the focused button | `oncancel` |
  | "Try again", `status 'stopped'` | click; Enter on the focused button; Space on the focused button | `onretry` |
  | "Try again", `status 'failed'` | click | `onretry` |

- Reason: two emits are two requests whose answers can race (PRD-B2).
- Layer: component; the Enter and Space rows in a real browser (Chromium, Firefox, WebKit), since an engine makes that key's click itself.
- Traces: PRD-B23, PRD-B24, PRD-B2.

**STATE-19** A press on "Cancel" or on "Try again" MUST NOT change what the table shows until the consumer passes new
props.
- Examples (the test runs every row; the callback records its call and passes nothing back):

  | Button, state | After the press |
  |---|---|
  | "Cancel", `status 'loading'` at 6000 ms | "Loading data…", "Still loading" and "Cancel" are still shown |
  | "Try again", `status 'stopped'` | "Loading stopped" and "Try again" are still shown; "Loading data…" is not |
  | "Try again", `status 'failed'` | "The data could not be loaded." and "Try again" are still shown |

  Break that turns it red: the table switches itself to its loading look on a press.
- Reason: the component stops and starts nothing itself; the application may refuse (PRD-B2, PRD-B23).
- Layer: component.
- Traces: PRD-B2, PRD-B23, PRD-B24.

**STATE-20** With `status 'stopped'`, the table MUST show the stopped message in one body cell that spans every shown
column, and none of the rows it is given.
- Examples (the test runs every row; three columns; the stopped message is read within the `table` element):

  | `rows` | Shown |
  |---|---|
  | `[]` | one body cell with `colspan="3"` holding "Loading stopped"; the `table` element and its header row are present |
  | Beta, Gamma, Delta | the same, and no body cell holds "Beta", "Gamma" or "Delta" |

- Reason: `stopped` means the user ended the load before any answer, so no row on screen is an answer; the header
  stays so the user still sees what the table is (PRD-B24: "where the rows would be").
- Layer: component.
- Traces: PRD-B24, PRD-B15.

**STATE-21** With `status 'stopped'`, the table MUST NOT show the empty message.
- Examples (the test runs every row): `status 'stopped'` with `rows []`, and with the rows Beta and Gamma: "No data."
  is nowhere in the component.
- Reason: a stopped load is not an empty result; "no data" would be a false statement about the data.
- Layer: component.
- Traces: PRD-B15, PRD-B24.

**STATE-22** With `status 'stopped'`, the table MUST show the stopped message, and not the alert, when `rows` is not an
array (as STATE-08, for the stopped state).
- Examples (the test runs every row; columns Name and Code; no element has `role="alert"`): `rows` `undefined`;
  `rows` `null`: "Loading stopped" is shown.
- Reason: a load cancelled before any answer often leaves the caller with no rows to pass; the state already says what
  the user sees.
- Layer: component.
- Traces: PRD-B24, PRD-B16.

**STATE-23** While the input is valid, "Try again" MUST be shown exactly while `onretry` is passed and `status` is
`stopped` or `failed`, whatever `busy` is.
- Examples (the test runs every row; valid input):

  | `status` | `busy` | `onretry` | "Try again" |
  |---|---|---|---|
  | `stopped` | false | passed | shown |
  | `failed` | false | passed | shown |
  | `stopped` | true | passed | shown |
  | `failed` | true | passed | shown |
  | `stopped` | false | not passed | not shown |
  | `failed` | false | not passed | not shown |
  | `loading` | false | passed | not shown |
  | `ready` | false | passed | not shown |
  | `ready` | true | passed | not shown |

- Reason: a control that does nothing misleads (PRD-B3), so the button shows only when someone acts on it (PRD-B24).
- Layer: component.
- Traces: PRD-B24, PRD-B3.

**STATE-24** While the input is invalid, "Try again" MUST NOT be shown.
- Examples (the test runs every row, each with `columns []` and `onretry` passed; the alert holds "This table
  cannot be shown."): `status 'stopped'`; `status 'failed'`: no button "Try again" exists.
- Reason: a retry beside the alert would offer to reload a table that cannot be shown (PRD-B24, PRD-B16).
- Layer: component.
- Traces: PRD-B24, PRD-B16.

**STATE-25** "Try again" MUST sit outside the region and after it in document order.
- Examples (the test runs every row; `onretry` passed): `status 'stopped'`; `status 'failed'`: "Try again" is not a
  descendant of the region and follows it in document order.
- Reason: outside the region the button is never scrolled sideways out of view with a wide table, and it has one
  place in both states, after the table and its message (PRD-B24, PRD-A3).
- Layer: component.
- Traces: PRD-B24, PRD-A3.

**STATE-26** The still-loading text, the stopped message and the names of "Cancel" and "Try again" MUST come from
`messages`, with English defaults (as RND-06, for this group).
- Examples (the test runs every row; it passes a full `messages` object of non-English words, then checks that each
  replacement appears where the row says and that none of these English defaults is left on the page, in an
  accessible name or in a description):

  | Message | English default | Shown by |
  |---|---|---|
  | `stillLoading` | "Still loading" | STATE-12 |
  | `cancel` | "Cancel" | STATE-17 |
  | `stopped` | "Loading stopped" | STATE-20 |
  | `retry` | "Try again" | STATE-23 |

  For example `messages={{ retry: 'Erneut versuchen' }}` names the button "Erneut versuchen".
- Reason: consumers translate and reword without forking the component (PRD-I1).
- Layer: component.
- Traces: PRD-I1, PRD-B22, PRD-B23, PRD-B24.

**STATE-27** The still-loading text, the stopped message and the names of "Cancel" and "Try again" MUST render as text,
never as markup (as RND-03, for this group).
- Examples (the test runs every row, once with the value `<img src=x onerror=alert(1)>` and once with `<none>`): the
  `stillLoading` and `cancel` messages at 6000 ms with `status 'loading'` and `oncancel` passed; the `stopped` and
  `retry` messages with `status 'stopped'` and `onretry` passed. In every row the literal text appears on the page or
  in an accessible name, and the component holds no `img` and no `none` element.
- Reason: the words may come from a translation file the consumer does not review; any markup path is a cross-site
  scripting path (PRD-S2).
- Layer: component.
- Traces: PRD-S2.

**STATE-28** While the input is valid, the stopped message MUST be in the component exactly while `status` is
`stopped`.
- Examples (the test runs every row; columns Name and Code; mounted with the first step, then rerendered step by step;
  after each step it reads the component's text content, which includes hidden text):

  | Steps | "Loading stopped" after each step |
  |---|---|
  | `stopped`, `loading`, `stopped` | in the table; nowhere in the component; in the table |
  | `stopped`, `ready` with two rows, `failed`, `stopped` | in the table; nowhere; nowhere; in the table |

  Break that turns it red: the message rendered whatever `status` is.
- Reason: a message about a stopped load shown during a load, after a failure or beside rows would state something
  false about the data (PRD-B15, PRD-B24).
- Layer: component.
- Traces: PRD-B24, PRD-B15.

## 3. Keyboard and screen reader: the APG table pattern (A11Y)

**A11Y-01** The table MUST be a native `table` element named by a `caption` element holding the `caption` prop.
- Example: `caption="Orders"` gives `getByRole('table', { name: 'Orders' })`, and that table's first child is a
  `caption` holding "Orders". While the table shows a sort button, the name is the caption text, a space and the
  sentence of SORT-28: "Orders Column headers with buttons are sortable."
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
- Example: rerender from `status 'loading'` to `status 'failed'`: `getByRole('alert')` holds "The data could not be
  loaded.".
- Reason: a failure must be announced at once, not only when the user reaches the table.
- Layer: component.
- Traces: PRD-A4, PRD-B15.

**A11Y-22** While the input is valid, the failed message MUST be in the component exactly while `status` is `failed`.
- Examples (the test runs every row; columns Name and Code; mounted with `status 'failed'`, then rerendered step by
  step; after each step it reads the component's text content, which includes hidden text, and the failed notice of
  A11Y-15, found as the element with `role="alert"` that holds the failed message):

  | Steps | "The data could not be loaded." after each step |
  |---|---|
  | `failed`, `loading`, `failed` | in the failed notice; nowhere in the component; in the failed notice |
  | `failed`, `ready` with two rows, `loading`, `failed` | in the failed notice; nowhere; nowhere; in the failed notice |

  Breaks that turn it red: the message rendered whatever `status` is; the message kept and only hidden (CSS or the
  `hidden` attribute) while `status` is not `failed`.
- Reason: each new failure is announced, a failure after a retry included (PRD-A4), and assistive technology "will
  generally only announce dynamic changes in the content of a live region" (MDN, ARIA live regions, FETCHED
  2026-11-18), so the text leaves when the failure is over and returns with the next one. With invalid input the
  alert of RND-05 is the only state shown (RND-13).
- Layer: component.
- Traces: PRD-A4.

**A11Y-21** The stopped message MUST NOT be inside an element with `role="alert"`.
- Examples (the test runs every row): mounted with `status 'stopped'`; a rerender from `status 'loading'` to
  `status 'stopped'`; a rerender from `status 'failed'` to `status 'stopped'`: after each, no element with
  `role="alert"` holds "Loading stopped".
- Reason: the user chose to stop; an alert would interrupt as if something went wrong (PRD-B15, PRD-B24: "not as an
  alert").
- Layer: component.
- Traces: PRD-B24, PRD-B15.

**A11Y-23** With `status 'failed'`, "Try again" MUST sit outside the failed notice and after it in document order.
- Example: `status 'failed'` with `onretry`: "Try again" is not a descendant of the failed notice and follows it in
  document order.
- Reason: the alert holds only the failed text, so the button is not read as part of the alert; reading order puts
  the cause before the way out (PRD-B24).
- Layer: component.
- Traces: PRD-B24, PRD-A3.

**A11Y-24** The Tab order MUST reach "Try again" after the `actions` snippet's controls (as A11Y-10, for this group).
- Examples (the test runs every row; a table that fits its viewport, an `actions` snippet holding "Export", a
  `heading` snippet holding a link "All orders", `onretry` passed; Tab from the start):

  | `status` | Tab reaches |
  |---|---|
  | `stopped` | "All orders", "Export", "Try again" |
  | `failed` | "All orders", "Export", "Try again" |

  Where the region is a Tab stop (A11Y-12), it comes before "Try again", since the button follows the region in
  document order (STATE-25).
- Reason: keyboard users meet the controls in the order they see them (WCAG 2.4.3).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A3.

**A11Y-25** axe MUST find no serious or critical violation in the slow-load states (as A11Y-06, for this group).
- Examples (the test runs every row, at scroll 0; axe *incomplete* items as in A11Y-06):

  | State |
  |---|
  | `status 'loading'`, `oncancel` passed, at 6000 ms (the indicator, "Still loading" and "Cancel") |
  | `status 'ready'`, 25 rows, `busy true`, `oncancel` passed, at 6000 ms |
  | `status 'stopped'`, `onretry` passed |
  | `status 'failed'`, `onretry` passed |

- Reason: an automated check catches regressions in names, roles and contrast that the statements above do not name.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A1, PRD-B22, PRD-B23, PRD-B24.

### Slow loads: announcements and focus (milestone 3)

Times as in the slow-load statements of section 2 (counted from mount, moved by fake timers). "Added" counts the
mutation records, from a `MutationObserver` on the status region with `childList`, `characterData`,
`characterDataOldValue` and `subtree`, that put the words in: an added node whose text holds them, or a text change
from a value without them to one with them. A text rewritten to the same words counts 0; a node removed and added
again with the same words counts 1, since a screen reader announces the added node again. The stopped message is
then in two places, the body cell of STATE-20 and the status region: a statement that says it is shown reads it
within the `table` element.

**A11Y-20** The still-loading text MUST be in the status region exactly while it is shown, and be added to it once each
time it appears.
- Examples (the test runs every row; the status region is read after the last step):

  | Steps | "Still loading" in the status region | Added |
  |---|---|---|
  | `status 'loading'`; at 6000 ms `busy true` too; at 8000 ms | yes | 1 |
  | `status 'ready'` with two rows, `busy true`; at 6000 ms the same rows as new objects | yes | 1 |
  | `status 'loading'`; at 7000 ms `status 'ready'` with two rows, `busy false` | no | 1 |
  | `status 'loading'`; at 7000 ms `status 'ready'`, `busy false`; at 7100 ms `status 'loading'`; at 13100 ms | yes | 2 |

- Reason: a screen-reader user must hear once what a sighted user reads, not on every rerender while the load goes on
  (PRD-A4, PRD-B22).
- Layer: component.
- Traces: PRD-A4, PRD-B22.

**A11Y-26** The stopped message MUST be in the status region exactly while `status` is `stopped`, and be added to it
once each time `status` becomes `stopped`.
- Examples (the test runs every row; the status region is read after the last step):

  | Steps | "Loading stopped" in the status region | Added |
  |---|---|---|
  | `status 'loading'`; `status 'stopped'` | yes | 1 |
  | `status 'loading'`; `status 'stopped'`; `status 'stopped'` with `onretry` passed and new `rows` | yes | 1 |
  | `status 'loading'`; `status 'stopped'`; `status 'loading'` | no | 1 |
  | `status 'loading'`; `status 'stopped'`; `status 'loading'`; `status 'stopped'` | yes | 2 |

- Reason: the user chose to stop, so the news is polite, said once, and not an alert (PRD-B24, PRD-A4).
- Layer: component.
- Traces: PRD-A4, PRD-B24.

**A11Y-27** "Cancel" MUST NOT take focus when it appears.
- Examples (the test runs every row; `status 'loading'`, `oncancel` passed, an `actions` snippet holding "Export"; at
  6000 ms "Cancel" appears): "Export" focused at 5000 ms: it is still the focused element at 6000 ms; nothing focused: `document.body`
  is still the focused element at 6000 ms.
- Reason: a control that grabs focus as it appears interrupts the user, who may be reading or working elsewhere
  (WCAG 3.2.1, PRD-B23).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B23, PRD-A3.

**A11Y-28** While the input stays valid, when "Cancel" goes while it has focus, focus MUST move to the `table` element
without scrolling.
- Examples (the test runs every row; `status 'loading'`, `oncancel` passed; at 6000 ms the test focuses "Cancel" with
  `focus({ preventScroll: true })`, scrolls the window so the table's top lies above the viewport, reads the window's
  and the region's scroll positions, then passes the props of the row; after it the `table` element is the focused
  element and both scroll positions are the ones read):

  | Consumer passes |
  |---|
  | `status 'ready'` with 25 rows |
  | `status 'stopped'` |
  | `status 'failed'` |

- Reason: focus that falls to the page body sends a keyboard user back to the top of the page (WCAG 2.4.3); a scroll
  would move the content the user was reading (PRD-B23). With invalid input there is no `table` element (RND-13);
  where focus goes then is not stated here.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B23, PRD-A3.

**A11Y-29** "Try again" MUST NOT take focus when it appears or returns.
- Examples (the test runs every row; `onretry` passed, an `actions` snippet holding "Export", focused before the first
  step; after each step "Export" is the focused element): `status 'loading'`, then `status 'stopped'`; `status
  'stopped'`, then `status 'loading'`, then `status 'failed'`.
- Reason: as A11Y-27: the button is offered, never forced on the user (WCAG 3.2.1, PRD-B24).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B24, PRD-A3.

**A11Y-30** While the input stays valid, when "Try again" goes while it has focus, focus MUST move to the `table`
element without scrolling.
- Examples (the test runs every row; `onretry` passed; the test focuses "Try again" with `focus({ preventScroll:
  true })`, scrolls the window so the table's top lies above the viewport, presses Enter, reads the window's and the
  region's scroll positions, then passes the props of the row; after it the `table` element is the focused element and
  both scroll positions are the ones read):

  | State before | Consumer passes |
  |---|---|
  | `status 'stopped'` | `status 'loading'` |
  | `status 'failed'` | `status 'loading'` |
  | `status 'stopped'` | `status 'ready'` with 25 rows |

- Reason: PRD-B24 names the retry that turns `status` to `loading`; any other way the button goes would drop focus to
  the page body the same way (WCAG 2.4.3). With invalid input there is no `table` element (RND-13); where focus goes
  then is not stated here.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B24, PRD-A3.

**A11Y-31** The Tab order MUST reach "Cancel" after the `actions` snippet's controls and before the region and the
controls in the cells (as A11Y-10, for this group).
- Example: a table that fits its viewport, `status 'ready'` with rows Beta and Gamma, `busy true`, `oncancel` passed,
  a `heading` snippet holding a link "All orders", an `actions` snippet holding "Export", a `cell` snippet holding a
  link "Open <name>"; at 6000 ms, Tab from the start reaches "All orders", "Export", "Cancel", "Open Beta",
  "Open Gamma".
- Reason: a keyboard user reaches the way out of a long load before the rows, not after every control in them
  (WCAG 2.4.3).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A3, PRD-B23.

**A11Y-32** The still-loading text and the stopped message MUST each be visible in exactly one place.
- Examples (the test runs every row; "visible" means an element whose own text holds the words and whose box is wider
  and higher than 1 px, not clipped to less): `status 'loading'` at 6000 ms: "Still loading" once; `status 'ready'`
  with two rows, `busy true`, at 6000 ms: "Still loading" once; `status 'stopped'`: "Loading stopped" once, in the
  `table` element.
- Reason: the status region of A11Y-20 and A11Y-26 may hold a second copy for assistive technology; a sighted user
  must not read the same words twice (PRD-B22, PRD-B24).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B22, PRD-B24.

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
  | press "Name" |
  | Shift+press "Code" |
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
  | "Name" (SORT-01) |
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
  | "Name" | "Name" |
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

**FOOT-05** After unmount, the table MUST leave no timer pending.
- Examples (the test runs every row; fake timers; mounted with `status 'loading'`, `oncancel` passed; after the
  unmount the count of pending fake timers is 0): unmounted at 500 ms (before the indicator); at 1200 ms, 100 ms after
  `status 'ready'` (inside the indicator's 500 ms); at 5999 ms (the still-loading text and "Cancel" not yet shown).
- Reason: a timer that outlives the component runs code for a table that is gone (PRD-B19); the slow-load group is the
  first to time anything (PRD-B22).
- Layer: component.
- Traces: PRD-B19, PRD-B22.

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

**THEME-48** The component MUST put `sdt-region` on the region of A11Y-09, `sdt-caption` on the `caption`,
`sdt-sr-only` on the live count of A11Y-05 and `sdt-empty` on the cell of the empty message (STATE-03).
- Example: `status 'ready'`, 2 rows, 2 columns: the one element with `sdt-region` is the element with
  `role="region"`, the one with `sdt-caption` is the `caption`, the one with `sdt-sr-only` is the element with
  `aria-live="polite"` and no role. The same props with 0 rows: the one element with `sdt-empty` is the `td` of the
  empty message, and with 2 rows no element has `sdt-empty`. No other element carries one of the four classes.
- Reason: a selector of the stylesheet has one class at most (THEME-12), so the region, the caption, the live count and
  the empty cell need a class of their own; like the seven of THEME-09 they are public interface (PRD-K3).
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
  | `/* @spec("THEME-10") */ .sdt-x { color: inherit } .sdt-y { color: inherit }` | finding: `.sdt-y` has no marker |
  | `/* @spec("THEME-10") */ /* note */ .sdt-x { color: inherit }` | finding: no marker directly before the rule |
  | `@font-face { font-family: sdt-x; src: local(sdt-x) }` | finding: no marker |
  | `@charset "utf-8";` and nothing else | could not check: content and 0 rules |

  A rule is a style rule (also inside `@media`, `@supports` or `@container`), a `@keyframes` block (its keyframe
  selectors are not rules), a `@font-face` or a `@property` rule. The check reads the stylesheet of THEME-04 and
  reports how many rules it read; while that stylesheet does not exist it reports "not applicable: no stylesheet".
  It lands in the walking-skeleton milestone, once the stylesheet and the gate's trace check exist, and is not yet
  tested until then.
- Reason: the gate's other checks cannot see the stylesheet (PRD-G4); a rule that names the statement whose test
  proves it is what THEME-14 deletes and checks, and only a real-browser test can turn red when a rule goes.
- Layer: static check.
- Traces: PRD-G4.

**THEME-14** At each step boundary, deleting a rule of the package's stylesheet that the step changed MUST turn the
tests of the statement its marker names red by a failed assertion.
- Examples (the wrapper runs every row on a canary step that changes one rule marked `@spec("THEME-10")`; the
  wrapper's own tests plant the outcome of THEME-10's tests in each engine):

  | Tests of THEME-10 with the rule deleted | Run | Result |
  |---|---|---|
  | red by a failed assertion in Chromium, Firefox and WebKit | CI | passes |
  | red by a failed assertion in Firefox, green in Chromium and WebKit | CI | passes |
  | green in all three engines | CI | finding: the rule is not proven by THEME-10's tests |
  | red in Chromium and Firefox, not run in WebKit | CI | could not check |
  | red in Chromium, a time-out in WebKit | CI | could not check |
  | a crash, a time-out or no test run | local | could not check |
  | green in Chromium | local (Chromium only) | not applicable: "CI decides: not red in Chromium", naming the rule and THEME-10 |
  | red by a failed assertion in Chromium | local | passes |

  In CI any engine that crashed, timed out or ran no test makes the result "could not check", whatever the others
  show. A rule is changed when its at-rule context, its prelude (the selector, or the at-rule's name and
  parameters), its body and its marker, white space normalised, have no equal at the base. A stylesheet with content
  in which 0 rules are read, at the base or at the head, is "could not check". Otherwise a step with no changed rule
  is "not applicable", naming why:

  | Stylesheet diff of the canary step | Result |
  |---|---|
  | only white space and a comment that is not a marker change | not applicable: "format only" |
  | one marked rule deleted, nothing else | not applicable: "rules deleted or moved only", naming the rule |
  | the head stylesheet holds `@charset "utf-8";` and nothing else, the base one marked rule | could not check |

  It lands in the walking-skeleton milestone, once the gate's step-boundary harness and the three engines of the
  real-browser tests exist, and is not yet tested until then. Limits: a rule its tests do not prove shows red only in
  CI; a step that only moves rules is not probed.
- Reason: a rule no test needs is dead or unproven (PRD-G4); no established practice for deleting CSS rules was found
  (searched 2026-11-18), so this is the stylesheet's analogue of mutation at step boundaries.
- Layer: gate wrapper at step boundaries.
- Traces: PRD-G4.

**THEME-15** With no `--sdt-*` property defined, axe MUST find no serious or critical violation in the slow-load states
(as THEME-03, for this group).
- Example: a site page with the package's stylesheet and no token definitions, in each state of A11Y-25: axe reports
  0 serious or critical violations (its colour-contrast rule included).
- Reason: the system-colour fallbacks must hold for the indicator, its text and the two buttons as for the rest.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T2, PRD-A1.

## 7. Server-driven sort (SORT)

**SORT-10** A sortable column MUST show exactly one sort button, in its header cell.
- Example: of the columns Name (`sortable: ['asc', 'desc']`) and Note (not sortable), the Name header cell holds one
  button "Name" and the Note header cell holds none. (RND-07 is the negative half.)
- Reason: the header is where a user looks to change the order of a column.
- Layer: component.
- Traces: PRD-B3, PRD-B4.

**SORT-01** A press on a sort button without Shift MUST emit `onsort` once with the next whole order from this table.
- Examples (the test runs every row):

  | Order before | Press | `onsort` receives |
  |---|---|---|
  | `[]` | Name | `[name asc]` |
  | `null` (counts as `[]`, SORT-15) | Name | `[name asc]` |
  | `[name asc]` | Name | `[name desc]` |
  | `[name desc]` | Name | `[]` |
  | `[code asc]` | Name | `[name asc]` |
  | `[code asc, name desc]` | Name | `[name asc]` |
  | `[name asc, code desc]` | Name | `[name desc]` |
  | `[]` | Date (lists `['desc', 'asc']`) | `[date desc]` |
  | `[date desc]` | Date (lists `['desc', 'asc']`) | `[date asc]` |
  | `[date asc]` | Date (lists `['desc', 'asc']`) | `[]` |

  The rule: if the column leads the order, it moves on to the next direction in the order its `sortable` lists them
  and the other columns are dropped; after its last listed direction it leaves the order. Otherwise it becomes the only
  sorted column, in the first direction its `sortable` lists. SORT-04 holds the single-direction rows.
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
  | `[code asc]` | Date (lists `['desc', 'asc']`) | `[code asc, date desc]` |

  A column not yet in the order joins at the end, in the first direction its `sortable` lists; it moves on in that
  order, and after its last listed direction it leaves the order.
  Also: after a Shift+Enter whose click was taken, a scripted click (`click()`, no key) emits as without Shift.
  Also: Shift held at the Enter or Space keydown decides, also when Shift is released before the key comes up.
- Reason: a user adds or removes a tie-breaker without losing the primary order.
- Layer: component; the Enter and Space rows in a real browser (Chromium, Firefox, WebKit), since an engine makes that key's click itself.
- Traces: PRD-B4.

**SORT-03** One press on a sort button without Shift MUST emit exactly one `onsort`.
- Examples (the test runs every row, on Name with order `[]`; the Shift inputs are counted in SORT-02):

  | Input | `onsort` calls |
  |---|---|
  | click | 1 |
  | Enter on the focused button | 1 |
  | Space on the focused button | 1 |

- Reason: two emits are two server requests whose answers can arrive in either order.
- Layer: component; the Enter and Space rows in a real browser (Chromium, Firefox, WebKit), since an engine makes that key's click itself.
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

  Break that turns it red: a press steps through both directions whatever the column lists.
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
- Examples (the test runs every row; focus "Name" with order `[]`, press Enter, then the consumer passes the
  props of each step in turn; after every step the focused element is "Name"):

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

**SORT-09** A sort button's accessible name MUST be its visible label alone, in every sort state, and the button MUST
carry no `aria-label` attribute.
- Examples (the test runs every row; the Name button):

  | Order | Accessible name | `aria-label` attribute |
  |---|---|---|
  | `[]` | "Name" | none |
  | `[name asc]` | "Name" | none |
  | `[code asc, name desc]` | "Name" (not "Name 2") | none |

  The header cell keeps its `aria-sort` (A11Y-03).
- Reason: a header cell's accessible name is computed from its content, so a button named "Sort by Name" made "Sort
  by Name" the column name that screen readers repeat for every body cell; the visible label as the name also meets
  WCAG 2.5.3, and the description (SORT-06) and `aria-sort` carry the state. SORT-28 tells that the headers are
  buttons.
- Layer: component.
- Traces: PRD-B5, PRD-A1.

**SORT-28** While the table shows at least one sort button, its caption MUST hold one visually hidden sentence, the
message `sortableHint`, in its own element after the caption text; with no sort button shown it MUST NOT.
- Examples (the test runs every row; the caption text is "Orders", `sortableHint` has its English default "Column
  headers with buttons are sortable."):

  | Columns | The caption's text content | The table's accessible name |
  |---|---|---|
  | Name sortable, Note not | "Orders Column headers with buttons are sortable." | the same |
  | Name and Note, neither sortable | "Orders" | "Orders" |

  The sentence sits in a `span` with no class, after a space; the caption is itself visually hidden (A11Y-13).
  `messages={{ sortableHint: 'Spaltenköpfe mit Schaltflächen sind sortierbar.' }}` shows that text instead.
- Reason: the WAI-ARIA Authoring Practices sortable table says to tell users, in the table's description or caption,
  that the headers are buttons; without it a screen-reader user has no word that a header can be pressed.
- Layer: component.
- Traces: PRD-B5, PRD-A2.

**SORT-13** A sorted header MUST show a direction mark, hidden from assistive technology, whose text or SVG drawing
differs between ascending and descending.
- Examples (the test runs every row on one mount whose `sort` prop changes; the hidden content is the text, and
  every attribute except `class` and `style` of the SVG elements, inside the header cell's `aria-hidden="true"` elements, without the rank of SORT-05):

  | Order | Header | Hidden content compared |
  |---|---|---|
  | `[name asc]` and `[name desc]` | Name | present in both, and different |
  | `[code asc, name desc]` and `[code asc, name asc]` | Name | different (the rank "2" left out) |

  A difference only in a class or a style (a rotation, say) does not count: it does not show in a simulated DOM.
  The mark is the text ▲ for ascending and ▼ for descending, the widespread convention: the test reads both.

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
  | `[name asc]` | "Name" | "sorted ascending. H" |
  | `[name desc, code asc]` | "Name" | "sorted descending, priority 1. H" |
  | `[code asc, date asc, name desc]` | "Name" | "sorted descending, priority 3. H" |
  | `[code asc]` | "Name" | "H" |

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

**SORT-15** For invalid sort input the table MUST render the alert of RND-05 and write the console line of RND-17 for
the code the examples below list.
- Examples (as RND-05, for the sort props; the test runs every row: one element with `role="alert"` holding
  `invalidInput`'s text, no `table` element, and the console line of the row):

  | Invalid input | Code | Console text (development) |
  |---|---|---|
  | a column's `sortable` lists no direction, or a direction other than `asc` and `desc` | `sortableInvalid` | "A column's sort directions are invalid." |
  | a column's `sortable` names a direction twice (`['asc', 'asc']`) | `sortableInvalid` | "A column's sort directions are invalid." |
  | a column is sortable and `onsort` is not given | `sortHandlerMissing` | "A sortable column has no sort handler." |
  | `sort` is given, is neither `undefined` nor `null`, and is not an array (the text "name", `{ id: 'name', direction: 'asc' }`) | `sortInvalid` | "The sort is not valid." |
  | an entry of `sort` is `null`, an array or not an object (`[null]`, `[['name']]`, `["name"]`) | `sortInvalid` | "The sort is not valid." |
  | an entry's `id` is left out or is not a string (`[{ direction: 'asc' }]`, `[{ id: 5, direction: 'asc' }]`, `[{ id: null, direction: 'asc' }]`) | `sortInvalid` | "The sort is not valid." |
  | an entry's `direction` is left out or is neither `'asc'` nor `'desc'` (`[{ id: 'name' }]`, `[{ id: 'name', direction: undefined }]`, `[{ id: 'name', direction: null }]`, `[{ id: 'name', direction: 'up' }]`, `[{ id: 'name', direction: 'ASC' }]`, `[{ id: 'name', desc: false }]`) | `sortInvalid` | "The sort is not valid." |
  | `sort` names a column that is not configured | `sortColumnUnknown` | "The sort names an unknown column." |
  | `sort` names a column that is not sortable | `sortColumnNotSortable` | "The sort names a column that cannot be sorted." |
  | `sort` gives a column a direction it does not allow | `sortDirectionNotAllowed` | "The sort uses a direction a column does not allow." |
  | `sort` names a column twice | `sortColumnDuplicate` | "The sort names a column twice." |

  With several faults at once, a fault of RND-05's table wins over one of the table above, and within the table above
  the first row that applies is the one the console line names (for example an empty caption and an unknown sort
  column: `captionEmpty`).

  `sort` left out, given as `undefined` or `null`, or given as an empty list means no order and is no fault; a press
  then emits as from `[]`.

  A column's `sortable` given as `null` means the column is not sortable, as when it is left out, and is no fault.
- Reason: a sort the table cannot show is a wrong table; the user would believe an order the rows do not have.
- Layer: component.
- Traces: PRD-B16, PRD-B3, PRD-B4.

**SORT-16** The alert and the console line MUST hold no value taken from the `sort` prop or from the definitions of
the columns it names.
- Examples (as RND-09, for the sort props; the test runs every row, and in each it first finds the alert and the
  console line SORT-15 gives that input):

  | Invalid input | Text that must not appear in the alert or the console line |
  |---|---|
  | `sort` `[col-z3 asc]`, no column `col-z3` | "col-z3" |
  | `sort` names the column `col-w4`, labelled "Secret-5", twice | "col-w4", "Secret-5" |

- Reason: alerts and console lines are often logged or screenshotted, and column ids and labels can name confidential
  things.
- Layer: component.
- Traces: PRD-S4, PRD-B16.

**SORT-17** Every fixed word of sort MUST come from a prop with an English default.
- Examples (as RND-06, for the sort words; the test runs every row in the set-up of its "Shown by" statement; it
  passes a full `messages` object of non-English words, then checks that each replacement appears where the row
  says and that no English default is left on the page, in an accessible name or in a description):

  | Message | English default | Shown by |
  |---|---|---|
  | `sortableHint` | "Column headers with buttons are sortable." | SORT-28 |
  | `sortRank` (a function of the rank) | "2" for rank 2 | SORT-05, I18N-01 |
  | `sortDescription` (a function of `{ direction, rank }`, SORT-06) | the four descriptions of SORT-06 | SORT-06, I18N-01 |

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
- Example (as A11Y-07, for the sort buttons): Tab to "Name"; its computed outline, or at least one entry of
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
  | `sortableHint`, and the returned text of `sortRank` and `sortDescription` | SORT-17 |

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
  press "Name" with and without Shift, rerender it with a new order, and unmount it: while it is mounted, the
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

**PAGE-10** The pager's controls MUST come in this order: the page-size select when there is one, then "First page",
"Previous page", the page numbers, "Next page", "Last page".
- Example: `offset 100, limit 10, total 200, sizes [10, 25]`: in document order, the select comes before "First page",
  and every page number button lies after "Previous page" and before "Next page".
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
  | 95 | 95 | `1 … 6 7 8 9 10` |
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
  | `offset 80, total 90` (last page, `total` a multiple of `limit`) | Next page, Last page |
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
named "rows per page", with `limit` selected.
- Example: `limit 25, sizes [10, 25, 50, 100, 250, 500, 1000]` gives one select whose accessible name is "rows per
  page", with those seven options in that order and 25 selected.
- Reason: the allowed sizes are a server limit that the consumer knows and the component does not.
- Layer: component.
- Traces: PRD-B9.

**PAGE-24** The page-size select's name MUST be text that is visible on the page.
- Example: `limit 25, sizes [10, 25, 50]`: the element holding "rows per page" lies inside the viewport and inside
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
- Examples (the test runs every row): no `sizes` prop; `sizes []`; `sizes null` (as left out). In each, no element
  with role `combobox` or `listbox` is in the pager.
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
  | `sizes` is not a list (a string, a number), or holds 0, 2.5 or the same size twice | `sizesInvalid` | "The page sizes are not valid." |
  | `sizes` is not empty and does not hold `limit` | `limitNotInSizes` | "The page size is not one of the offered sizes." |
  | `onpage` is not given | `pageHandlerMissing` | "The pager has no page handler." |
  | `sizes` is not empty and `onsize` is not given | `sizeHandlerMissing` | "The page-size select has no handler." |
  | `unfilteredTotal` is given and is -1, 1.5, `NaN`, `Infinity` or 2^53 | `unfilteredTotalInvalid` | "The unfiltered row total is not a valid number." |

  A valid number here is a safe non-negative integer (`limit`: a safe positive integer). `unfilteredTotal` sends no
  request; it is refused because the information line (PAGE-38) would show a count that is none. An `unfilteredTotal`
  below `total` is no fault: a server's unfiltered count can be an estimate, and PAGE-38 shows it as given. `sizes`
  given as `null` means no sizes, as when it is left out, and is no fault (PAGE-15). `unfilteredTotal` given as `null`
  means not given, and is no fault: a JSON answer has no other way to leave the count out.
- Reason: a wrong pager is worse than none; a stray NaN or a page 0 would send a wrong request, and a control with
  no handler does nothing.
- Layer: component.
- Traces: PRD-B9, PRD-S4, PRD-B26.

**PAGE-19** Every fixed word the pager shows or announces MUST come from its `messages` prop with an English default.
- Examples (the test runs every row but the last through a full `messages` object of non-English words, then checks
  that each replacement appears where the row says and that no English default is left in the pager's text or
  accessible names; the last row is run apart, below):

  | Message | English default | Shown by |
  |---|---|---|
  | `firstPage` | "First page" | PAGE-01 |
  | `previousPage` | "Previous page" | PAGE-01 |
  | `nextPage` | "Next page" | PAGE-01 |
  | `lastPage` | "Last page" | PAGE-01 |
  | `pageLabel` (a function of the page number) | "Page 6" for page 6 | PAGE-01, I18N-01 |
  | `pageNumber` (a function of the page number) | "6" for page 6 | PAGE-02, I18N-01 |
  | `sizeLabel` | "rows per page" | PAGE-07, PAGE-24 |
  | `sizeOption` (a function of the size) | "1,000" for 1000 | PAGE-07, I18N-01 |
  | `info` (a function of `{ first, last, total }`) | "Showing 1 to 10 of 57 rows" | PAGE-37, I18N-01 |
  | `infoFiltered` (a function of the unfiltered total) | "(filtered from 1,000 total rows)" for 1000 | PAGE-38, I18N-01 |
  | each alert message of PAGE-16 | its default in PAGE-16 | PAGE-16 |
  | any entry given as `undefined` or `null`, or not of its type (the number 5 for a word; a text for `pageLabel`), or an empty or blank text | that entry's English default | the statement that shows the entry |

  The last row is run apart from the full object: one entry of each kind given alone (`undefined`, `null`, a number
  for a word, a text for a function, an empty and a blank text) shows that entry's English default.
  The gap mark "…" is a symbol hidden from assistive technology (PAGE-11), not a word.
- Reason: consumers translate and reword without forking the component.
- Layer: component.
- Traces: PRD-I1, PRD-B26.

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
  elements handle (`click` and `change`) to measure the listeners Svelte itself delegates to the document,
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
  | every element above, and the element that holds the information line (PAGE-37) | `font-family`, `font-size` and `line-height` equal those of its parent element |

- Reason: the pager must look the same whatever the application loaded first, as THEME-10 states for the table
  (PRD-T11 (a)).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T11.

**PAGE-37** The pager MUST show the information line "Showing <first> to <last> of <total> rows", worked out from
`offset`, `limit` and `total`.
- Examples (the test runs every row; `limit 10`; the line is visible text within the pager):

  | `offset` | `total` | Line |
  |---|---|---|
  | 0 | 57 | "Showing 1 to 10 of 57 rows" |
  | 50 | 57 | "Showing 51 to 57 of 57 rows" |
  | 0 | 1 | "Showing 1 to 1 of 1 row" |
  | 0 | 0 | "Showing 0 to 0 of 0 rows" |
  | 90 | 90 | "Showing 0 to 0 of 90 rows" |
  | 100 | 95 | "Showing 0 to 0 of 95 rows" |
  | 1000 | 12345 | "Showing 1,001 to 1,010 of 12,345 rows" |

  First is `offset` plus 1; last is the smaller of `offset` plus `limit` and `total`: the pager is given no rows,
  and an answer that matches its query holds that many (PRD-B26's "number of rows given"). With no row on the page,
  a total of 0 or an `offset` at or past `total` (PAGE-25), first and last are 0. The default words say "row" when
  the total is 1, "rows" otherwise.
- Reason: a user reads where they are and how many rows matched, as in DataTables' `info`, whose server-side end is
  the same smaller value (FETCHED 2026-11-19, DataTables 3.1.5 source); past the end DataTables shows a range that
  runs backwards ("Showing 101 to 95 of 95 entries", INFERRED from that source), while 0 to 0 says the page is empty
  and keeps the total (`docs/departures.md`).
- Layer: component.
- Traces: PRD-B26, PRD-I1, PRD-I2.

**PAGE-38** With `unfilteredTotal` given and different from `total`, the information line MUST end with "(filtered
from <unfilteredTotal> total rows)", after one space.
- Examples (the test runs every row; `offset 0, limit 10`):

  | `total` | `unfilteredTotal` | Line |
  |---|---|---|
  | 57 | 1000 | "Showing 1 to 10 of 57 rows (filtered from 1,000 total rows)" |
  | 57 | 57 | "Showing 1 to 10 of 57 rows" |
  | 57 | not given | "Showing 1 to 10 of 57 rows" |
  | 0 | 1 | "Showing 0 to 0 of 0 rows (filtered from 1 total row)" |
  | 57 | 50 | "Showing 1 to 10 of 57 rows (filtered from 50 total rows)" |

  The default words say "row" when the unfiltered total is 1, "rows" otherwise.
- Reason: the user learns that filters narrowed the rows, and from how many, as in DataTables' `infoFiltered`; the
  same number twice tells nothing.
- Layer: component.
- Traces: PRD-B26, PRD-I1, PRD-I2.

**PAGE-39** The information line MUST NOT be announced: neither the element that holds it nor any of its ancestors
within the pager has `aria-live` or the role `status`, `alert` or `log`.
- Example: `offset 0, limit 10, total 57`, then `offset 10`: the line reads "Showing 11 to 20 of 57 rows", and the
  element holding it and its ancestors up to the pager's `nav` have none of those attributes or roles.
- Reason: the table's live count (A11Y-05) is the one announcement of a new page; the line would say it a second
  time (PRD-B26, PRD-A4).
- Layer: component.
- Traces: PRD-B26, PRD-A4.

**PAGE-40** The information line MUST come after the page-size select, when there is one, and before "First page" in
document order.
- Examples (the test runs every row; `offset 100, limit 10, total 200`; the element holding "Showing 101 to 110 of
  200 rows"):

  | `sizes` | Comes after | Comes before |
  |---|---|---|
  | `[10, 25]` | the page-size select | "First page" |
  | `[]` | nothing in the pager | "First page" |

- Reason: DataTables' default layout reads page length (`topStart`), then the information (`bottomStart`), then the
  paging controls (`bottomEnd`) (FETCHED 2026-11-19, datatables.net/reference/option/layout); the pager keeps that
  reading order (WCAG 1.3.2).
- Layer: component.
- Traces: PRD-B26, PRD-A3.

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
  that each replacement appears and that no Western digit is left where the row reads, which for the page numbers,
  the page labels and the size options is every page button and every option):

  | Function | Called with | English default | Shown by |
  |---|---|---|---|
  | `rowCount` | 1000 | "1,000 rows displayed" | A11Y-05 |
  | `sortRank` | 2 | "2" | SORT-05 |
  | `sortDescription` | `{ direction: 'desc', rank: 3 }` | "sorted descending, priority 3. H" (H as in SORT-06) | SORT-06 |
  | `pageNumber` | 1234 | "1,234" | PAGE-02 |
  | `pageLabel` | 1234 | "Page 1,234" | PAGE-01 |
  | `sizeOption` | 1000 | "1,000" | PAGE-07 |
  | `info` | `{ first: 1001, last: 1010, total: 12345 }` | "Showing 1,001 to 1,010 of 12,345 rows" | PAGE-37 |
  | `info` | `{ first: 1, last: 1, total: 1 }` | "Showing 1 to 1 of 1 row" | PAGE-37 |
  | `infoFiltered` | 1000 | "(filtered from 1,000 total rows)" | PAGE-38 |
  | `infoFiltered` | 1 | "(filtered from 1 total row)" | PAGE-38 |

  The defaults group digits the English way whatever the runtime's default locale: the test calls each row's default
  function once more, directly and without mounting, in a process started with a German default locale (`LANG` and
  `LC_ALL` `de_DE.UTF-8`) and expects the English column; that run first asserts that the runtime's own default
  formatting gives "1.000" and that `navigator.language` and `navigator.languages` are German, so a locale that did
  not take effect fails instead of passing.
- Reason: digits, grouping and plural forms differ by language (PRD-I2).
- Layer: component.
- Traces: PRD-I2, PRD-I1, PRD-B26.

## 11. Filters: the fields and what they emit (FILT, milestone 4)

These statements add a column's `filter`, either `{ kind: 'text' }` or `{ kind: 'categorical', options }` with
`options` a list of `{ value, label }` and an optional `emptyOption`, a boolean (default `false`, FILT-53);
`filters`, the applied filter of each column id, `{ kind: 'text', text }` or
`{ kind: 'categorical', selected }` with `selected` a list of option values; `onfilter(columnId, state)`, called
with a state of that shape; `searchDelay` (milliseconds, default 400), `searchOnEnter` (default `false`) and
`maxLength` (default 255) (PRD-B6, PRD-B7). A column's filter is edited in its filter dialog, opened by the filter
button of FILT-29. The dialog is a popover in the top layer (the dialog statements state how it opens and closes);
the simulated DOM has no popover (jsdom 31.0.1 implements neither `showPopover` nor `popovertarget`, MEASURED), so
every statement here that opens the dialog is tested in a real browser, in Chromium, Firefox and WebKit, with time
moved by fake timers as in the slow-load statements. In the examples, column Name (id `name`) has a text filter
and column Status (id `status`) a categorical filter with the options `active` "Active" and `inactive` "Inactive",
in that order. "Type" means key presses into the open dialog's field, which take no time; a text that holds a
control character, which no key types, is put in by one paste (`insertText`). Times are counted from the first key
of the example. "Filter Name text" is the text field of Name's dialog. `maxLength` counts characters as code points
(an emoji such as U+1F600 counts 1).

**FILT-29** A column with a `filter` MUST show the button "Filter <label>" in its header cell.
- Examples (the test runs every row; columns Name with a text filter and Note without one):

  | Column | Button in its header cell |
  |---|---|
  | Name | one button named "Filter Name" |
  | Note | none whose name starts with "Filter" (RND-11) |

- Reason: the filter is reached from the column it narrows (RND-11 is the negative half).
- Layer: component.
- Traces: PRD-B6, PRD-B7, PRD-B3.

**FILT-01** A text filter MUST emit `onfilter` once typing pauses for `searchDelay` milliseconds, with the field's
text, and not while typing goes on.
- Examples (the test runs every row; `filters` holds no filter for Name):

  | Steps | `onfilter` calls |
  |---|---|
  | type "beta"; at 399 ms | none |
  | type "beta"; at 400 ms | one: `('name', { kind: 'text', text: 'beta' })` |
  | type "be"; at 300 ms type "ta"; at 699 ms | none |
  | type "be"; at 300 ms type "ta"; at 700 ms | one, with "beta" |
  | `searchDelay={1000}`; type "beta"; at 999 ms, then at 1000 ms | none, then one with "beta" |
  | `searchDelay={0}`; type "beta", with no time moved | four, each at its key, with "b", "be", "bet", "beta" in that order |
  | `filters` holds `name: { kind: 'text', text: 'beta' }`, so the field holds "beta" (FILT-37); type "x", then Backspace; at 400 ms | none: the text equals the applied one |

- Reason: the owner's default, as DataTables' `searchDelay` under server-side processing: one query per pause, not
  one per key, and no query for a text already applied (PRD-B6).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6.

**FILT-27** Enter in a text filter's field MUST emit `onfilter` at once, and the pause then emits nothing more.
- Examples (the test runs every row):

  | Steps | `onfilter` calls |
  |---|---|
  | type "beta"; at 100 ms press Enter | one with "beta" at 100 ms, and still one at 600 ms |
  | `filters` holds `name: { kind: 'text', text: 'beta' }`; press Enter in the field | none: the text equals the applied one |

- Reason: a user who knows the text is complete need not wait (PRD-B6); an unchanged text is no new query, as in
  DataTables, which searches only when the text differs from the applied one (READ, DataTables 3.1.5 source). On
  Enter DataTables waits for the pause unless `search.return` is set (`docs/departures.md`).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6.

**FILT-28** With `searchOnEnter`, a text filter MUST emit `onfilter` only on Enter.
- Example: `searchOnEnter`; type "beta"; at 1000 ms no call; press Enter: one call with "beta".
- Reason: some servers are too slow for a query per pause; DataTables' `search.return` is the same setting (PRD-B6).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6.

**FILT-13** A text filter's field MUST be described by "Press Enter to apply." exactly while `searchOnEnter` is set.
- Examples (the test runs every row):

  | `searchOnEnter` | The accessible description of "Filter Name text" |
  |---|---|
  | `true` | contains "Press Enter to apply." |
  | `false` | does not contain it |

- Reason: under `searchOnEnter` nothing happens until Enter, and the user must learn that before typing; without
  it the text applies by itself and the hint would be false.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6, PRD-A1.

**FILT-14** A text filter's field MUST have `autocomplete="off"`.
- Example: "Filter Name text" has `autocomplete="off"`.
- Reason: browser suggestions would cover the dialog and could show earlier queries to the next user of a shared
  machine.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6.

**FILT-03** A text filter MUST NOT emit `onfilter` for text it refuses, neither after the pause nor on Enter.
- Examples (the test runs every row: type, wait 400 ms, press Enter; no call):

  | Typed | Refused because |
  |---|---|
  | "a", U+0001, "b" (pasted) | a control character |
  | "a", U+007F (pasted) | a control character |
  | 256 times "x" | longer than `maxLength` |
  | 256 times U+1F600 (pasted) | longer than `maxLength` |
  | 11 times "x", with `maxLength={10}` | longer than `maxLength` |

  255 times U+1F600 (pasted) is not refused: at 400 ms one call with that text.

  The field accepts the 256th character: it has no `maxlength` attribute, so the user sees the refusal of FILT-15
  instead of keys that do nothing.
- Reason: the server would refuse the query; the user learns at the field (PRD-B6).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6.

**FILT-15** While a text filter's field holds refused text, the field MUST be `aria-invalid="true"` and described by
an alert that says why.
- Examples (the test runs every row; the checks hold right after the key or paste that made the text refused,
  before any pause):

  | Typed | Alert text (default) |
  |---|---|
  | "a", U+0001 (pasted) | "Use at most 255 characters without control characters." |
  | 11 times "x", with `maxLength={10}` | "Use at most 10 characters without control characters." |

- Reason: the user hears why the filter was not applied, at the field (PRD-B6, WCAG 3.3.1).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6, PRD-A1.

**FILT-16** A key that makes the field's text valid again MUST remove the field's invalid mark and its alert.
- Example: paste "a", U+0001, then press Backspace: the field reads "a", `aria-invalid` is not "true", and no alert is in the
  dialog; at 400 ms one call with "a".
- Reason: a stale error misleads (PRD-B6).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6.

**FILT-17** A categorical filter MUST offer exactly its options (with `emptyOption: true`, also the option of
FILT-53), as checkboxes named by their labels, in the given
order (all of them while no find text narrows them, FILT-18), each checked exactly while its value is in `selected`.
- Example: `filters` holds `status: { kind: 'categorical', selected: ['inactive'] }`: Status's dialog holds the
  checkboxes "Active" (not checked) and "Inactive" (checked), in that order, and no other checkbox.
- Reason: the server accepts only its own vocabulary, so the user picks from it (PRD-B7).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B7.

**FILT-04** Each toggle of a categorical option MUST emit `onfilter` once, at once, with the next selection's values in
the options' order.
- Examples (the test runs every row; one press each):

  | `selected` before | Press | `onfilter` call |
  |---|---|---|
  | `[]` | "Inactive" | `('status', { kind: 'categorical', selected: ['inactive'] })` |
  | `['inactive']` | "Active" | `('status', { kind: 'categorical', selected: ['active', 'inactive'] })` |
  | `['active', 'inactive']` | "Active" | `('status', { kind: 'categorical', selected: ['inactive'] })` |

- Reason: the server matches on values, labels are for people, and a click has no half-typed state to wait for
  (PRD-B7).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B7.

**FILT-37** A text filter's field MUST take the applied text of `filters` when its dialog opens, and when `filters`
changes while nothing has been typed in it since it last emitted or last took the applied text; otherwise it keeps
its text.
- Examples (the test runs every row; "Filter Name text" after the steps):

  | Steps | Field reads |
  |---|---|
  | `filters` holds `name: { kind: 'text', text: 'beta' }`; open the dialog | "beta" |
  | `filters` holds no filter for Name; open the dialog | "" |
  | open the dialog with "beta" applied; with nothing typed, `filters` becomes `name: { kind: 'text', text: 'gamma' }` | "gamma" |
  | opened with "beta"; type "x"; at 400 ms one call with "betax"; at 450 ms, `filters` unchanged | "betax" |
  | opened with "beta"; type "x"; at 400 ms one call with "betax"; at 500 ms `filters` becomes `name: { kind: 'text', text: 'betax' }` | "betax" |
  | opened with "beta"; type "x"; at 400 ms one call with "betax"; at 500 ms `filters` becomes `name: { kind: 'text', text: 'gamma' }` | "gamma" |

- Reason: the field shows what narrows the rows, and the props are the one source of truth (PRD-B2); text the
  user typed after the last emit is theirs until it is sent (FILT-05), and sent text stays while its answer is on
  the way.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6, PRD-B2.

**FILT-05** When `filters` changes while the open field holds newer typing, the field MUST keep the newer typing.
- Example: type "mel"; at 400 ms one call with "mel"; at 450 ms type "anoma"; at 500 ms `filters` becomes
  `name: { kind: 'text', text: 'mel' }`: the field reads "melanoma"; 400 ms after the last key a second call with
  "melanoma".
- Reason: a slow answer to an earlier query must not erase what the user is typing (PRD-B6).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6.

### The filter dialog: opening, closing and focus (milestone 4)

The filter dialog is a popover in the top layer: it is drawn above the page and is not clipped by the region, so a
statement that places something "inside the region" means the filter button, never the dialog. It closes on a
press outside it and on Escape by the browser's own light dismiss, and when focus leaves it by Tab through a
`focusout` handler on the dialog itself; no listener on `document` or `window` is added (FOOT-02; the practice
check of 2026-11-19 chose this route). The examples use the columns of section 11 plus column Code (id `code`,
sortable, no filter) after Status; Name and Status are not sortable. The header cell of a column holds its sort
button, then its filter button, and a filter dialog's markup follows its own filter button in document order.

**FILT-02** A press on "Filter <label>" MUST open one dialog named "<label> filter".
- Examples (the test runs every row):

  | Press | Dialog open after it |
  |---|---|
  | "Filter Name" | one element with role `dialog` and name "Name filter" |
  | "Filter Status" | one element with role `dialog` and name "Status filter" |

- Reason: a screen reader says where the user is (PRD-A1).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6, PRD-B7, PRD-A1.

**FILT-34** The open filter dialog MUST be shown whole, also where the region clips its content.
- Example: a 1280 by 800 CSS px viewport; the table at the top of the page, its region 60 CSS px tall (lower than
  the dialog) and scrolling, with 20 rows; press "Filter Name": the dialog's box lies inside the viewport, and at the
  midpoint of each of its four edges, moved 2 px inwards, `document.elementFromPoint` returns the dialog or an
  element inside it. Break that turns it red: the dialog without `popover`, as an absolutely positioned child of
  Name's header cell, which the region clips.
- Reason: a dialog cut off by the region hides its own field (PRD-A1, WCAG 2.4.11).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6, PRD-A1.

**FILT-11** A filter button's `aria-expanded` MUST be "true" exactly while its dialog is open.
- Examples (the test runs every row; "Filter Name" after each step):

  | Steps | `aria-expanded` |
  |---|---|
  | none | "false" |
  | press "Filter Name" | "true" |
  | press "Filter Name"; Escape | "false" |
  | press "Filter Name"; press "Filter Name" | "false" |
  | press "Filter Name"; press "Filter Status" | "false" |

- Reason: assistive technology tells the user whether the dialog is open (PRD-A1).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6, PRD-B7, PRD-A1.

**FILT-12** Opening a filter dialog MUST move focus to its first field.
- Examples (the test runs every row):

  | Press | Focused after it |
  |---|---|
  | "Filter Name" | "Filter Name text" |
  | "Filter Status" | the checkbox "Active", the first option |
  | "Filter Kind" (FILT-52) | "Find Kind options" |

- Reason: keyboard users land where they type (PRD-A1).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6, PRD-B7, PRD-A1, PRD-B29.

**FILT-52** A categorical filter's dialog MUST show the find field "Find <label> options" above its options exactly
while the filter has more than 10 options, the option of FILT-53 included.
- Examples (the test runs every row; press the column's filter button):

  | Options | Find field |
  |---|---|
  | Status's 2 options | none |
  | Kind's 11 options | "Find Kind options", before the first checkbox in document order |
  | Kind's options `k1` to `k10` and `emptyOption: true` | "Find Kind options": the option of FILT-53 counts |

  Column Kind (id `kind`) has a categorical filter with the options `k1` "Alpha" to `k10` "Kappa" (the Greek letter
  names in order) and `k11` "Inactive".
- Reason: a long vocabulary needs a way to reach an option, and a short list needs none (PRD-B29).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B29, PRD-B7.

**FILT-53** A categorical filter with `emptyOption: true` MUST offer one more option after its given ones, the
checkbox named by the `emptyOption` message, whose value in `selected` and in `onfilter` is `''`.
- Examples (the test runs every row; Status with `emptyOption: true`; press its filter button, then the press):

  | `selected` before | Checkboxes, in order (checked) | Press | `onfilter` call |
  |---|---|---|---|
  | `[]` | "Active", "Inactive", "(empty)" (none) | "(empty)" | `('status', { kind: 'categorical', selected: [''] })` |
  | `['']` | "Active", "Inactive", "(empty)" ("(empty)") | "Active" | `('status', { kind: 'categorical', selected: ['active', ''] })` |
  | `['active', '']` | "Active", "Inactive", "(empty)" ("Active", "(empty)") | "(empty)" | `('status', { kind: 'categorical', selected: ['active'] })` |

  Without `emptyOption`, Status's dialog holds "Active" and "Inactive" only (FILT-17). FILT-18, FILT-22 and FILT-52
  each hold an example with the option.
- Reason: rows without a value are part of the data (PRD-B7, the owner's decision of 2026-11-20), and `''` is a value
  no given option can hold (FILT-32), so "no value" needs no word the server must know. The option is off by default
  because the table sees one page and cannot know whether any row is empty, while the libraries that list a blank
  entry derive it from the data they hold (FETCHED 2026-11-20: AG Grid's set filter lists "(Blanks)" when its values
  hold blanks and keeps it in its filter model as `null`; Excel's "(Blanks)" is "available only if the column that
  you want to filter contains a blank cell"; SearchPanes shows empty cells as "No Data"). It sits last because Excel's
  user scrolls down to "(Blanks)" (FETCHED; the bottom implied, not stated; AG Grid and SearchPanes name no place),
  and so the given vocabulary keeps its order.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B7.

**FILT-18** Typing in a find field MUST narrow the shown options to those whose label contains the text, ignoring
case, and MUST NOT emit anything or change the selection.
- Examples (the test runs every row; Kind of FILT-52 with `selected ['k1']`; "Find Kind options" after the steps):

  | Steps | Options shown | Also |
  |---|---|---|
  | type "inact"; at 1000 ms | "Inactive" only | no callback called |
  | type "ALP" | "Alpha" only | no callback called |
  | type "inact", then clear the field | all 11, "Alpha" still checked | no callback called |
  | type "inact", press Escape, press "Filter Kind" | all 11, and the find field is empty | no callback called |
  | type "xyz" | none; the text "No options match." in their place | no callback called |
  | with Kind's `emptyOption: true`, type "EMPT" | "(empty)" only, matched by its label | no callback called |

- Reason: the find field helps the user reach an option; it is not a filter of its own, and its text goes with the
  dialog (PRD-B29, PRD-B2).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B29, PRD-B2, PRD-B7.

**FILT-06** Opening a filter dialog MUST close any other open filter dialog.
- Example: with "Name filter" open, press "Filter Status": exactly one element with role `dialog` is open, named
  "Status filter".
- Reason: two open dialogs overlap and split focus.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6, PRD-B7.

**FILT-19** A press outside an open filter dialog MUST close it and act as a press on what it hits.
- Examples (the test runs every row; "Name filter" open, focus in "Filter Name text"; after the press no element
  with role `dialog` is open, and focus is neither in the dialog nor on "Filter Name"):

  | Press on | Also after it |
  |---|---|
  | the text of a body cell | no callback called |
  | "Code" | `onsort` called once |

  Where focus goes after the press is the engine's: Chromium and Firefox focus a pressed button, WebKit does not
  (MDN, the `button` element, "Clicking and focus", FETCHED 2026-11-19).
- Reason: the press means the user has moved on, and the press must still do what it does (PRD-B6, PRD-B7).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6, PRD-B7, PRD-B19.

**FILT-07** Escape in an open filter dialog MUST close it and return focus to its filter button.
- Example: press "Filter Name", press Escape: no element with role `dialog` is open, and focus is on "Filter Name".
- Reason: the user returns to where they started (APG dialog pattern; PRD-A1).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6, PRD-B7, PRD-A1.

**FILT-36** An Escape that closes a filter dialog MUST NOT reach a `keydown` listener the application has on
`document`, and every other Escape MUST reach it.
- Examples (the test runs every row; the application's listener is added on `document` before mount and counts
  Escape key events):

  | Escape pressed | Dialog | Escapes the listener counts |
  |---|---|---|
  | in "Filter Name text", "Name filter" open | closes | 0 |
  | on "Filter Name" after Shift+Tab from "Filter Name text" (FILT-21), "Name filter" open | closes | 0 |
  | after a mouse press on the checkbox "Inactive" in "Status filter", which stays open | closes | 0 |
  | on "Code", no dialog open | - | 1 |
  | on "Filter Name", no dialog open | - | 1 |

- Reason: an application that closes its own modal on Escape must not close it too when the user only closed the
  filter dialog (PRD-B19's Escape rule). The browser closes a popover on Escape only after the `keydown` event has
  been dispatched through the document, unless it was cancelled (HTML, close requests, FETCHED 2026-11-19), so the
  dialog and its filter button stop that event themselves, and a press inside the open dialog must leave focus inside
  it: WebKit does not focus a pressed button (MDN, FETCHED) and, INFERRED, a pressed checkbox, so focus would
  otherwise fall to the body, where neither sees the key.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B19, PRD-B6, PRD-B7.

**FILT-20** Tab out of an open filter dialog MUST close it and leave focus where Tab put it.
- Example: press "Filter Name", press Tab: no element with role `dialog` is open, and focus is on "Filter Status",
  the next control after "Filter Name".
- Reason: a dialog left open after Tab can cover the newly focused control (WCAG 2.4.11).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6, PRD-B7, PRD-A1.

**FILT-21** Shift+Tab from a dialog's first field to its own filter button MUST keep the dialog open.
- Example: press "Filter Name", press Shift+Tab: focus is on "Filter Name" and "Name filter" is still open.
- Reason: the button belongs to the dialog, so going back to it is not leaving.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6, PRD-B7, PRD-A1.

**FILT-35** Closing a filter dialog MUST emit nothing for text typed and not yet emitted.
- Examples (the test runs every row; type "be" in "Filter Name text" with `filters` holding no filter for Name,
  then close at 100 ms; at 1000 ms no `onfilter` call; pressing "Filter Name" again shows an empty field):

  | Closed by |
  |---|
  | Escape |
  | a press on the text of a body cell |
  | Tab |

- Reason: closing is the user's way to leave without a query; a query sent after the dialog has gone would change
  the rows with no field left to show why (PRD-B2: the unsent text is internal state and goes with the dialog).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B6, PRD-B2.

### Badges, clearing, "Reset table" and the application's criteria (milestone 4)

These statements add `onclearfilter(columnId)`, `onclearfilters()`, `onreset()` and the snippet `criteria` (PRD-B8,
section 5.2 of the PRD). A filter applies when its entry in `filters` holds a non-empty text or a non-empty
selection. The examples use the columns of section 11 and Code (sortable), with every handler passed. Hidden columns
come with the column statements (milestone 5), which state the badges and focus for them.

**FILT-08** Each applied filter MUST show one badge, a button whose accessible name holds its visible words.
- Examples (the test runs every row):

  | `filters` | Badges |
  |---|---|
  | `name: { kind: 'text', text: 'Beta' }` | one button, text "Name: contains “Beta”", name "Clear filter Name: contains “Beta”" |
  | `name: { kind: 'text', text: '' }` | none |
  | `status: { kind: 'categorical', selected: [] }` | none |

- Reason: the user sees what narrows the rows, and the visible words stay in the accessible name (PRD-B8, WCAG
  2.5.3).
- Layer: component.
- Traces: PRD-B8, PRD-A1.

**FILT-22** A badge of a categorical filter MUST name the selected options by their labels, in the options' order.
- Examples: `status: { kind: 'categorical', selected: ['inactive', 'active'] }` gives the badge text "Status: Active,
  Inactive"; with Status's `emptyOption: true`, `selected: ['', 'active']` gives "Status: Active, (empty)".
- Reason: values are codes that mean nothing to the user (PRD-B7, PRD-B8).
- Layer: component.
- Traces: PRD-B7, PRD-B8.

**FILT-09** A press on a badge MUST emit `onclearfilter` once, with its column id.
- Example: press "Clear filter Name: contains “Beta”": `onclearfilter('name')`, as "emits once" defines it.
- Reason: one press is one query (PRD-B2, PRD-B8).
- Layer: component.
- Traces: PRD-B8, PRD-B2.

**FILT-24** After a badge is pressed, focus MUST move to its column's filter button.
- Example: `filters` holds Name's text "Beta"; focus the badge and press Enter; then `filters` holds no filter: the
  badge is gone and focus is on "Filter Name".
- Reason: the pressed badge disappears, and focus must not fall to the page body (WCAG 2.4.3).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B8, PRD-A3.

**FILT-10** "Clear column filters" MUST be shown exactly while at least one filter applies.
- Examples (the test runs every row):

  | `filters` | "Clear column filters" |
  |---|---|
  | `{}` | not shown |
  | `name: { kind: 'text', text: '' }` | not shown |
  | `name: { kind: 'text', text: 'Beta' }` | shown |

- Reason: a control with nothing to clear misleads (PRD-B8).
- Layer: component.
- Traces: PRD-B8.

**FILT-25** A press on "Clear column filters" MUST emit `onclearfilters` once.
- Example: Name's text "Beta" and Status's `['active']` apply; one press: `onclearfilters()`, as "emits once"
  defines it, so `onclearfilter` is not called.
- Reason: one press is one query, not one per filter (PRD-B2, PRD-B8).
- Layer: component.
- Traces: PRD-B8, PRD-B2.

**FILT-30** "Reset table" MUST be shown exactly while `onreset` is given and a column is sortable or has a filter.
- Examples (the test runs every row):

  | Columns | `onreset` | "Reset table" |
  |---|---|---|
  | Code sortable, no filter | given | shown |
  | Name with a filter, none sortable | given | shown |
  | Code sortable | not given | not shown |
  | neither sortable nor with a filter | given | not shown (RND-12) |

- Reason: the reset is the application's intent and does nothing without its handler; a table built before this
  group, with sort and no `onreset`, keeps its look (PRD-B8; RND-12 is the negative half).
- Layer: component.
- Traces: PRD-B8, PRD-B3.

**FILT-26** A press on "Reset table" MUST emit `onreset` once.
- Examples (the test runs every row; one press each: `onreset()`, as "emits once" defines it):

  | Applied | Not called |
  |---|---|
  | the order `[code asc]` and Name's text "Beta" | `onsort`, `onclearfilters` |
  | the order `[code asc]` and `search` "beta", `onsearch` given | `onsort`, `onsearch`; "Search" still reads "beta" until `search` changes (FILT-44) |

- Reason: the application restores sort and filters in one query (PRD-B2, PRD-B8).
- Layer: component.
- Traces: PRD-B8, PRD-B2, PRD-B25.

**FILT-31** The badges, the `criteria` snippet, "Clear column filters" and "Reset table" MUST come in that order, all
before the region, in document order.
- Examples (the test runs every row; the snippet holds the button "Clear my criteria"):

  | `filters` | In document order |
  |---|---|
  | Name's text "Beta" and Status's `['active']` | the badge of Name, the badge of Status, "Clear my criteria", "Clear column filters", "Reset table", the region |
  | `{}` | "Clear my criteria", "Reset table", the region |

- Reason: the application's own criteria sit beside the column filters they join, and the clearing controls follow
  what they clear (PRD section 5.2; WCAG 1.3.2).
- Layer: component.
- Traces: PRD-B8, PRD-A3.

**FILT-32** For invalid filter input the table MUST render the alert of RND-05 with the fixed message the examples
below list.
- Examples (as RND-05, for the filter props; the test runs every row and every value or alternative in it: one
  element with `role="alert"` holding the default text, and no `table` element):

  | Invalid input | Message key | Alert text (default) |
  |---|---|---|
  | a column's `filter` has a `kind` other than `'text'` and `'categorical'` | `filterInvalid` | "A column filter is not valid." |
  | a categorical filter's `options` is empty or not a list | `filterInvalid` | "A column filter is not valid." |
  | an option's value or label in `options` is empty (the option of FILT-53 is not in `options`) | `filterInvalid` | "A column filter is not valid." |
  | a categorical filter's `emptyOption` is `'yes'` or `1`, or a text filter's is `true` (`undefined` and `null` are not given) | `filterInvalid` | "A column filter is not valid." |
  | two options share a value, or labels equal after trimming, the option of FILT-53 with its shown label included (Status with an option `none` "(empty)" and `emptyOption: true`) | `filterInvalid` | "A column filter is not valid." |
  | a column has a filter and `onfilter`, `onclearfilter` or `onclearfilters` is not given | `filterHandlerMissing` | "A filter has no handler." |
  | `filters` names a column that is not configured or has no filter | `filterStateInvalid` | "An applied filter is not valid." |
  | an entry of `filters` has another `kind` than its column's filter | `filterStateInvalid` | "An applied filter is not valid." |
  | `selected` holds a value that is no option (`''` without `emptyOption: true` included), or a value twice | `filterStateInvalid` | "An applied filter is not valid." |
  | a text entry's `text` is not a string | `filterStateInvalid` | "An applied filter is not valid." |
  | `search` is not a string | `searchInvalid` | "The applied search is not valid." |
  | `searchDelay` is -1, 1.5, `NaN` or `Infinity` | `searchDelayInvalid` | "The search delay is not a valid number." |
  | `maxLength` is 0, -1, 1.5, `NaN` or `Infinity` | `maxLengthInvalid` | "The text length limit is not a valid number." |

  With several faults at once, a fault of RND-05's table wins, then one of SORT-15's, then the first row above that
  applies. An applied text that the field would refuse (FILT-03) is no fault: the rows are already narrowed by it, its
  badge shows it, and the field marks it as FILT-15 says when the dialog opens.
- Reason: a filter the table cannot show is a wrong table: the user would believe a narrowing the rows do not have,
  or press a control that does nothing (PRD-B16).
- Layer: component.
- Traces: PRD-B16, PRD-B7, PRD-B6, PRD-B25.

**FILT-39** The alert MUST hold no value taken from the filter props.
- Examples (as RND-09, for the filter props; the test runs every row, and in each it first finds the alert holding
  the FILT-32 message for that input):

  | Invalid input | Text that must not appear in the alert |
  |---|---|
  | two options of Status with the value `val-q8`, labelled "Secret-6" and "Other" | "val-q8", "Secret-6" |
  | Status's `selected` holds `val-p3`, which is no option | "val-p3" |

- Reason: alerts are often logged or screenshotted, and filter values can be confidential (PRD-S4).
- Layer: component.
- Traces: PRD-S4, PRD-B16.

**FILT-33** Every fixed word of the filters MUST come from a prop with an English default.
- Examples (as RND-06, for the filter words; the test runs every row in the set-up of its "Shown by" statement, the
  alert rows with that statement's invalid input; it passes a full `messages` object of non-English words, then
  checks that each replacement appears where the row says and that no English default is left on the page, in an
  accessible name or in a description):

  | Message | English default | Shown by |
  |---|---|---|
  | `filterButton` (a function of the label) | "Filter Name" for "Name" | FILT-29 |
  | `badgeText` (a function of `{ label, text }`) | "Name: contains “Beta”" | FILT-08 |
  | `badgeOptions` (a function of `{ label, options }`, the option labels) | "Status: Active, Inactive" | FILT-22 |
  | `clearFilter` (a function of the badge's words) | "Clear filter Name: contains “Beta”" | FILT-08 |
  | `clearFilters` | "Clear column filters" | FILT-10 |
  | `reset` | "Reset table" | FILT-30 |
  | `searchLabel` | "Search" | FILT-40 |
  | each alert message of FILT-32 | its default in FILT-32 | FILT-32 |

- Reason: consumers translate and reword without forking the component (PRD-I1).
- Layer: component.
- Traces: PRD-I1, PRD-B25.

**FILT-47** Every fixed word of the filter dialogs MUST come from a prop with an English default.
- Examples (as FILT-33, for the words inside a filter dialog, which the simulated DOM cannot open):

  | Message | English default | Shown by |
  |---|---|---|
  | `filterDialog` (a function of the label) | "Name filter" for "Name" | FILT-02 |
  | `filterText` (a function of the label) | "Filter Name text" | FILT-12 |
  | `findOptions` (a function of the label) | "Find Kind options" for "Kind" | FILT-52 |
  | `noOptions` | "No options match." | FILT-18 |
  | `emptyOption` | "(empty)" | FILT-53, with Status's `emptyOption: true` |
  | `pressEnter` | "Press Enter to apply." | FILT-13 |
  | `textRefused` (a function of `maxLength`) | "Use at most 255 characters without control characters." for 255; "Use at most 1,000 characters without control characters." for 1000, grouped the English way whatever the runtime's locale, as I18N-01 states for its functions | FILT-15 |

  The 1000 case runs once more in a browser context with the locale `de-DE`: the test first asserts that
  `(1000).toLocaleString()` gives "1.000" there, and still expects "1,000".

- Reason: consumers translate and reword without forking the component (PRD-I1, PRD-I2).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-I1, PRD-I2, PRD-B29, PRD-B7.

### The global search (milestone 4)

These statements add `search`, the applied search text (default `""`), and `onsearch(text)` (PRD-B25). The search
field follows the same rules as a text filter's field (PRD-B6), with `onsearch(text)` in place of `onfilter`; it is
not in a dialog, so its statements are tested in the simulated DOM, with time moved by fake timers, counted from the
first key, keys taking no time and a control character pasted, as in section 11. "Search" is the field found by role
`searchbox` and that name. What matches the text is the data source's (PRD-B25).

**FILT-40** The table MUST show the search field "Search" exactly while `onsearch` is given.
- Examples (the test runs every row):

  | `onsearch` | Fields with role `searchbox` |
  |---|---|
  | given | one, named "Search", with `autocomplete="off"` |
  | not given | none |

- Reason: the search box of DataTables' default layout, shown only where the application can answer it (PRD-B25);
  browser suggestions would show earlier searches to the next user of a shared machine (as FILT-14).
- Layer: component.
- Traces: PRD-B25.

**FILT-41** The search field MUST emit `onsearch` by the rules of FILT-01, FILT-27 and FILT-28.
- Examples (the test runs every row; `search` is `""`):

  | Steps | `onsearch` calls |
  |---|---|
  | type "beta"; at 399 ms, then at 400 ms | none, then one: `('beta')` |
  | type "be"; at 300 ms type "ta"; at 699 ms, then at 700 ms | none, then one with "beta" |
  | type "beta"; at 100 ms press Enter | one at 100 ms, and still one at 600 ms |
  | `searchOnEnter`; type "beta"; at 1000 ms, then press Enter | none, then one |
  | `searchDelay={0}`; type "be", with no time moved | two, with "b" and "be" |
  | `search` is "beta"; type "x", then Backspace; at 400 ms | none: the text equals the applied one |
  | `search` is "beta"; press Enter in the field | none: the text equals the applied one |

- Reason: one setting governs both kinds of search box, as PRD-B6 asks; the user learns one behaviour.
- Layer: component.
- Traces: PRD-B25, PRD-B6.

**FILT-42** The search field MUST NOT emit `onsearch` for text it refuses, as FILT-03 says for a text filter.
- Examples (the test runs every row: the steps, then at 400 ms press Enter; no call): paste "a", U+0001; paste "a",
  U+007F; type 256 times "x"; type 11 times "x", with `maxLength={10}`.
- Reason: the server would refuse the query (PRD-B6).
- Layer: component.
- Traces: PRD-B25, PRD-B6.

**FILT-48** The search field MUST be `aria-invalid="true"` and described by the alert of FILT-15 exactly while it holds
text it refuses.
- Examples (the test runs every row; the checks right after the last step):

  | Steps | `aria-invalid` | Described by |
  |---|---|---|
  | paste "a", U+0001 | "true" | "Use at most 255 characters without control characters." |
  | type 11 times "x", with `maxLength={10}` | "true" | "Use at most 10 characters without control characters." |
  | paste "a", U+0001, then press Backspace | not "true" | no alert |
  | mount with `search` "a" followed by U+0001 | "true" | "Use at most 255 characters without control characters." |

  An applied `search` the field would refuse is no fault (FILT-32): the field shows it and marks it.
- Reason: the user learns at the field why nothing is applied, and a stale error misleads (PRD-B6, WCAG 3.3.1).
- Layer: component.
- Traces: PRD-B25, PRD-B6, PRD-A1.

**FILT-43** The search field MUST be described by "Press Enter to apply." exactly while `searchOnEnter` is set.
- Examples (the test runs every row): `searchOnEnter` true: the description of "Search" contains "Press Enter to
  apply."; false: it does not.
- Reason: as FILT-13, for the search field (PRD-B6).
- Layer: component.
- Traces: PRD-B25, PRD-B6.

**FILT-44** The search field MUST take the applied text of `search` as FILT-37 says for a text filter's field, the
mount standing for the dialog's opening.
- Examples (the test runs every row; "Search" after the steps):

  | Steps | Field reads |
  |---|---|
  | mount with `search` "beta" | "beta" |
  | mount with `search` ""; with nothing typed, `search` becomes "gamma" | "gamma" |
  | type "x"; at 400 ms one call with "x"; at 450 ms, `search` unchanged | "x" |
  | type "x"; at 400 ms one call with "x"; at 500 ms `search` becomes "gamma" | "gamma" |

- Reason: the field shows what narrows the rows; the props are the one source of truth (PRD-B2).
- Layer: component.
- Traces: PRD-B25, PRD-B6, PRD-B2.

**FILT-49** When `search` changes while the field holds newer typing, the field MUST keep the newer typing, as FILT-05
says for a text filter.
- Example: type "mel"; at 400 ms one call with "mel"; at 450 ms type "anoma"; at 500 ms `search` becomes "mel": the
  field reads "melanoma"; at 850 ms a second call with "melanoma".
- Reason: a slow answer to an earlier query must not erase what the user is typing (PRD-B6).
- Layer: component.
- Traces: PRD-B25, PRD-B6.

**FILT-46** A press on "Clear column filters" MUST leave the search field's text as it is.
- Example: `search` "beta" and Name's text "Gamma" apply; press "Clear column filters": `onclearfilters()` is called
  once, as "emits once" defines it, so `onsearch` is not; "Search" still reads "beta".
- Reason: "Clear column filters" leaves the search (PRD-B8); "Reset table", an `onreset` that emits nothing else
  (FILT-26), is the application's reset of the search too.
- Layer: component.
- Traces: PRD-B8, PRD-B25.

**FILT-45** The search field MUST come before the badges of FILT-31 and before the region, in document order.
- Example: `onsearch` given, Name's text "Beta" applies: "Search" comes before the badge "Clear filter Name: contains
  “Beta”", which comes before the region.
- Reason: the search narrows every column, so it leads what narrows the rows (DataTables' default layout puts it at
  the top; WCAG 1.3.2).
- Layer: component.
- Traces: PRD-B25, PRD-A3.

## 12. Columns: hiding and the column chooser (COL, milestone 5)

These statements add `columnState`, the application's column state, `{ hidden }` with `hidden` a list of column ids
(later statements of this section add the order and the widths to it), and `oncolumnstate(next)`, called with the
whole next column state (PRD-B10). A column listed in `hidden` is hidden; every other given column is shown. The
column chooser is a dialog opened by the button "Columns"; like the filter dialog it is a popover in the top layer,
so every statement that opens it is tested in a real browser, in Chromium, Firefox and WebKit. The chooser's markup
follows the button "Columns" in document order. In the examples the columns are Name (id `name`), Code (id `code`)
and Date (id `date`), in that order, all three sortable, with no filter unless the example gives one, `onsort` and
`oncolumnstate` passed, and the table short enough that the region is not a Tab stop (A11Y-12).

**COL-01** The table MUST show exactly the given columns that are not in `columnState.hidden`, in the order of COL-09.
- Examples (the test runs every row; the header cells and the cells of each row):

  | `columnState.hidden` | Columns shown |
  |---|---|
  | none given | Name, Code, Date |
  | `['code']` | Name, Date |
  | `['name', 'date']` | Code |

- Reason: the application owns the column choice and stores it as a preference (PRD-B10, PRD-B2).
- Layer: component.
- Traces: PRD-B10, PRD-B2.

**COL-24** The button "Columns" MUST be shown exactly while `oncolumnstate` is given.
- Examples (the test runs every row): `oncolumnstate` given: one button "Columns"; not given: none.
- Reason: the chooser is offered only where the application stores the choice (PRD-B10, PRD-B2).
- Layer: component.
- Traces: PRD-B10.

**COL-29** "Columns" MUST come after the controls of FILT-31 and before the region, in document order.
- Example: Code sortable, `onreset` given: in document order "Reset table", then "Columns", then the region.
- Reason: the view control follows the controls that narrow and reset the rows, all before the table (WCAG 1.3.2).
- Layer: component.
- Traces: PRD-B10, PRD-A3.

**COL-26** A press on "Columns" MUST open one dialog named "Columns" and move focus to its first checkbox.
- Example: press "Columns": one element with role `dialog` and name "Columns" is open, "Columns" has
  `aria-expanded="true"`, and focus is on the checkbox "Name".
- Reason: a screen reader says where the user is, and keyboard users land where they act (PRD-A1).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B10, PRD-A1.

**COL-27** The column chooser MUST close as a filter dialog closes (FILT-07, FILT-19, FILT-20, FILT-06).
- Examples (the test runs every row; "Columns" pressed first; afterwards no dialog named "Columns" is open and
  "Columns" has `aria-expanded="false"`):

  | Then | Focus after it |
  |---|---|
  | press Escape | "Columns" |
  | press on the text of a body cell | not in the dialog and not on "Columns" |
  | press Tab from "Move later Date", the last control in the dialog (`aria-disabled`, still focusable: COL-10) | "Name", the next control |
  | press "Filter Name" (Name with a text filter) | "Filter Name text", in the open "Name filter" |

- Reason: the chooser behaves like the table's other dialogs, so the user learns one way to leave them (PRD-B10,
  PRD-A1).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B10, PRD-A1.

**COL-28** An Escape that closes the column chooser MUST NOT reach a `keydown` listener the application has on
`document`, and every other Escape MUST reach it, as FILT-36 states for a filter dialog.
- Examples (the test runs every row; the application's listener as in FILT-36):

  | Escape pressed | Chooser | Escapes the listener counts |
  |---|---|---|
  | on the checkbox "Name", the chooser open | closes | 0 |
  | after a mouse press on the checkbox "Date" in the open chooser | closes | 0 |
  | on "Columns", the chooser closed | - | 1 |

- Reason: PRD-B19's Escape rule, for the chooser.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B19, PRD-B10.

**COL-02** The column chooser MUST hold one checkbox per given column, named by its label, in the columns' order,
checked exactly while the column is shown.
- Example: `hidden: ['code']`: the dialog holds the checkboxes "Name" (checked), "Code" (not checked) and "Date"
  (checked), in that order, and no other checkbox.
- Reason: the user sees and changes the choice in one place (PRD-B10).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B10.

**COL-05** A press on a checkbox of the chooser MUST emit `oncolumnstate` once with the whole next column state.
- Examples (the test runs every row; one press, as "emits once" defines it):

  | `columnState` | Press | `oncolumnstate` receives |
  |---|---|---|
  | `{ hidden: [] }` | "Code" | `{ hidden: ['code'] }` |
  | `{ hidden: ['code'] }` | "Code" | `{ hidden: [] }` |
  | `{ hidden: ['code'] }` | "Date" | `{ hidden: ['code', 'date'] }` |

  Keys of `columnState` other than `hidden`, and ids in `hidden` that name no given column, are passed on as given.
- Reason: the application stores the whole state as it is and never merges partial changes (PRD-B2).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B10, PRD-B2.

**COL-06** A press on a checkbox of the chooser MUST change nothing on screen until `columnState` changes.
- Example: `hidden: []`, an `oncolumnstate` that changes nothing; press "Code": Code is still shown and the checkbox
  "Code" is checked again.
- Reason: the application's state is the only source of truth, so the screen never shows a choice not taken
  (PRD-B2).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B10, PRD-B2.

**COL-03** The chooser MUST NOT let the last shown column be hidden.
- Example: `hidden: ['code', 'date']`: the checkbox "Name" is checked and has `aria-disabled="true"`; a press on it
  calls no callback, and it stays checked and focusable.
- Reason: a table with no column has nothing to show the rows by (PRD-B10).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B10.

**COL-04** Hiding or showing a column MUST keep the sort order and the filters, and emit nothing but the chooser's
`oncolumnstate`.
- Example: Code with a text filter; the order `[code asc]` and Code's text "x1" apply; `columnState` changes to
  `{ hidden: ['code'] }`:
  no callback is called; the summary of SORT-08 and the badge of FILT-23 show both.
- Reason: a view change must not cost a query or drop the user's criteria (PRD-B10).
- Layer: component.
- Traces: PRD-B10, PRD-B2.

**SORT-07** The ranks of the shown sorted columns MUST count the hidden sorted columns.
- Example: the order `[code asc, name asc]` with Code hidden: Name shows the rank mark "2", and the description of
  "Name" starts "sorted ascending, priority 2".
- Reason: hiding is a view change, not a sort change; renumbering would misstate the order the server applies
  (PRD-B5).
- Layer: component.
- Traces: PRD-B5, PRD-B10.

**SORT-26** A sort press with Shift MUST keep every hidden column at its place in the order.
- Examples (the test runs every row; Code hidden):

  | Order before | Press | `onsort` receives |
  |---|---|---|
  | `[code asc, name asc]` | Shift and "Name" | `[code asc, name desc]` |
  | `[code asc]` | Shift and "Date" | `[code asc, date asc]` |

- Reason: a hidden column keeps its place (PRD-B4), so the server keeps ordering by it.
- Layer: component.
- Traces: PRD-B4, PRD-B10.

**SORT-27** A sort press without Shift MUST emit the order of SORT-01 also while columns in the order are hidden.
- Example: the order `[code asc]` with Code hidden; press "Name": `onsort([name asc])`.
- Reason: a press without Shift starts a new order for every column alike (SORT-01); the summary of SORT-08 showed the
  hidden sort before the press, so the user saw what the press replaces (PRD-B4).
- Layer: component.
- Traces: PRD-B4, PRD-B10.

**SORT-08** While a column in the order is hidden, the table MUST state the whole order in words, marking each hidden
column, before the region.
- Examples (the test runs every row):

  | Order, hidden | Text before the region |
  |---|---|
  | `[code asc, name desc]`, Code hidden | "Sort: Code (hidden column) ascending, then Name descending" |
  | `[code asc, name desc]`, nothing hidden | no text starting "Sort:" |

- Reason: with the lead hidden no header carries `aria-sort`, so nothing else says how the rows are ordered (PRD-B5).
- Layer: component.
- Traces: PRD-B5, PRD-A2.

**A11Y-35** While the column leading the order is hidden, no header MUST carry `aria-sort`.
- Example: the order `[code asc, name desc]` with Code hidden: neither Name's nor Date's header has `aria-sort`.
- Reason: `aria-sort` on Name would announce Name as the lead of the order, which is false; SORT-08 states the order
  instead (PRD-A2).
- Layer: component.
- Traces: PRD-A2, PRD-B5.

**FILT-23** The badges of hidden columns MUST come after all other badges, each marked "(hidden column)".
- Example: Name and Code with text filters; Name's text "Beta" and Code's text "x1" apply, Code hidden: the badges "Name: contains “Beta”", then "Code
  (hidden column): contains “x1”".
- Reason: a filter on a column the user cannot see still narrows the rows, so it must stay visible and removable
  (PRD-B8, PRD-B10).
- Layer: component.
- Traces: PRD-B8, PRD-B10.

**FILT-50** After the badge of a hidden column is pressed, focus MUST move to the region.
- Example: Code with a text filter, hidden, its text "x1" applies; focus its badge and press Enter; then `filters`
  holds no filter: focus is on the region. The region takes focus by script also while it is not a Tab stop, and
  Tab from it reaches the table's first control.
- Reason: the hidden column has no filter button to return to, and focus must not fall to the page body (WCAG 2.4.3).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B8, PRD-A3.

**FILT-51** "Clear column filters" MUST be shown while a filter applies only on a hidden column.
- Example: Code with a text filter, hidden, its text "x1" applies and no other filter: "Clear column filters" is
  shown.
- Reason: the hidden filter still narrows the rows (PRD-B8).
- Layer: component.
- Traces: PRD-B8, PRD-B10.

**COL-25** For invalid column state the table MUST render the alert of RND-05 with the fixed message the examples
below list.
- Examples (as RND-05, for the column state; the test runs every row and every value or alternative in it):

  | Invalid input | Message key | Alert text (default) |
  |---|---|---|
  | `columnState.hidden` is not a list | `columnStateInvalid` | "The column state is not valid." |
  | `hidden` names every given column | `columnStateInvalid` | "The column state is not valid." |
  | `columnState` is given and is not an object | `columnStateInvalid` | "The column state is not valid." |
  | `columnState.order` is given and is not a list | `columnStateInvalid` | "The column state is not valid." |
  | `columnState.widths` is given and is not an object | `columnStateInvalid` | "The column state is not valid." |

  With several faults at once, the faults of RND-05, SORT-15 and FILT-32 win, in that order, then this table's. An id
  in `hidden` that names no given column, or a column named twice, is no fault: it hides nothing more, and a stored
  preference often outlives a release that removed a column.
- Reason: a column state the table cannot show is a wrong table (PRD-B16).
- Layer: component.
- Traces: PRD-B16, PRD-B10, PRD-B11, PRD-B12.

**COL-23** Every fixed word of the columns MUST come from a prop with an English default.
- Examples (as RND-06, for the column words; the test runs every row in the set-up of its "Shown by" statement):

  | Message | English default | Shown by |
  |---|---|---|
  | `columns` | "Columns", the button and its dialog | COL-24, COL-26 |
  | `hiddenColumn` (a function of the label) | "Code (hidden column)" for "Code" | FILT-23, SORT-08 |
  | `sortSummary` (a function of the order's entries, each `{ label, direction, hidden }`) | "Sort: Code (hidden column) ascending, then Name descending" | SORT-08 |
  | the alert message of COL-25 | its default in COL-25 | COL-25 |

- Reason: consumers translate and reword without forking the component (PRD-I1).
- Layer: real browser (Chromium, Firefox, WebKit), since the dialog's name is among the words.
- Traces: PRD-I1.

### Column order: the chooser's move buttons and their announcement (milestone 5)

These statements add `order` to `columnState`: a list of column ids, the display order (PRD-B11 (a)). The drag grip
of PRD-B11 (b) states its own statements below. The examples are those of section 12.

**COL-09** The columns that are not `sticky` MUST appear in the order of `columnState.order`, after the sticky ones
(section 14), given columns it does not name following in their given order, and the chooser MUST list them in the
same order.
- Examples (the test runs every row; the header cells, the cells of each row and the chooser's checkboxes):

  | `columnState.order` | Order shown |
  |---|---|
  | not given | Name, Code, Date |
  | `['date', 'name', 'code']` | Date, Name, Code |
  | `['code']` | Code, Name, Date |
  | `['gone', 'date']` | Date, Name, Code |

  An id that names no given column, or a column named twice after its first place, is no fault and changes nothing
  (as for `hidden`, COL-25).
- Reason: the order is the application's state (PRD-B11); a stored order outlives a release that adds or removes a
  column.
- Layer: real browser (Chromium, Firefox, WebKit), since the chooser is among the checks.
- Traces: PRD-B11, PRD-B2.

**COL-08** The chooser entry of each column that is not `sticky` (section 14) MUST hold the buttons "Move earlier" and "Move later", each named by its
words and the column's label, and a press MUST emit `oncolumnstate` once with the whole next state.
- Examples (the test runs every row; `order` not given; one press, as "emits once" defines it):

  | Press | `oncolumnstate` receives |
  |---|---|
  | "Move later Name" | `{ hidden: [], order: ['code', 'name', 'date'] }` |
  | "Move earlier Date" | `{ hidden: [], order: ['name', 'date', 'code'] }` |

  `order` in the emitted state lists every given column once, in the order shown, and no other id: with `order`
  `['gone', 'date']`, "Move later Date" emits `order: ['name', 'date', 'code']`. The name of each button is its visible words followed by
  the label, so the visible words stay in the name (WCAG 2.5.3).
- Reason: the keyboard and single-pointer way to reorder (PRD-B11 (a), WCAG 2.5.7); one press is one change.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B11, PRD-B2, PRD-A1.

**COL-10** "Move earlier" of the first column that is not `sticky` and "Move later" of the last MUST be `aria-disabled="true"`, and a press
on either MUST emit nothing and leave focus on it.
- Example: `order` not given: "Move earlier Name" and "Move later Date" have `aria-disabled="true"`; a press on each
  calls no callback, and focus stays on the pressed button.
- Reason: a move that cannot happen does nothing, and a disabled control that dropped focus would lose the user's
  place (as PAGE-05 for the pager).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B11, PRD-A1.

**COL-11** After a move, focus MUST stay on the pressed button of the moved column.
- Example: focus "Move later Name" and press Enter; `columnState` becomes `{ hidden: [], order: ['code', 'name',
  'date'] }`: focus is on "Move later Name", now in the second entry; press Enter again and the next state: Name is
  last, and focus stays on "Move later Name", now `aria-disabled`.
- Reason: the keyboard user moves a column step by step without hunting for the button again (PRD-B2's pending focus
  target).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B11, PRD-A3.

**COL-12** A move MUST be announced once in the status region, with the column's label and its new position among
all given columns, when the first `columnState` after the press shows that move, and at no other time.
- Examples (the test runs every row; the status region of A11Y-14; "added" counts, as in the slow-load announcements
  of section 3, the records that put in the words of the last column):

  | Steps | Status region holds | Added |
  |---|---|---|
  | press "Move later Name"; `columnState` becomes the emitted state | "Name moved to position 2 of 3" | 1 |
  | press "Move later Name"; `columnState` stays as it was | no move words | 0 |
  | press "Move later Name", the state follows; press "Move later Name", the state follows | "Name moved to position 3 of 3", and not "position 2 of 3" | 1 |
  | no press; the application sets `order` to `['code', 'name', 'date']` | no move words | 0 |
  | `status 'loading'`, at 6000 ms press "Move later Name", the state follows | "Still loading" and "Name moved to position 2 of 3", each in its own element | 1 |

  The move words sit in their own element of the status region, beside the words of A11Y-20 and A11Y-26, and replace
  only the move words before them.
- Reason: a screen-reader user hears the result of each move (PRD-A4: "each column move announced"); announcing
  before the state follows, or on a change the user did not make, would describe a move that did not happen.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A4, PRD-B11.

**COL-30** Every fixed word of the column order MUST come from a prop with an English default.
- Examples (as COL-23, for the order words):

  | Message | English default | Shown by |
  |---|---|---|
  | `moveEarlier` | "Move earlier" | COL-08 |
  | `moveLater` | "Move later" | COL-08 |
  | `columnMoved` (a function of `{ label, position, count }`) | "Name moved to position 2 of 3"; "Name moved to position 2 of 1,000" for a count of 1000 | COL-12 |

  The numbers go through `columnMoved`, which receives them. The 1000 case runs once more in a browser context with
  the locale `de-DE`: the test first asserts that `(1000).toLocaleString()` gives "1.000" there, and still expects
  "1,000".
- Reason: consumers translate and reword without forking the component (PRD-I1, PRD-I2).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-I1, PRD-I2, PRD-B11.

### Column order: the drag grip (milestone 5)

These statements state PRD-B11 (b). "Drag" means a press with the mouse on a grip, moves, and a release, driven by
the test runner's mouse in Chromium, Firefox and WebKit; a touch drag is stated in COL-19. The application's
`document` listener of COL-16 is added with no options (the bubble phase), as in FILT-36. The examples are those of
section 12, with each column's grip found as the Conventions say.

**COL-13** The header cell of each column that is not `sticky` MUST hold a grip that is at least 24 by 24 CSS px, not in the Tab order, and hidden
from assistive technology.
- Example: for each of Name, Code and Date: its header cell holds one grip; its box is at least 24 by 24 CSS px; Tab
  from the element before the table through the header row never lands on it; it has `aria-hidden="true"`.
- Reason: a pointer target of 24 by 24 meets WCAG 2.5.8; the chooser's buttons are the keyboard and screen-reader way
  (COL-08), so the grip adds no stop and no name (PRD-B11 (b)).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B11, PRD-A1.

**COL-14** A drag of a column's grip, released over another column that is neither `sticky` nor the box column (its
header cell or any of its cells), MUST emit
`oncolumnstate` once, on the release, with the dragged column in the place of the column it was released over.
- Examples (the test runs every row; `order` not given; no callback is called before the release):

  | Drag | `oncolumnstate` on release |
  |---|---|
  | Name's grip to Date's header cell | `{ hidden: [], order: ['code', 'date', 'name'] }`, once |
  | Date's grip to Name's header cell | `{ hidden: [], order: ['date', 'name', 'code'] }`, once |
  | Name's grip to a body cell of Date | `{ hidden: [], order: ['code', 'date', 'name'] }`, once |
  | Code hidden; Name's grip to Date's header cell | `{ hidden: ['code'], order: ['code', 'date', 'name'] }`, once |
  | Name's grip, released over Name's own header cell | no call |
  | Name's grip, released below the table; then the mouse moves over Date's header cell and clicks there | no `oncolumnstate` call |

  The pointer moves at least 40 CSS px between the press and the release, in steps of 10 px. The order of the other
  columns, hidden ones included, stays as it was. A release outside the table ends the drag: the pointer is captured
  by the grip, so the release is seen wherever it happens.
- Reason: one drop is one change; per-move emits would flood the application (PRD-B11 (b), PRD-B2).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B11, PRD-B2.

**COL-20** The component MUST offer no control that resets the column order, the hidden columns or the widths.
- Example: `onreset` passed, the chooser open: its buttons "Move earlier Name" to "Move later Date" (COL-08) are found,
  and no button whose accessible name contains "reset column" (any case) is in the table or the chooser; a press on
  "Reset table" (FILT-30) calls `onreset` once, as "emits once" defines it, so `oncolumnstate` is not called.
- Reason: the column defaults are the application's; a reset is its intent, not the component's (PRD-B11).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B11.

**COL-15** A press on a header cell anywhere but its grip MUST keep its meaning, and a drag that starts there MUST NOT
reorder.
- Examples (the test runs every row):

  | Steps | Calls |
  |---|---|
  | press "Code" | `onsort([code asc])`, once |
  | press on "Code", move 40 px towards Date, release over Date's header cell | no `oncolumnstate` |

- Reason: a grip keeps sort and reorder apart, so a press on the header has one meaning (PRD-B11 (b)).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B11.

**COL-16** Escape during a drag MUST end it with no emit, and MUST NOT reach a `keydown` listener the application has on
`document`; an Escape with no drag MUST reach it.
- Examples (the test runs every row; the listener counts Escape key events):

  | Steps | `oncolumnstate` | Escapes the listener counts |
  |---|---|---|
  | press Name's grip, move over Date's header cell, press Escape, release there | no call | 0 |
  | press Escape with focus on "Code", no drag | no call | 1 |
  | press Name's grip and release it with no move; focus is on Name's grip; press Escape | no call | 1 |

  A press on a grip leaves focus on that grip, which takes focus by script and is no Tab stop (COL-13), so the key
  goes to the grip during the drag; that WebKit focuses an element from a pointer press handler is INFERRED (no fetched
  source) and is what this statement's WebKit run proves.

- Reason: Escape is the way out of a drag (WCAG 2.5.2, PRD-B11 (b)), and an application that closes its own modal on
  Escape must not close it when the user only cancelled a drag (PRD-B19).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B11, PRD-B19.

**COL-17** A drag whose pointer is cancelled MUST end with no emit.
- Example: press Name's grip, move over Date's header cell, then the pointer is cancelled (the test dispatches
  `pointercancel` on the grip for the pressed pointer's id) and the mouse is released over Date: no `oncolumnstate`
  call.
- Reason: a cancelled pointer is no drop (PRD-B11 (b)).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B11.

**COL-18** A drop MUST be announced as a move of the chooser is (COL-12).
- Example: drag Name's grip to Date's header cell; `columnState` becomes the emitted state: the status region holds
  "Name moved to position 3 of 3", added once.
- Reason: the drop is announced like a button move (PRD-B11 (b), PRD-A4).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A4, PRD-B11.

**COL-19** A drag MUST also work by touch: the grip MUST take touch drags for itself, and a touch drag MUST emit as
COL-14 says.
- Examples (the test runs every row):

  | Engine | Check |
  |---|---|
  | Chromium, Firefox, WebKit | the grip's computed `touch-action` is "none" |
  | Chromium | a trusted touch drag of Name's grip to Date's header cell, through the Chrome DevTools Protocol, emits `{ hidden: [], order: ['code', 'date', 'name'] }` once |

  Stated limit: a trusted touch drag is not tested in Firefox and WebKit, because no test runner drives one there
  (Playwright's touchscreen is "limited to emulating tap gestures", FETCHED 2026-11-19); the pointer path they share
  with the mouse is tested with the mouse (COL-14). The Chromium route through the Chrome DevTools Protocol is
  INFERRED (its documentation page did not load, 2026-11-19); the build verifies it first, and if it cannot drive a
  touch drag, the Chromium row joins the stated limit, which is then reported to the owner.
- Reason: PRD-B11 (b) asks that a drag works with pointer and touch; without `touch-action: none` the browser would
  scroll the page instead.
- Layer: real browser (Chromium, Firefox, WebKit; the drag row Chromium only, for the reason above).
- Traces: PRD-B11.

### Column width: separators and the chooser's buttons (milestone 5)

These statements add `widths` to `columnState`: an object from column id to a width in CSS px (PRD-B12). Columns are
resizable exactly while `columnState.widths` is given (an empty object included; `null` counts as not given) and
`oncolumnstate` is given: the
widths are the application's state, so a table whose application holds none keeps the browser's layout from its
content and shows no separator and no width buttons. While resizable, each column's header cell ends with a focusable
separator, found by role `separator` and its name, whose pointer target is at least 24 by 24 CSS px and lies inside
the header cell at its end edge. The width model, from the practice check of 2026-11-19:

- While resizable, the table has a fixed layout and is exactly as wide as the sum of its shown columns' widths
  (TanStack Table's total, FETCHED), so no column takes spare space; the region scrolls when that sum is wider (A11Y-12).
- A shown column's width is its entry, or 150 CSS px where it has none (TanStack Table's default, FETCHED); an entry
  that is not a finite number counts as none; a width below 50 is drawn at 50 (MUI X's minimum, FETCHED), above 1000
  at 1000 (INFERRED: no fetched grid gives a usable maximum, and End needs one). Such a width is no fault.
- A step is 10 CSS px (INFERRED: no fetched grid states one).

The examples are those of section 12 with `widths` `{ name: 200, code: 120, date: 120 }` unless a row says otherwise.

**COL-21** While columns are resizable, each column's separator MUST have the name "<label> width",
`aria-orientation="vertical"`, the drawn width as `aria-valuenow`, 50 as `aria-valuemin` and 1000 as `aria-valuemax`.
- Examples (the test runs every row; the separator "Name width"):

  | `widths` | `aria-valuenow` |
  |---|---|
  | `{ name: 200, code: 120, date: 120 }` | "200" |
  | `{}` | "150" |
  | `{ code: 120 }` | "150" |
  | `{ name: 30 }` | "50" |
  | `{ name: 'wide', code: 120 }` | "150" |
  | not given, or `null` | no element with role `separator` in the table, and no "Narrower" or "Wider" in the chooser |

  Where it exists it has `aria-orientation="vertical"`, `aria-valuemin="50"` and `aria-valuemax="1000"`; Tab from
  Name's last header control reaches it next; its box is at least 24 by 24 CSS px and lies inside Name's header cell,
  ending at the cell's end edge, Date's included at the table's end.
- Reason: the APG window-splitter pattern; a screen-reader user hears which width they change and its bounds (PRD-B12,
  PRD-A1); a separator that changed nothing the application keeps would be a dead control.
- Layer: real browser (Chromium, Firefox, WebKit), since the Tab order and the box are among the checks.
- Traces: PRD-B12, PRD-A1.

**COL-22** Left, Right, Home and End on a separator MUST emit `oncolumnstate` once with the column's next width, limited
to 50 and 1000, and nothing when the width would not change.
- Examples (the test runs every row; focus on "Name width"; one key each):

  | `widths.name` | Key | `oncolumnstate` receives `widths.name` |
  |---|---|---|
  | 200 | Right | 210 |
  | 200 | Left | 190 |
  | 55 | Left | 50 |
  | 50 | Left | no call |
  | 200 | Home | 50 |
  | 200 | End | 1000 |
  | 1000 | Right | no call |
  | 200 | Up, then Down | no call |
  | `widths` `{}`, so 150 | Right | 160 |
  | 200, the page's `html` element with `dir="rtl"` | Left | 210 |

  The rest of `columnState` is passed on as given. In a right-to-left table the column's end edge is on the left, so
  Left widens it.
- Reason: one key step is one change, never a flood (PRD-B12); arrows move the separator the way they point, and the
  APG pattern uses Left and Right for a vertical separator.
- Layer: component (the right-to-left row: real browser, Chromium, Firefox, WebKit).
- Traces: PRD-B12, PRD-B2, PRD-I3.

**COL-31** A pointer drag of a separator MUST emit `oncolumnstate` once, on the release, with the width at the release,
wherever the pointer is; a press with no move, Escape during the drag, or a cancelled pointer MUST emit nothing.
- Examples (the test runs every row; the mouse presses "Name width" and moves in steps of 10 px; the application's
  `document` listener as in COL-16):

  | Steps | `oncolumnstate` | Escapes the listener counts |
  |---|---|---|
  | move 60 px towards the end, release over Code's header cell | once, `widths.name` 260 | - |
  | move 60 px towards the end, release below the table | once, `widths.name` 260 | - |
  | move 400 px towards the start, release | once, `widths.name` 50 | - |
  | release with no move; focus is on "Name width" | no call | - |
  | move 60 px, press Escape, release | no call | 0 |
  | move 60 px, `pointercancel` on the separator for that pointer, release | no call | - |
  | no drag, focus on "Name width", press Escape | no call | 1 |
  | (all three engines) read the separator's computed `touch-action` | "none" | - |
  | (Chromium) a trusted touch drag of "Name width" 60 px towards the end, through the Chrome DevTools Protocol | once, `widths.name` 260 | - |

  A press on the separator leaves focus on it, so a key during the drag goes to it, and the separator captures the
  pointer. The touch rows follow COL-19: the Chromium route is INFERRED until the build verifies it, and a trusted
  touch drag is not tested in Firefox and WebKit (COL-19's stated limit).
- Reason: per-pixel emits flood the application, a click that focuses the separator for the keys is no resize, and
  Escape is the way out (WCAG 2.5.2; PRD-B12, PRD-B19).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B12, PRD-B19.

**COL-37** During a pointer drag of a separator, the column MUST be drawn at the dragged width, and after the release at
the width `columnState` gives.
- Example: an `oncolumnstate` that changes nothing; press "Name width", move 60 px towards the end: Name is drawn 260 px
  wide; release: Name is drawn 200 px wide; with an `oncolumnstate` that applies the emitted state, release: 260 px.
- Reason: the user sees where the edge goes while dragging; the application's state decides what stays (PRD-B2).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B12, PRD-B2.

**COL-32** Each column's entry in the chooser MUST hold the buttons "Narrower" and "Wider", each named by its words and
the column's label, and a press MUST emit `oncolumnstate` once with the width one step narrower or wider, and nothing,
with the button `aria-disabled="true"` and keeping focus, at the bound it cannot pass.
- Examples (the test runs every row; one press, as "emits once" defines it):

  | `widths.name` | Press | Result |
  |---|---|---|
  | 200 | "Wider Name" | `widths.name` 210 |
  | 200 | "Narrower Name" | `widths.name` 190 |
  | 50 | "Narrower Name" | no call; the button has `aria-disabled="true"` and keeps focus |
  | 1000 | "Wider Name" | no call; the button has `aria-disabled="true"` and keeps focus |

- Reason: a single-pointer way that needs no drag (WCAG 2.5.7: keyboard operation alone does not meet it, FETCHED
  2026-11-19; PRD-B12); a disabled control keeps the user's place (as COL-10).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B12, PRD-A1.

**COL-33** While columns are resizable, each shown column MUST be drawn at its width of the model above, the table as
wide as their sum, with every cell's text wrapping inside its cell.
- Examples (the test runs every row; widths measured on the header cells' border boxes, within 1 px; the cell text of
  Name in row 1 is "Supercalifragilisticexpialidocious", one word):

  | `widths` | Drawn |
  |---|---|
  | `{ name: 200, code: 120, date: 120 }` | 200, 120, 120; the table 440 wide in a 600 px wide region |
  | `{ name: 50 }` | Name 50, Code and Date 150 each; Name's long word wraps onto more lines inside the cell (the text range's box lies within the cell's border box) |
  | `{ name: 30, code: 2000 }` | Name 50, Code 1000, Date 150 |
  | `{ name: 200, code: 200, date: 200 }` in a region whose client width is 600 px | the table 600 wide; the region does not overflow, so it is no Tab stop (A11Y-12) |

  No cell shows an ellipsis, and at 50 px every control of a header cell, its grip and its separator included, keeps a
  target of at least 24 by 24 CSS px inside that cell, none overlapping another (they wrap onto more lines).
- Reason: a fixed layout keeps the widths the user chose; cut text would be lost data for every user (PRD-B12, PRD-A6).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B12, PRD-A6.

**COL-34** The widths of hidden columns MUST be kept: passed on in every emitted state, and used again when the column
is shown.
- Examples (the test runs every row):

  | Steps | Result |
  |---|---|
  | `hidden ['code']`, `widths { code: 300 }`; press "Wider Name" | the emitted state holds `widths.code` 300 |
  | then `hidden []` | Code is drawn 300 px wide |

- Reason: a view change must not lose the user's widths (PRD-B12).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B12.

**COL-35** After a key or a press on the chooser's buttons, the width MUST change nothing on screen until `columnState`
changes.
- Example: an `oncolumnstate` that changes nothing; press Right on "Name width": the separator's `aria-valuenow` stays
  "200" and Name is still 200 px wide; the same after "Wider Name".
- Reason: the application's state is the only source of truth (PRD-B2); the drag's preview is COL-37's.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B12, PRD-B2.

**COL-36** Every fixed word of the column widths MUST come from a prop with an English default.
- Examples (as COL-23, for the width words):

  | Message | English default | Shown by |
  |---|---|---|
  | `columnWidth` (a function of the label) | "Name width" for "Name" | COL-21 |
  | `narrower` | "Narrower" | COL-32 |
  | `wider` | "Wider" | COL-32 |

- Reason: consumers translate and reword without forking the component (PRD-I1).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-I1, PRD-B12.

**THEME-16** On each host page of THEME-10, the elements of the column statements MUST have, for each property listed
for them below, the computed value that the literal table of its test states.
- Example (as THEME-10, for the column controls: its host pages, its order check and its rule for the expected values;
  the table has three sortable columns, `oncolumnstate` passed, and the chooser open):

  | Element | Properties |
  |---|---|
  | the button "Columns", the chooser's checkboxes and buttons | THEME-10's properties of the region, and `appearance` |
  | the chooser's dialog | THEME-10's properties of the region |
  | each grip and each separator | THEME-10's properties of the region |
  | every element above | `font-family`, `font-size` and `line-height` equal those of its parent element |

- Reason: the column controls must look the same whatever the application loaded first (PRD-T11 (a)).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T11.

## 13. Row selection (SEL, milestone 6)

These statements add `selection`, an object with `isSelected(row)` (true or false) and `name(row)` (the accessible
name of that row's box), and the callbacks `onselectrow({ rowId, selected, range })`, with `range` present only on a
range press, and `onselectpage(selected)` (PRD-B13). The application owns the selected set and the range anchor; the
table shows what `isSelected` says. A box is "mixed" when its `indeterminate` property is true and its `checked`
property false. In the examples the rows are r1 `{ id: 'r1', name: 'Beta' }` and r2
`{ id: 'r2', name: 'alpha' }`, in that order, with `name: (r) => 'Select row ' + r.name` and both callbacks passed.

**SEL-01** With `selection`, the table MUST show a first column of boxes whose header box is named "Select all rows on
this page" and whose header cell shows no visible text.
- Example: the first header cell holds one checkbox named "Select all rows on this page", and that cell's visible text
  is empty; each body row's first cell holds one checkbox. Without `selection`: no checkbox in the table.
- Reason: the box column is the first thing reached in each row, and the name says what the header box does (PRD-B13).
- Layer: component.
- Traces: PRD-B13, PRD-A1.

**SEL-06** Each row's box MUST be named by `selection.name(row)`.
- Example: the boxes "Select row Beta" and "Select row alpha", in row order.
- Reason: a screen-reader user must know which row a box belongs to, and only the application knows which column names
  a row (PRD-A1).
- Layer: component.
- Traces: PRD-B13, PRD-A1.

**SEL-02** The header box MUST show the state of the shown rows only, by this table.
- Examples (the test runs every row):

  | Rows on the page | `isSelected` true for | Header box |
  |---|---|---|
  | r1, r2 | none | not checked, not mixed |
  | r1, r2 | r1 | mixed |
  | r1, r2 | r1, r2 | checked |
  | r1, r2 | only r9, which is not on the page | not checked, not mixed |
  | none | none | not checked, not mixed, `aria-disabled="true"` |

- Reason: the header box speaks for this page, so rows selected elsewhere must not make it look full (PRD-B13).
- Layer: component.
- Traces: PRD-B13.

**SEL-03** A press on a row's box MUST emit `onselectrow` once with the row's id and the box's next state.
- Examples (the test runs every row; one press, as "emits once" defines it):

  | `isSelected(r1)` | Press | `onselectrow` receives |
  |---|---|---|
  | false | "Select row Beta" | `{ rowId: 'r1', selected: true }` |
  | true | "Select row Beta" | `{ rowId: 'r1', selected: false }` |
  | false, with `getRowId` giving the number 7 for r1 | "Select row Beta" | `{ rowId: 7, selected: true }` |

- Reason: the application updates its selection from the event; the id is handed back as given (RND-05's numeric ids).
- Layer: component.
- Traces: PRD-B13, PRD-B2.

**SEL-07** A press on the header box MUST emit `onselectpage` once, with false only when every shown row is selected.
- Examples (the test runs every row):

  | Shown rows selected | `onselectpage` receives |
  |---|---|
  | none | true |
  | r1 | true |
  | r1, r2 | false |
  | no rows on the page | no call: the header box is `aria-disabled` (SEL-02) |

- Reason: a mixed page is filled first, which is what a "select all" box is expected to do (PRD-B13).
- Layer: component.
- Traces: PRD-B13, PRD-B2.

**SEL-08** A press on a row outside its box MUST emit nothing.
- Example: a press on the text "Beta" in r1 calls no callback.
- Reason: a press on a row is often meant for a link or for selecting text, not for the selection (PRD-B13).
- Layer: component.
- Traces: PRD-B13.

**SEL-04** A press with Shift on a row's box MUST add `range: true` to its one event.
- Examples (the test runs every row; `isSelected` false for both):

  | Input on "Select row alpha" | Calls |
  |---|---|
  | Shift and click | one: `onselectrow({ rowId: 'r2', selected: true, range: true })` |
  | Shift and Space, with focus on the box | one: `onselectrow({ rowId: 'r2', selected: true, range: true })` |
  | click | one: `onselectrow({ rowId: 'r2', selected: true })` |

- Reason: the range runs from an anchor the application keeps across server answers, which the table does not see, so the
  table emits the pressed row only (PRD-B13).
- Layer: component; the Shift and Space row in a real browser (Chromium, Firefox, WebKit), since an engine makes that
  key's click itself.
- Traces: PRD-B13.

**SEL-05** A box MUST show only what `isSelected` says: after a press it MUST NOT change until `isSelected` does.
- Examples (the test runs every row; one mouse press each):

  | Callbacks | Press | Box after it |
  |---|---|---|
  | change nothing | "Select row Beta" | not checked |
  | change nothing | "Select all rows on this page" | not checked, not mixed |
  | `onselectrow` selects r1 in the application's state | "Select row Beta" | checked |
  | `onselectpage` selects r1 and r2 | "Select all rows on this page" | checked, and both row boxes checked |
  | r1 selected; change nothing | "Select all rows on this page" | mixed |
  | no rows on the page; change nothing | "Select all rows on this page" | not checked, not mixed; still focusable |

- Reason: the application prunes and stores the selection; a box that changed by itself could show a row as selected
  that an export would leave out (PRD-B2), and a box that undid the application's change would hide a selection.
- Layer: real browser (Chromium, Firefox, WebKit): how a native box's own toggle and the component's update meet
  depends on the engine's event and task order, which the simulated DOM does not reproduce.
- Traces: PRD-B13, PRD-B2.

**SEL-09** The box column MUST stay first: it is not in the column chooser, has no grip, and no move or drop places a
column before it.
- Examples (the test runs every row; `oncolumnstate` passed):

  | Steps | Result |
  |---|---|
  | press "Columns" | the chooser holds no checkbox for the box column |
  | drag Date's grip to the box column's header cell | no `oncolumnstate` call |
  | `columnState.order` `['date', 'name', 'code']` | the box column first, then Date, Name, Code |
  | press "Move earlier Date" twice, the state following each | `order` `['date', 'name', 'code']`; the box column still first |

- Reason: the box column is the selection, not data; it stays where every row starts (PRD-B11, PRD-B13).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B11, PRD-B13.

**SEL-12** While columns are resizable (section 12), the box column MUST be drawn 40 CSS px wide with no separator, and
the table's width MUST count it.
- Example: `selection` and `widths` `{ name: 200, code: 120, date: 120 }`: the box column's header cell is 40 px wide
  (within 1 px), it holds no element with role `separator`, and the table is 480 px wide.
- Reason: the box column is no data, so it has a fixed width the user does not change (INFERRED: 40 px leaves room for
  a box of at least 24 by 24 CSS px, the WCAG 2.5.8 minimum, and its focus indicator); the sum keeps COL-33's rule that
  nothing takes spare space (PRD-B12, PRD-B13).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B13, PRD-B12.

**SEL-10** For invalid selection input the table MUST render the alert of RND-05 with the fixed message below.
- Examples (as RND-05, for the selection props; the test runs every row and every alternative in it):

  | Invalid input | Message key | Alert text (default) |
  |---|---|---|
  | `selection` is given and is not an object | `selectionInvalid` | "The row selection is not valid." |
  | `selection.isSelected` or `selection.name` is not a function | `selectionInvalid` | "The row selection is not valid." |
  | `selection` is given and `onselectrow` or `onselectpage` is not | `selectionInvalid` | "The row selection is not valid." |
  | `selection.name` returns an empty text, a value that is not a text, or throws, for r1 | `selectionInvalid` | "The row selection is not valid." |
  | `selection.isSelected` throws for r1 | `selectionInvalid` | "The row selection is not valid." |

  With several faults at once, the faults of RND-05, SORT-15, FILT-32 and COL-25 win, in that order. The alert holds
  no value taken from the rows or a thrown error (as RND-09): with a `selection.name` that throws an error saying
  "token-9", "token-9" is not in the alert.
- Reason: a box with no name or no state misleads, and a box that does nothing is a dead control (PRD-B16, PRD-B3).
- Layer: component.
- Traces: PRD-B16, PRD-B13.

**SEL-11** Every fixed word of the selection MUST come from a prop with an English default.
- Examples (as RND-06, for the selection words):

  | Message | English default | Shown by |
  |---|---|---|
  | `selectPage` | "Select all rows on this page" | SEL-01 |
  | the alert message of SEL-10 | its default in SEL-10 | SEL-10 |

- Reason: consumers translate and reword without forking the component (PRD-I1).
- Layer: component.
- Traces: PRD-I1.

## 14. Sticky header and sticky columns (STK, milestone 6)

These statements add `stickyHeader` (default `false`), `stickyTop` (CSS px, default 0: the height of the application's
fixed bar) and a column's `sticky` (default `false`) (PRD-B14, design D of PRD section 5.1: the document scrolls, the
header sticks to the viewport). Sticky columns come first, in their given order, before every other column whatever
`columnState.order` says, after the box column (selection on) and the details column (child rows on, section 15); the
box column and the details column are sticky whenever a column is, in that order, before the sticky data columns. The
component computes their inline-start offsets from the rendered widths. Without `stickyHeader` the region scrolls
sideways (A11Y-12) and sticky columns stick inside it (STK-13). All statements here are tested in a real browser, in
Chromium, Firefox and WebKit, on a page whose document scrolls, in a 1280 by 800 CSS px viewport unless a row names the
zoom or the 320 view of PRD section 4.3. In the examples the table has 200 rows and the columns Name (sortable), Code
and Date, each Date cell holding a link "Go <row>"; "the bar" is a fixed element of the page `stickyTop` px tall at the
viewport top. A later branch states the paint order and opacity of the stuck parts (PRD-T2), the progress indicator beside the stuck header
(PRD-B22), the offsets after a viewport resize (STK-05), the order emitted while sticky columns are given, the zoom
view's 2.4.11 row, and that no listener on `window`, `document` or a media query outlives the table.

**STK-01** With `stickyHeader`, the header row MUST stay at `stickyTop` below the viewport top while the document
scrolls its body rows under it.
- Examples (the test runs every row; the window scrolled down 3000 CSS px):

  | `stickyTop` | Header row's top edge |
  |---|---|
  | 0 | within 1 px of the viewport top |
  | 48, with the bar | within 1 px of 48 |

  The first body row visible below the header is not row 1. Without `stickyHeader`, the header row scrolls out of
  view with the table.
- Reason: column labels stay readable on long pages, below the application's bar (PRD-B14).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B14.

**STK-04** The header MUST be sticky only while `stickyTop` plus the header row's height is at most 30 % of the
viewport's height; otherwise it scrolls with the table.
- Examples (the test runs every row; `stickyHeader` and the bar; the test first asserts that the header row is between
  29 and 191 CSS px high; the window scrolled down 3000 px after the view is set):

  | View | `stickyTop` | Header row |
  |---|---|---|
  | 1280 by 800 | 48 | sticks at 48 |
  | the zoom view (640 by 400; 30 % is 120) | 100 | scrolled out of view with the table |
  | the 320 view (320 by 256) | 48 | scrolled out of view with the table |
  | 1280 by 800, then the viewport resized to 1280 by 256 | 48 | scrolled out of view, after the resize |
  | 1280 by 256, then resized to 1280 by 800 | 48 | sticks at 48, after the resize |

- Reason: on small or zoomed screens a sticky band would take the page (PRD-B14; Understanding Reflow advises static
  positioning there).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B14, PRD-A11.

**STK-09** With `stickyHeader`, the region MUST NOT be a scroll container, and so MUST NOT be a Tab stop, also when the
table is wider than the viewport.
- Example: `stickyHeader`, 30 columns of 150 px wide text: the region's computed `overflow-x` and `overflow-y` are
  "visible", the document scrolls sideways, and Tab from the element before the table lands on the sort button of
  Name, not on the region.
- Reason: design D, in which the header sticks to the viewport; a region that scrolled would hold the header instead
  (PRD section 5.1, PRD-A2).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B14, PRD-A2.

**STK-10** With `stickyHeader`, in a development build, the component MUST write one console warning naming the nearest
ancestor of the table whose computed `overflow-x` or `overflow-y` is neither `visible` nor `clip`, `html` never and
`body` only while `html`'s computed `overflow-x` and `overflow-y` are not both `visible`; with no such ancestor, or
without `stickyHeader`, it MUST NOT warn.
- Examples (the test runs every row; the table inside `<div id="wrap" class="card">` inside `<main>`; a warning is a
  `console.warn` call; the name is the tag name, then `#` and the `id` if there is one, then `.` and each class):

  | `stickyHeader` | Styles | Warnings, and the text of the one |
  |---|---|---|
  | on | `#wrap { overflow: hidden }` | one: "SvelteDT: the sticky header cannot stick inside div#wrap.card, whose overflow is not visible or clip." |
  | on | `#wrap { overflow: auto }` | one, naming div#wrap.card |
  | on | `#wrap { overflow-x: hidden }` (its `overflow-y` then computes to `auto`) | one, naming div#wrap.card |
  | on | `main { overflow: hidden }` | one, naming main |
  | on | `#wrap` and `main` each `overflow: hidden` | one, naming div#wrap.card (the nearest) |
  | on | `#wrap { overflow: clip }` | none |
  | on | `#wrap { overflow-x: clip }` | none |
  | on | none | none |
  | on | `body { overflow: hidden }`, `html` left `visible` | none: `body`'s overflow applies to the viewport |
  | on | `html, body { overflow-x: hidden }` | one, naming body |
  | off | `#wrap { overflow: hidden }` | none |
  | off, then on | `#wrap { overflow: hidden }` | one, after the change |
  | on, then off, then on | `#wrap { overflow: hidden }` | two: one at mount, one after it turns on again |
  | on, then a sort, the next page and new rows | `#wrap { overflow: hidden }` | one in all |
  | on, then `#wrap` given `overflow: hidden` after the mount | `#wrap { overflow: hidden }` from then on | none |

  The check runs when the table mounts with `stickyHeader` and when `stickyHeader` turns on, and at no other time: an
  ancestor whose style changes later is not seen, because the component adds no observer or listener for it
  (PRD-B19). It is one check with one output, the warning or none. In a production build the warning is absent (CON-14 of
  `spec/package.md`). The warning is for the developer, not a word the table shows: English only, no prop.
- Reason: the application must keep every ancestor's `overflow` at `visible` or `clip` (PRD-D3, design D); a warning
  naming the element finds the cause of a header that does not stick. `html`'s overflow always goes to the viewport,
  and `body`'s does while `html`'s is `visible`; otherwise `body` is a scroll container that holds the header (the
  common `html, body { overflow-x: hidden }`).
- Layer: real browser (Chromium, Firefox, WebKit), on a second build of the site made with the `development` export
  condition added to the bundler's resolve conditions (as CON-14's second row; the site's usual build resolves
  `production`, where `esm-env`'s `DEV` is false), written to its own build folder and served by its own start of the
  site server; every other real-browser statement runs on the usual build. The first row going green on the second
  build shows that `DEV` is true there.
- Traces: PRD-B14, PRD-D3.

**STK-03** Each column with `sticky` MUST stay at its inline-start offset while the document scrolls sideways, the
offset being the sum of the widths of the sticky columns before it.
- Examples (the test runs every row; `stickyHeader`; 30 columns as in STK-09, Name and Code `sticky`; the window
  scrolled right 2000 px; offsets measured from the viewport's left edge, within 1 px):

  | Selection, child rows | Left edge of the box column | of the details column | of Name | of Code |
  |---|---|---|---|---|
  | off, off | - | - | 0 | Name's width |
  | on, off | 0 | - | the box column's width | the box column's and Name's widths |
  | on, on | 0 | the box column's width | the box and details columns' widths | those and Name's width |

- Reason: the identifying columns stay in view beside the values being read; the component computes the offsets, so
  the application gives none (PRD-B14, section 5.1).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B14.

**STK-05** The offsets of sticky columns MUST follow a change of their widths, their visibility or their given order.
- Examples (the test runs every row; as STK-03 without selection; after the change and a new sideways scroll; widths
  measured):

  | Change | Left edge of Code |
  |---|---|
  | `columnState.widths.name` from 200 to 250 (resizable) | 250 |
  | Name hidden | 0 |
  | the `sticky` of Name becomes false | 0, and Name scrolls with the rest |
  | `columns` given with Code before Name, both `sticky` | 0, and Name's left edge is Code's width |
  | the rows change so that a Name cell holds a longer text and Name grows wider (not resizable) | Name's new width |

- Reason: offsets from stale widths would cover or uncover columns (PRD-B14: correct after resize, reorder and hide).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B14.

**STK-06** Under `dir="rtl"`, sticky columns MUST stay at the inline start, the right edge, while the document scrolls
sideways.
- Example: as STK-03 without selection, the page's `html` element with `dir="rtl"`, the window scrolled 2000 px
  towards the inline end: Name's right edge is within 1 px of the viewport's right edge, and Code's right edge is
  Name's width to the left of it.
- Reason: logical properties mirror the layout in right-to-left (PRD-B14, PRD-I3).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B14, PRD-I3.

**STK-07** Sticky columns MUST stay first, in their given order, when columns move: no grip, no move buttons, and no
move or drop places a column before or between them (COL-08 to COL-14 apply to the other columns).
- Examples (the test runs every row; Name and Code `sticky`, `oncolumnstate` passed):

  | Steps | Result |
  |---|---|
  | Name's and Code's header cells | no grip |
  | press "Columns" | the entries of Name and Code hold no "Move earlier" or "Move later"; "Move earlier Date" has `aria-disabled="true"` |
  | drag Date's grip to Name's header cell | no `oncolumnstate` call |
  | `columnState.order` `['date', 'code', 'name']` | Name, Code, Date |

- Reason: moving a sticky column would break the offsets the user reads by (PRD-B11, PRD-B14).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B11, PRD-B14.

**STK-08** While the document scrolls under the sticky header and sticky columns, a control that receives focus MUST
NOT be fully hidden by the bar, the sticky header or a sticky column, unless it lies inside that header or column.
- Examples (the test runs every row; `stickyHeader`, `stickyTop` 48 with the bar, Name and Code `sticky`, 30 columns,
  selection on; Tab forward from the element before the table through every control, then Shift+Tab back from the
  last one; after each key, the focused control's box is not fully inside the bar's, the header row's (while it is
  sticky) or a sticky column's box, except a control inside that header row or column; the links "Go <row>" are the
  body controls that pass under them):

  | View | Direction |
  |---|---|
  | 1280 by 800 (the test first asserts that the header is sticky) | left to right |
  | 1280 by 800 | `dir="rtl"` on the page's `html` element |
  | the 320 view (the test first asserts that the header is not sticky) | left to right |

- Reason: WCAG 2.4.11 (PRD-A1, section 4.3); whether an engine honours the component's scroll margins is proved here
  per engine, and where one does not, the component scrolls the focused control clear itself (PRD section 5.1).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B14, PRD-A1.

**STK-11** For invalid sticky input the table MUST render the alert of RND-05 with the fixed message below.
- Examples (as RND-05; the test runs every value in the row):

  | Invalid input | Message key | Alert text (default) |
  |---|---|---|
  | `stickyTop` is -1, `NaN` or `Infinity` | `stickyTopInvalid` | "The sticky top offset is not a valid number." |

  With several faults at once, the faults of RND-05, SORT-15, FILT-32, COL-25, SEL-10 and CHILD-09 win, in that order.
- Reason: a header stuck at a wrong place hides rows (PRD-B16).
- Layer: component.
- Traces: PRD-B16, PRD-B14.

**STK-13** Without `stickyHeader`, each column with `sticky` MUST stay at its inline-start offset inside the region while
the region scrolls sideways.
- Example: no `stickyHeader`, 30 columns as in STK-09, Name and Code `sticky`; the region scrolled to `scrollLeft` 2000:
  Name's left edge is within 1 px of the region's inner left edge, and Code's is Name's width to the right of it.
- Reason: sticky leading columns serve wide tables in either layout (PRD-B14); without the sticky header the region is
  the scroll container (A11Y-12).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B14.

**STK-15** Every fixed word this section's table shows MUST come from a prop with an English default.
- Examples (as RND-06): the alert message of STK-11 (STK-11). STK-10's console warning is not shown by the table.
- Reason: consumers translate and reword without forking the component (PRD-I1).
- Layer: component.
- Traces: PRD-I1.

## 15. Child rows (CHILD, milestone 6)

These statements add the snippet `detail` (called with a row), `detailName(row)` (the accessible name of that row's
disclosure button), `expanded` (a list of the row ids whose details are open; default empty) and the callback
`onexpand({ rowId, expanded })` (PRD-B27). The application owns which rows are open; the table shows what `expanded`
says. The pattern is a disclosure button in a leading column of its own, as the practice check of 2026-11-19 found in
the accessible examples (Adrian Roselli's expandable rows, FETCHED); DataTables' row-details example uses an unnamed
cell (FETCHED; `docs/departures.md`). In the examples the rows are r1 `{ id: 'r1', name: 'Beta' }` and r2
`{ id: 'r2', name: 'alpha' }`, `detailName: (r) => 'Details for ' + r.name`, a `detail` snippet holding the paragraph
"More about <name>" and a link "Open <name>", and `onexpand` passed. The columns are those of section 12.

**CHILD-01** With `detail`, the table MUST show a leading column whose header cell holds the word `detailsColumn`
("Details") hidden visually, and whose body cells each hold one button named by `detailName(row)`.
- Examples (the test runs every row):

  | Props | Leading columns, in order |
  |---|---|
  | `detail` given | the details column, then Name |
  | `detail` and `selection` given | the box column, the details column, then Name |
  | `detailName` and `onexpand` given, no `detail` | none: three column headers, none named "Details", and no button whose name starts with "Details for" |
  | `detail` given, and a fourth given column labelled "Details" | the details column first; no alert; two column headers named "Details" |

  The header cell of the details column has the accessible text "Details" and no visible text. A given column labelled
  "Details" is no fault: its header is a different cell.
- Reason: a disclosure button the user can reach in every row, named by its row (PRD-B27); a column header names what
  the column holds.
- Layer: component.
- Traces: PRD-B27, PRD-A1.

**CHILD-02** A row's button MUST have `aria-expanded="true"` exactly while its row id is in `expanded`.
- Examples (the test runs every row): `expanded` `['r1']`: "Details for Beta" has "true", "Details for alpha"
  "false"; `expanded` `[]`: both "false"; `expanded` `['r9']` (not on the page): both "false", and no fault.
- Reason: assistive technology says whether the details are open (APG disclosure, FETCHED; PRD-B27).
- Layer: component.
- Traces: PRD-B27.

**CHILD-03** A press on a row's button MUST emit `onexpand` once with the row's id and the next state.
- Examples (the test runs every row; one press, as "emits once" defines it):

  | `expanded` | Press | `onexpand` receives |
  |---|---|---|
  | `[]` | "Details for Beta" | `{ rowId: 'r1', expanded: true }` |
  | `['r1']` | "Details for Beta" | `{ rowId: 'r1', expanded: false }` |

- Reason: one press is one change; the application keeps the open set (PRD-B27, PRD-B2).
- Layer: component.
- Traces: PRD-B27, PRD-B2.

**CHILD-04** A press MUST change nothing on screen until `expanded` changes.
- Example: an `onexpand` that changes nothing; press "Details for Beta": its `aria-expanded` stays "false" and no
  detail row appears.
- Reason: the application's state is the only source of truth (PRD-B2).
- Layer: component.
- Traces: PRD-B27, PRD-B2.

**CHILD-05** Each open row MUST be followed by exactly one detail row: one cell spanning every shown column, filled by
`detail` with that row.
- Examples (the test runs every row; three data columns):

  | `expanded` | Rows of the body, in order |
  |---|---|
  | `['r1']` | r1, a detail row with "More about Beta", r2 |
  | `['r1', 'r2']` | r1, its detail row, r2, its detail row |
  | `[]` | r1, r2 |

  The detail row's one cell has `colspan` equal to the number of shown columns, the box and details columns included:

  | Columns | `colspan` |
  |---|---|
  | Name, Code, Date, details column | 4 |
  | Code hidden | 3 |
  | with `selection` | 5 |

- Reason: the details belong under their row, across the whole width (PRD-B27).
- Layer: component.
- Traces: PRD-B27.

**CHILD-14** An open row's button MUST name its detail row in `aria-controls`, and a closed row's button MUST have no
`aria-controls`.
- Example: `expanded` `['r1']`: "Details for Beta" has `aria-controls` holding the detail row's id; "Details for alpha"
  has none.
- Reason: the APG disclosure's optional reference, and a reference never points at nothing (FETCHED, practice check of
  2026-11-19).
- Layer: component.
- Traces: PRD-B27.

**CHILD-15** The live count MUST count data rows only, not detail rows.
- Example: `expanded` `['r1']`, `status 'ready'`: the live count of A11Y-05 says "2 rows displayed".
- Reason: a detail row is part of its row, not a row of the data (PRD-A4).
- Layer: component.
- Traces: PRD-B27, PRD-A4.

**CHILD-11** Each detail row's id MUST meet ID-01 to ID-03 and be resolved from its row's button by `aria-controls`.
- Examples (the test runs every row):

  | Set-up | Check |
  |---|---|
  | two tables side by side, both with r1 open | their detail-row ids differ, and each `aria-controls` names a row inside its own table |
  | a row whose id is "a b", open | its detail row's id holds no white space, and the button's `aria-controls` resolves to it |
  | a server-rendered table with r1 open, hydrated as in ID-03 | the detail row's id and the reference are the same before and after |

- Reason: a reference that resolves into a neighbour, or one split at a space, reads the wrong thing (PRD-B18).
- Layer: component.
- Traces: PRD-B18, PRD-B27.

**CHILD-06** After `rows` changes to the same row ids in another order, each detail row MUST be rendered by the same
element as before, as RND-15 states for the rows.
- Example: `expanded` `['r1']`; the rows come again as new objects in the order r2, r1: r1's detail row is the same
  element (`===`), now after r1 in the new order. Break that turns it red: the detail rows keyed by index.
- Reason: a row keeps its detail row when rows come in another order (PRD-B27, PRD-B1); state inside the snippet stays
  with its row.
- Layer: component.
- Traces: PRD-B27, PRD-B1.

**CHILD-07** After a press on a row's button, focus MUST stay on that button.
- Example: focus "Details for Beta", press Enter; `expanded` becomes `['r1']`: focus is on "Details for Beta"; press
  Enter again, `expanded` becomes `[]`: still there.
- Reason: the user toggles the details from one place (PRD-A3).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B27, PRD-A3.

**CHILD-13** When `expanded` closes a detail while focus is inside it and its row stays, focus MUST move to that row's
button.
- Examples (the test runs every row):

  | Steps | Focus after |
  |---|---|
  | `expanded` `['r1']`; focus the link "Open Beta"; `expanded` becomes `[]` | "Details for Beta" |

- Reason: focus must never fall to the page body (PRD-A3); the button is where the user opened the details.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B27, PRD-A3.

**CHILD-08** The details column MUST stay in place as the box column does (SEL-09): directly after it, before every
data column.
- Examples (the test runs every row; `oncolumnstate` passed):

  | Steps | Result |
  |---|---|
  | press "Columns" | no checkbox for the details column |
  | its header cell | no grip |
  | `columnState.order` `['date', 'name', 'code']` | the details column, then Date, Name, Code |
  | drag Date's grip to the details column's header cell | no `oncolumnstate` call |
  | press "Move earlier Date" twice, the state following each | `order` `['date', 'name', 'code']`; the details column still directly before Date |

- Reason: the disclosure buttons are where every row starts, like the boxes (PRD-B27, PRD-B11).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B27, PRD-B11.

**CHILD-12** While columns are resizable (section 12), the details column MUST be drawn 40 CSS px wide with no separator,
and the table's width MUST count it, as SEL-12 states for the box column.
- Example: `detail`, `selection` and `widths` `{ name: 200, code: 120, date: 120 }`: the details column's header cell is
  40 px wide (within 1 px), holds no element with role `separator`, and the table is 520 px wide.
- Reason: the column holds one button and is no data (INFERRED: 40 px leaves room for a 24 by 24 target and its focus
  indicator); the sum keeps COL-33's rule (PRD-B12, PRD-B27).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B27, PRD-B12.

**CHILD-16** The Tab order MUST reach, in each row, its box, its details button and its cells' controls, then the
controls of its open detail row, before the next row.
- Example: `selection` given, the Name cells hold a link "Go <name>", `expanded` `['r1']`: Tab from "Select all rows on
  this page" through the header's controls reaches "Select row Beta", "Details for Beta", "Go Beta", "Open Beta",
  "Select row alpha", "Details for alpha", "Go alpha", in that order.
- Reason: reading order and Tab order match (WCAG 2.4.3; PRD-A3).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-B27, PRD-A3.

**CHILD-09** For invalid child-row input the table MUST render the alert of RND-05 with the fixed message below.
- Examples (as RND-05; the test runs every row and every alternative in it):

  | Invalid input | Message key | Alert text (default) |
  |---|---|---|
  | `detail` is given and `detailName` or `onexpand` is not, or `detailName` is not a function | `detailInvalid` | "The row details are not valid." |
  | `expanded` is given and is not a list | `detailInvalid` | "The row details are not valid." |
  | `detailName` returns an empty text, a value that is not a text, or throws, for r1 | `detailInvalid` | "The row details are not valid." |

  With several faults at once, the faults of RND-05, SORT-15, FILT-32, COL-25 and SEL-10 win, in that order. An id in
  `expanded` that is on no row of the page is no fault (rows come and go between pages). The alert holds no value taken
  from the rows or a thrown error (as RND-09).
- Reason: a disclosure button with no name, or one that does nothing, misleads (PRD-B16, PRD-B3).
- Layer: component.
- Traces: PRD-B16, PRD-B27.

**CHILD-10** Every fixed word of the child rows MUST come from a prop with an English default.
- Examples (as RND-06): `detailsColumn` "Details" (CHILD-01); the alert message of CHILD-09 (CHILD-09).
- Reason: consumers translate and reword without forking the component (PRD-I1).
- Layer: component.
- Traces: PRD-I1.

## 16. Accessibility conformance: the skip link, focus, scroll, keys and names (A11Y, milestone 7)

These statements close PRD-A3 and PRD-A9 for every intent of sections 7 to 15, and state 2.1.4 and 2.4.6 of PRD
section 4.3. "Every intent" is the list of the intents' examples below, one row each; a table in these examples has
every feature on: sortable columns, a pager, a text and a categorical filter, the global search, `onreset`, the
chooser with resizable columns, selection and child rows, `oncancel` and `onretry`, and 30 rows: the site's full
page (`spec/site.md` FULL-01 and FULL-02).

**A11Y-36** The "Skip past table" link MUST be the component's first focusable element.
- Example: a `heading` snippet holding the link "All orders" and an `actions` snippet holding "Export": Tab from the
  element before the component lands first on "Skip past table", then on "All orders", then on "Export".
- Reason: a keyboard user meets the way past the table before its other stops (PRD-A9). The Tab sequences of A11Y-10
  and A11Y-12 gain it at their head with this milestone's build (an edit of their tests, travelling with that build).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A9.

**A11Y-48** Activating the skip link MUST move focus to a target at the end of the table that only script can focus.
- Example: Enter on "Skip past table": focus is on an element after the region, inside the component, with
  `tabindex="-1"` and no control in it; the next Tab reaches the first focusable element after the component (a
  `Pagination` the application places after the table included).
- Reason: with selection a 1000-row page has over a thousand Tab stops; the link lets a keyboard user pass the table in
  one step (PRD-A9).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A9, PRD-A3.

**A11Y-46** The skip link MUST be visible exactly while it has focus.
- Examples (the test runs every row): not focused: its box lies outside the viewport or measures at most 1 by 1 CSS px;
  focused: its box lies inside the viewport, at least 24 by 24 CSS px, and its text is drawn (its computed `clip` is
  "auto", its `clip-path` "none", and its `opacity` not 0).
- Reason: a sighted keyboard user sees where focus is; others are not shown a control they do not need (PRD-A9, PRD-A10,
  WCAG 2.4.7).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A9, PRD-A10.

**A11Y-37** After every intent, focus MUST be on the control that acted or elsewhere inside the component, never on the
page body.
- Examples (the test runs every row, by keyboard; `document.activeElement` after the application's state follows):

  | Intent |
  |---|
  | a sort press; a pager press; a page-size choice |
  | Enter in a text filter; a categorical option's toggle; a badge press; "Clear column filters"; "Reset table" |
  | Enter in the search field |
  | a chooser checkbox; "Move later Name"; "Wider Name"; Right on a separator |
  | a row box; the header box; a details button |
  | "Cancel" while loading; "Try again" after a failure |

- Reason: a focus that falls to the body throws the keyboard user back to the start of the page (PRD-A3, WCAG 2.4.3).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A3.

**A11Y-38** The intents in the rows of A11Y-37 after its first MUST NOT scroll the window.
- Examples (the test runs every row of A11Y-37 but its first, which A11Y-17 states, as A11Y-17 does: the window starts
  mid-page, the row count stays the same, the page sets `overflow-anchor: none`, and the scroll position is read
  before the intent and after the new state is painted). Breaks that turn it red: the table calls `focus()` without
  `preventScroll` on a control it moves focus to, or `scrollIntoView` on a row.
- Reason: users keep their place; only the skip link may scroll (PRD-A3).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A3.

**A11Y-43** A printable character key other than Space MUST act only in a focused text field.
- Examples (the test runs every row; the keys "s", "1" and "?" pressed with focus on each):

  | Focus on | Result |
  |---|---|
  | a sort button, a pager button, a row box, a details button, a badge, the region, a separator | no callback, no scroll, no change on screen |
  | "Filter Name text", the search field | the character is typed into the field |
  | (Space instead) a sort button | it acts once, as a press does (SORT-01) |

- Reason: a single-key shortcut fires by accident under speech input (WCAG 2.1.4); the table defines none (PRD section
  4.3).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A1.

**A11Y-44** The accessible names the component gives its own controls MUST be unique within the component.
- Example: the table of this section's set-up, every dialog opened in turn: the names of its buttons, fields,
  checkboxes, separators and links, except those named by the application (`selection.name`, `detailName`, snippets),
  hold no name twice.
- Reason: two controls with one name cannot be told apart in a screen reader's list of controls (WCAG 2.4.6).
- Layer: real browser (Chromium, Firefox, WebKit), since the dialogs are among them.
- Traces: PRD-A1.

**A11Y-47** Every fixed word of this section MUST come from a prop with an English default.
- Examples (as RND-06): `skipTable` "Skip past table" (A11Y-36).
- Reason: consumers translate and reword without forking the component (PRD-I1).
- Layer: component.
- Traces: PRD-I1.

### The views: target size, zoom, reflow, text spacing, forced colours, focus and right-to-left (milestone 7)

These statements run in the views of PRD section 4.3 on the test site's page with the table of section 16's set-up
(every feature on), with no dialog open unless a statement opens one: the default view (1280 by 800 CSS px), the zoom
view (640 by 400 at device scale factor 2, 200 % zoom), the 320 view (320 by 256 at factor 4) and the spacing view (a
same-origin stylesheet setting the WCAG text-spacing values with `!important`; the test first asserts that a body
cell's computed `line-height` and `letter-spacing` equal them). "The clipping check" is the algorithm of PRD section
4.3, in its words: (a) for every text-holding element and control in the component except the scroll region itself,
where computed overflow is not `visible`, `scrollWidth <= clientWidth + 1` and `scrollHeight <= clientHeight + 1`;
(b) for every header and body cell, the bounding box of a text range over its contents lies within the cell's border
box (+-1 px); (c) the bounding boxes of visible controls in the toolbar, header cells, badges and pager intersect by at
most 1 px; (d) at horizontal scroll 0, every element outside the table lies within the viewport width. One reading
of (a) this spec fixes, of the PRD's own exception for what is clipped by design: the caption, the live regions and
the skip link while not focused are visually hidden on purpose, hold no visible text and are left out, and the test
asserts that each of them is hidden as A11Y-46 states for the skip link (outside the viewport or at most 1 by 1 CSS
px). A second reading of (a), for a dialog that scrolls by design, is A11Y-49's. "The dialogs" are the filter
dialog of the text filter's column, the filter dialog of the categorical filter's column and the column chooser. The
views with density "compact" and the variants are section 18's (THEME-22, THEME-42 to THEME-45).

**A11Y-39** Every pointer target of the component MUST be at least 24 by 24 CSS px while it is shown.
- Examples (the test runs every row; every button, link, checkbox, field, separator and grip the component renders
  itself, not the application's snippets; each measured with `getBoundingClientRect` while shown: a dialog's controls
  while it is open, the skip link while focused):

  | View | Smallest width and height |
  |---|---|
  | default | at least 24 by 24 |
  | 320, no dialog open | at least 24 by 24 |

  Spacing between targets is not relied on, which is stricter than PRD-A6 allows.
- Reason: WCAG 2.5.8 (PRD-A6, section 4.3).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A6, PRD-A1.

**A11Y-40** In the zoom view, the clipping check MUST pass.
- Example: the zoom view, then the progress indicator with "Still loading" and "Cancel" shown (`oncancel` passed,
  `status 'loading'` for 6 seconds, fake timers): the clipping check passes in both.
- Reason: WCAG 1.4.4 (PRD-A11).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A11, PRD-A1.

**A11Y-41** In the 320 view, the clipping check MUST pass.
- Example: the 320 view, as A11Y-40: the clipping check passes in both; by its part (d) the toolbar, the badges,
  the pager, "Still loading" and "Cancel" lie within the viewport's width at a horizontal scroll of 0, while the table
  scrolls sideways inside the region.
- Reason: WCAG 1.4.10 exempts the table but not what surrounds it (PRD-A11).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A11, PRD-A1.

**A11Y-42** In the spacing view, the clipping check MUST pass.
- Example: the spacing view, as A11Y-40, after the test has asserted the spacing values on a body cell.
- Reason: WCAG 1.4.12 (PRD-A11).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A11, PRD-A1.

**A11Y-49** With each dialog open in turn, the clipping check MUST pass in the zoom, 320 and spacing views.
- Examples (the test runs every row with each of the dialogs; a dialog is opened by its trigger and left open while
  the check runs):

  | View | Result |
  |---|---|
  | zoom | the clipping check passes, and the open dialog's box lies within the viewport |
  | 320 | the clipping check passes, and the open dialog's box lies within the viewport |
  | spacing | the clipping check passes, and the open dialog's box lies within the viewport |

  "Within the viewport": the dialog's `getBoundingClientRect()` has left and top at least 0 and right and bottom at
  most the viewport's width and height (+-1 px), as FILT-34 states. With a dialog open, part (b) also covers each
  text-holding element of the dialog (its text range within its own border box) and part (c) also covers the
  dialog's visible controls. One reading of (a): an open dialog whose computed `overflow-y` is `auto` or `scroll` is
  left out of (a)'s `scrollHeight` half only (a long chooser scrolls inside a 320 by 256 view by design, its box
  still within the viewport); its `scrollWidth` half, and every element inside it, are checked as usual.
- Reason: the dialogs are part of the component that surrounds the table, which WCAG 1.4.4, 1.4.10 and 1.4.12 do not
  exempt (PRD-A11); a dialog that scrolls vertically is a scroll region, as the region is.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A11, PRD-A1.

**A11Y-45** Every control of the component but the region MUST show a visible focus indicator when it is focused by
keyboard.
- Examples (the test runs every row; the default view; Tab through every control, each dialog opened in turn; each
  control's computed outline, or a box-shadow entry, has a width, spread or blur of at least 1 CSS px with a colour
  whose alpha is above 0, and differs from its unfocused style, as A11Y-07 states for the region):

  | Rows |
  |---|
  | plain rows |
  | the first row selected (`isSelected` true for it only): its box and the controls in its cells |

  Striped and hovered rows are THEME-43's.
- Reason: WCAG 2.4.7 (PRD-A1).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-A1.

**A11Y-11** In forced-colours mode, focus indicators, box states, sort marks, separators, the progress indicator and
the "Cancel" and "Try again" buttons MUST stay visible.
- Examples (the test runs every row; Chromium's forced-colours emulation (`forcedColors: 'active'`), the default
  view; every screenshot is taken with animations disabled and the mouse outside the component; "drawn" means that a
  screenshot of the element's box differs from a screenshot of the same box with the element set to
  `visibility: hidden`; "differ" means that two screenshots of the same box differ; a focus row's box is the
  control's box grown by 8 CSS px on each side, so a ring drawn outside the control is in the shot):

  | Item | Check |
  |---|---|
  | every control A11Y-45 reaches by Tab, the column separators included, but the skip link | focused and unfocused differ |
  | the region, on A11Y-07's 30-column table in a 600 px viewport, once the test has asserted it is a Tab stop | focused and unfocused differ |
  | the skip link | focused, and focused with `outline-style: none` and `box-shadow: none` set through the CSSOM, differ (unfocused it is hidden, A11Y-46) |
  | "Cancel" (`oncancel`, `status 'loading'` for 6 seconds, fake timers) and "Try again" (`onretry`, `status 'stopped'`) | each: focused and unfocused differ |
  | a row box | unchecked, checked and, for the header box, mixed differ pairwise |
  | the mark of a sort with rank "2" | ascending and descending differ |
  | a column separator | drawn |
  | the progress indicator, "Still loading" and "Cancel" (`oncancel`, `status 'loading'` for 6 seconds, fake timers) | each drawn |
  | "Try again" (`onretry`, `status 'stopped'`) | drawn |

- Reason: users of high-contrast modes lose any state shown only by a background, a box-shadow or a custom colour
  (PRD-A8). Stated limits (PRD section 4.3): Firefox's emulation only flips the media query, so its rendered proof is
  the release's contrast-theme step (PRD-A5); WebKit has no rendered proof, a limit PRD-D3 states.
- Layer: real browser (Chromium only, for the reason above).
- Traces: PRD-A8.

**I18N-02** Under `dir="rtl"`, the component's reading order MUST be its document order and its layout MUST mirror.
- Examples (the test runs every row; the default view, the page's `html` element with `dir="rtl"`):

  | Check | Result |
  |---|---|
  | Tab through the controls but the region; for each two in a row whose boxes overlap vertically | the later one's right edge is at or left of the earlier one's |
  | the box column's header cell | its right edge within 1 px of the region's inner right edge (`clientLeft + clientWidth` from the region's left) |
  | the pager | "First page" lies right of "Last page" |
  | the column chooser open: Tab through its controls; for each two in a row whose boxes overlap vertically | the later one's right edge is at or left of the earlier one's ("Move earlier" before "Move later"); at least one such pair exists in each entry, or the row fails |

- Reason: WCAG 1.3.2 in right-to-left, and logical properties mirror the layout (PRD-I3).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-I3, PRD-A1.

**I18N-03** Under `dir="rtl"`, the arrow keys on the focused region MUST scroll it the way they point.
- Example: the 30-column table of A11Y-12 in a 600 px viewport, `dir="rtl"`: Tab to the region; ArrowLeft three times
  reveals the columns at the inline end (the region's `scrollLeft` moves to more negative values); ArrowRight
  scrolls back.
- Reason: arrow keys follow the reading direction (PRD-I3), as A11Y-08 states left to right.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-I3, PRD-A3.

## 17. Class hooks and alignment (THEME, milestone 8)

These statements add a column's `class` and `headerClass` (strings), a column's `align` (`'start'`, the default,
`'center'` or `'end'`), and the functions `rowClass(row)` and `cellClass(row, column)`, each returning a string, or
`undefined` or `null` for no class (PRD-T7, T8, T14; DataTables' `className`, `createdRow` and `createdCell`, FETCHED 2026-11-18 in the PRD; classes
only, DEP-36). A hook adds classes: the component's own classes (THEME-09) stay. "Data cells" are the body cells of
the given columns in data rows. A hook, class or alignment given as
`undefined` or `null` counts as not given. In the examples the rows are r1 `{ id: 'r1', name: 'Beta', code: 'B-2' }` and r2
`{ id: 'r2', name: 'alpha', code: 'A-1' }` and the columns Name and Code.

**THEME-23** A column's `class` MUST appear, as given, on that column's header cell and on each of its data cells.
- Examples (the test runs every row; the class tokens read with `classList`):

  | Code's `class` | Code's header cell and both data cells | Name's cells |
  |---|---|---|
  | `'num wide'` | hold `num` and `wide`, and `sdt-th` or `sdt-cell` | hold neither |
  | `''` | hold no class but `sdt-th` or `sdt-cell` | as before |
  | not given, `undefined` or `null` | as for `''` | as before |

- Reason: DataTables users style columns by class (PRD-T7).
- Layer: component.
- Traces: PRD-T7.

**THEME-27** A column's `headerClass` MUST appear on that column's header cell only, after the tokens of its `class`.
- Example: Code's `class` `'num'` and `headerClass` `'head-num'`: the header cell's `classList` holds `num` before
  `head-num`; Code's data cells hold `num` and not `head-num`.
- Reason: DataTables' `dt-head-*` classes style a header apart from its body (PRD-T14).
- Layer: component.
- Traces: PRD-T14.

**THEME-24** `rowClass(row)` MUST be called for each data row, and its result MUST appear on that row's `tr`.
- Examples (the test runs every row):

  | `rowClass` | r1's `tr` | r2's `tr` |
  |---|---|---|
  | `(r) => r.name === 'Beta' ? 'hot' : ''` | holds `hot` and `sdt-row` | holds `sdt-row` only |
  | `() => 'x  y'` | holds `x`, `y` and `sdt-row` | the same |
  | `(r) => r.name === 'Beta' ? 'hot' : undefined` | holds `hot` and `sdt-row` | holds `sdt-row` only; no alert |
  | `(r) => r.name === 'Beta' ? 'hot' : null` | holds `hot` and `sdt-row` | holds `sdt-row` only; no alert |

  With `detail` and `expanded` `['r1']`, r1's detail row holds no `hot`; with `status 'ready'` and no rows,
  `rowClass` is not called.
- Reason: DataTables' `createdRow` marks rows by their data (PRD-T8).
- Layer: component.
- Traces: PRD-T8.

**THEME-28** `cellClass(row, column)` MUST be called for each data cell, with that cell's row and column, and its
result MUST appear on that cell's `td`, after the column's `class`.
- Example: Code's `class` `'num'`, `cellClass: (r, c) => c.id === 'code' && r.code.startsWith('A') ? 'low' : ''`:
  r2's Code cell holds `num` before `low`, and `sdt-cell`; r1's Code cell holds `num` only besides `sdt-cell`; the
  Name cells hold neither; with `selection` given, the box cells hold no class from `cellClass`, and every call of
  `cellClass` receives one of the 4 pairs (r1 or r2, Name or Code; compared by `r.id` and `c.id`), each pair at least
  once. With `cellClass: (r, c) => c.id === 'code' && r.code.startsWith('A') ? 'low' : undefined` the cells hold
  the same classes, and no alert shows.
- Reason: DataTables' `createdCell` marks cells by their value (PRD-T8).
- Layer: component.
- Traces: PRD-T8.

**THEME-29** The classes from `rowClass` and `cellClass` MUST follow a change of the reactive state the functions read
and the replacement of a row by a new object, and an unchanged row MUST keep its classes.
- Examples (the test runs every row; `hot` a `$state` variable of the test's host starting at `'r1'`; `rows` held in
  `$state.raw`, so "r1 the same object" is the object given before):

  | Hook | Change | r1 | r2 |
  |---|---|---|---|
  | `rowClass: (r) => hot === r.id ? 'hot' : ''` | `hot` becomes `'r2'` | its `tr` loses `hot` | its `tr` gains `hot` |
  | `cellClass: (r, c) => c.id === 'code' && hot === r.id ? 'hot' : ''` | `hot` becomes `'r2'` | its Code cell loses `hot` | its Code cell gains `hot` |
  | `rowClass: (r) => r.name === 'Beta' ? 'hot' : r.name === 'gamma' ? 'new' : ''` | `rows` given again with r1 the same object and r2 a new object `{ id: 'r2', name: 'gamma', code: 'A-1' }` | its `tr` keeps `hot` | its `tr` gains `new` |
  | `cellClass: (r, c) => c.id === 'name' && r.name === 'gamma' ? 'new' : ''` | as the row above | its Name cell holds no `new` | its Name cell gains `new` |

- Reason: a changed row is a new row object, and a hook is called again when reactive state it reads changes
  (PRD-T8).
- Layer: component.
- Traces: PRD-T8, PRD-B1.

**THEME-26** A column's `align` MUST set the inline alignment of its header and data cells.
- Examples (the test runs every row; on the host page "none" of THEME-10; computed `text-align` of the header cell and
  data cells of Code, and of Name, whose `align` is not given):

  | Code's `align` | Code's `text-align` | Name's `text-align` |
  |---|---|---|
  | not given, `undefined` or `null` | `start` | `start` |
  | `'start'` | `start` | `start` |
  | `'center'` | `center` | `start` |
  | `'end'` | `end` | `start` |

- Reason: DataTables' `dt-left`, `dt-center` and `dt-right`; logical values turn with right-to-left (PRD-T14, PRD-I3).
- Layer: real browser (Chromium, Firefox, WebKit), since the computed style comes from the package's stylesheet.
- Traces: PRD-T14.

**THEME-30** A sortable column's sort button, holding its text and its mark, MUST sit at the inline edge its `align`
names.
- Examples (the test runs every row; Code sortable, 300 CSS px wide while resizable (`columnState.widths`
  `{ code: 300 }` and `oncolumnstate` passed); `sort` `[code asc]`, so the mark shows; edges of the sort button's
  border box against "the free span", the part of the header cell's content box on the button's line not covered by
  the boxes of Code's grip (COL-13) and separator, within 1 px; the test first asserts that the button is at least
  100 px narrower than the free span, so the check cannot pass by a full-width button):

  | `align` | Direction | Edge |
  |---|---|---|
  | `'start'` | left to right | left edges equal |
  | `'end'` | left to right | right edges equal |
  | `'center'` | left to right | centres equal |
  | `'start'` | `dir="rtl"` on the page's `html` element | right edges equal |
  | `'end'` | `dir="rtl"` | left edges equal |

- Reason: the mark sits at the same inline edge as the header text (PRD-T14), so a right-aligned number column keeps
  its mark beside its label.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T14, PRD-I3.

**THEME-31** For invalid class or alignment input the table MUST render the alert of RND-05 with the fixed message below.
- Examples (as RND-05; the test runs every row and every value in it):

  | Invalid input | Message key | Alert text (default) |
  |---|---|---|
  | a column's `class` or `headerClass` is given and is not a text (5) | `classInvalid` | "A class setting is not valid." |
  | `rowClass` or `cellClass` is given and is not a function (the text "hot") | `classInvalid` | "A class setting is not valid." |
  | `rowClass` or `cellClass` returns a value that is not a text, `undefined` or `null` (5, `false`), or throws, for r1 | `classInvalid` | "A class setting is not valid." |
  | a column's `align` is given and is not one of `'start'`, `'center'`, `'end'` (`'left'`, 5) | `alignInvalid` | "A column alignment is not valid." |

  With several faults at once, the faults of RND-05, SORT-15, FILT-32, COL-25, SEL-10 and CHILD-09 win, in that order,
  then the rows above in their order. The alert holds no value taken from the rows, the columns or a thrown error (as
  RND-09).
- Reason: a class the application meant to set and the table silently dropped hides a state from the user (PRD-B16).
- Layer: component.
- Traces: PRD-B16, PRD-T7, PRD-T8, PRD-T14.

**THEME-32** Every fixed word of the class hooks MUST come from a prop with an English default.
- Examples (as RND-06): the alert messages of THEME-31 (THEME-31).
- Reason: consumers translate and reword without forking the component (PRD-I1).
- Layer: component.
- Traces: PRD-I1.

## 18. Tokens, contrast and variants (THEME, milestone 8)

These statements add `density` (`'normal'`, the default, or `'compact'`) and the booleans `striped`, `hover`,
`cellBorders` and `orderColumn`, each `false` by default (PRD-T5, T6, T13; DataTables' `compact`, `stripe`, `hover`,
`cell-border` and `order-column`, FETCHED 2026-11-18 in the PRD), the example token set and the token-pair table
(PRD-T4, A12). "The example token set" is the stylesheet of `--sdt-*` values the site ships and the documentation shows,
in a light and a dark set. "The token-pair table" is a table in the documentation, beside the token table of THEME-02,
with one row per pair: each side's role as THEME-33 names it ("body text", "the stripe") and its token, and the ratio
its criterion asks (4.5 for text, 1.4.3; 3 for the rest, 1.4.11). Contrast is WCAG's contrast ratio of the two colours.
"The compact view" is the view of PRD section 4.3 with `density 'compact'` and every variant on, in a desktop context
without touch; "the light view", "the dark view" and "the no-token view" are the site's views with the light set, the
dark set and no `--sdt-*` property defined (PRD-W7, the views of `spec/site.md`); a view's density and variants are
given by its own parameters, so a view may set one prop alone. In the examples the table has 30 rows r1 to r30, sorted
by Name and then Code where a row says so, with the columns Name, Code and Date and selection on: the site's full page
(`spec/site.md` FULL-01 to FULL-06), whose list gives the rows, pages and sticky cell these examples name. A prop given
as `undefined` or `null` counts as not given. Cell borders are not claimed under 1.4.11 (PRD section 4.3). The time and
size budgets of the variants (PRD-T10 with P2, P3) are the performance group's. A later theming branch states when the
hover surface is painted (`hover` off, and devices that cannot hover; PRD-T6), while THEME-41 states only its place in
the paint order and THEME-33 its pairs; that branch also states the browser check of computed colours in each theme view
(PRD-A12) and the no-token view's cell backgrounds (PRD section 4.3).

**THEME-33** The token-pair table MUST hold a row for each of these pairs, in the light and in the dark set.
- Examples (the check reads the token-pair table and compares its pairs, by the role columns, with this list; a missing
  pair is a finding, an extra row is not; no table, or 0 rows, is "could not check"; the test plants a table missing one
  pair as a canary):

  | Foreground | On each of these backgrounds | Ratio |
  |---|---|---|
  | body text | the surface, the stripe, the hover surface, the sorted-column surface of rank 1, 2 and 3 or later | 4.5 |
  | the selected text | the selected surface | 4.5 |
  | header text | the header surface | 4.5 |
  | the focus ring, a row box's border and its checked mark | the surface, the stripe, the hover surface, the selected surface, the sorted-column surface of rank 1, 2 and 3 or later | 3 |
  | a sort mark, a column separator, the focus ring, the header hover outline | the header surface | 3 |
  | the progress indicator, the boundary of "Cancel" and of "Try again" | the surface | 3 |

- Reason: the PRD names these pairs for 1.4.3 and 1.4.11 (section 4.3); a table that drops one leaves a pair no check
  reads (PRD-T4, PRD-A12). Each cell shows one opaque surface (THEME-41), so "selected over stripe" is the selected
  surface's pair.
- Layer: static check.
- Traces: PRD-T4, PRD-A12.

**THEME-41** Each body cell of a data row MUST show exactly one opaque surface: the first that applies of the selected
surface, the hover surface, the sorted-column surface of its rank, the stripe and the surface.
- Examples (the test runs every row in the light view with `striped`, `hover` and `orderColumn` on, sorted by Name; in a
  desktop context without touch; r2 is on a striped place; the test first asserts that the values of the surface, the
  stripe, rank 1, hover, the selected surface, body text and selected text colours differ pairwise; each cell's computed
  background has alpha 1 and equals the named token's value):

  | Cell | Selected | Pointer over its row | Surface shown | Text colour |
  |---|---|---|---|---|
  | r1, Code | no | no | the surface | body text |
  | r2, Code | no | no | the stripe | body text |
  | r2, Code | no | yes | the hover surface | body text |
  | r2, Name | no | no | the sorted-column surface of rank 1 | body text |
  | r2, Name | no | yes | the hover surface | body text |
  | r2, Name | yes | yes | the selected surface | the selected text |
  | r1, Code | yes | no | the selected surface | the selected text |
- Reason: DataTables paints the selected surface over hover, the sorted column and stripes (FETCHED 2026-11-19, the
  DataTables 2.3.2 stylesheet; the PRD's class names are those of 3.1.5), but as translucent tints that add up; one opaque token per cell lets the token pairs
  decide contrast (PRD-A12, DEP-48).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T6, PRD-T13, PRD-A12.

**THEME-17** For each row of the token-pair table, the example token set's colours MUST have at least the row's
contrast, in the light and in the dark set.
- Examples (the check reads the example token set and the token-pair table and compares the ratio unrounded; the
  test runs every row against a canary set holding it):

  | Foreground value | Background value | Ratio asked | Result |
  |---|---|---|---|
  | `#333333` | `#ffffff` | 4.5 | passes (12.63) |
  | `#999999` | `#ffffff` | 4.5 | finding (2.85) |
  | `#777777` | `#ffffff` | 4.5 | finding (4.48) |
  | `#767676` | `#ffffff` | 3 | passes (4.54) |
  | `#aaaaaa` | `#ffffff` | 3 | finding (2.32) |
  | `rgb(0 0 0 / 0.5)` | `#ffffff` | 3 | finding: a colour with alpha below 1 cannot be decided here |
  | a token the set does not define | `#ffffff` | 4.5 | could not check |

- Reason: A1 is claimed with the example tokens (PRD-T4); a unit check over every pair catches a bad value before any
  page renders it (PRD-A12).
- Layer: static check.
- Traces: PRD-T4, PRD-A12.

**THEME-34** The example token set MUST define every name of THEME-02's token table, in the light and in the dark set.
- Example: a token table row `--sdt-stripe` with no `--sdt-stripe` in the dark set is a finding; the check reports
  how many names it read, and 0 is "could not check".
- Reason: a name the set leaves out falls back to the stylesheet's own value, which no pair or size check read
  (PRD-T4).
- Layer: static check.
- Traces: PRD-T4.

**THEME-47** The styling guide `docs/styling.md` MUST hold the token table and the token-pair table, each a Markdown
table under its own heading.
- Example: under "Tokens", the columns Token, Paints and Fallback, one row per `--sdt-*` name (THEME-02); under "Token
  pairs", the columns Foreground role, Foreground token, Background role, Background token and Ratio (THEME-33). A
  missing heading or column is a finding of this check and "could not check" for THEME-02 and THEME-33; the headings
  are level 2 with exactly that text, and the test plants a guide missing "Token pairs" as a canary.
- Reason: the checks read the tables from one known place; PRD-D9 puts the token table in the styling guide.
- Layer: static check.
- Traces: PRD-D9, PRD-T4.

**THEME-19** `density 'compact'` MUST lower the body and header cells' padding and MUST change no other property of
THEME-10's named set.
- Examples (the test runs every row; the light view with `density` as given and no variant on):

  | `density` | Body and header cells' padding (block and inline) | Every other property of THEME-10's set, on every element |
  |---|---|---|
  | `'normal'` | the normal padding | as THEME-10 states |
  | `'compact'` | less than the normal padding on each side, read from its own padding tokens | equal to the `'normal'` row |

  No height is fixed: in both densities, a body cell holding five lines of text makes its row taller than a row of
  one line (this guards against a cell taken out of table layout; a cell `height` acts as a minimum, THEME-37). Its targets keep 24 by 24 CSS px (THEME-22).
- Reason: compact tables show more rows without shrinking targets or fixing heights (PRD-T5).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T5.

**THEME-20** With `striped`, every second data row MUST have the stripe surface on each of its body cells, counted
over data rows only, unless a surface of higher precedence applies (THEME-41).
- Examples (the test runs every row; the light view):

  | Body rows, in order | Cells with the stripe surface |
  |---|---|
  | r1 to r4 | the cells of r2 and r4 |
  | r1, r1's child row, r2, r3 | the cells of r2; the child row's cells keep the surface |
  | the empty message (`rows []`) | none |
  | r1 to r4, `striped` not given | none |
  | page 2 of `pageSize` 3: r4, r5, r6 | the cells of r5 (the count starts on each page) |

  A sticky cell of a striped row shows the stripe: stripe and hover are painted on each body cell (PRD-T6).
- Reason: DataTables' `stripe`; a message row or a child row is not a data row, so it must not shift the pattern
  (PRD-T6, STATE-03); the count starts on each page because the table holds one page. Which surface wins on a striped
  cell is THEME-41's.
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T6.

**THEME-36** With `cellBorders`, every body and header cell MUST have a border of at least 1 CSS px on each side it
shares with another cell.
- Example: the light view, the cells of r1 to r3 in Name, Code and Date and the header cells above them: each edge
  between two of them has a computed border width of at least 1 px and a border colour with alpha above 0; without
  `cellBorders`, the inner edges between columns have none (the column separators of the header are not borders).
- Reason: DataTables' `cell-border` (PRD-T6).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T6.

**THEME-25** With `orderColumn`, the body cells of each sorted column MUST have the sorted-column surface of its rank,
unless a surface of higher precedence applies (THEME-41).
- Examples (the test runs every row; the light view):

  | `sort` | Name's body cells | Code's body cells | Date's body cells |
  |---|---|---|---|
  | Name ascending | rank 1 surface | the surface | the surface |
  | Name, then Code, then Date | rank 1 surface | rank 2 surface | rank 3 or later surface |
  | `[]` | the surface | the surface | the surface |
  | Name ascending, `orderColumn` not given | the surface | the surface | the surface |

  Header cells are not painted. Which surface wins on a sorted cell is THEME-41's.
- Reason: DataTables' `order-column`, by rank because ranks are known (PRD-T13, PRD-B5).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T13.

**THEME-21** Each length token of the package's stylesheet MUST fall back to `0` or a `rem` value, and each font-size
token MUST fall back to `inherit`.
- Examples (the scan runs every row against a canary stylesheet holding it):

  | Declaration | Result |
  |---|---|
  | `padding-block: var(--sdt-cell-padding-block, 0.5rem)` | passes |
  | `padding-block: var(--sdt-cell-padding-block, 8px)` | finding |
  | `font-size: var(--sdt-body-font-size, inherit)` | passes |
  | `font-size: var(--sdt-body-font-size, 0.875rem)` | finding |
  | `vertical-align: var(--sdt-header-align, bottom)` (a keyword token) | passes |
  | `height: var(--sdt-row-min-height, 2.5rem)` on a body cell | passes |
  | `height: var(--sdt-row-min-height)` (no fallback) | finding |
  | `padding-inline: var(--sdt-cell-padding-inline, 0)` | passes |
  | `padding-inline: var(--sdt-cell-padding-inline, 1em)` | finding |
  | `border-radius: var(--sdt-radius, calc(0.25rem + 1px))` | finding |

  A length token is a `--sdt-*` property read in a `padding*`, `height`, `width` or `border*-radius` declaration; a
  fallback of `0` or in `rem` passes; any other unit, a `calc()` or a missing fallback is a finding. The scan reads the
  stylesheet as THEME-01 does; a keyword token (as `vertical-align`) is not read; 0 length or font-size declarations is
  "could not check".
- Reason: `rem` keeps 1.4.4, and font sizes inherit so the table takes the container's size (PRD-T9, PRD-T11).
- Layer: static check.
- Traces: PRD-T9.

**THEME-37** Each size token MUST set its property when the application defines it.
- Examples (the test runs every row; the no-token view, then the row's one token defined on the component's
  container through CSSOM `style.setProperty`, which the strict policy allows; for rows 2 on, the test first asserts
  that the value read without the token differs from the row's value, so a row cannot pass on the fallback; for row 1
  it first asserts that the container's 20px differs from the browser default 16px):

  | Token defined | Read on | Computed value |
  |---|---|---|
  | none, the container's `font-size` 20px | a body cell and a header cell | `font-size` 20px |
  | the body font size, `1.25rem` | a body cell | `font-size` 20px |
  | the header font size, `1.25rem` | a header cell | `font-size` 20px |
  | the cell padding (inline), `1rem` | a body cell and a header cell | `padding-inline-start` 16px |
  | the cell padding (block), `1rem` | a body cell and a header cell | `padding-block-start` 16px |
  | the compact cell padding (inline), `0.25rem`, with `density 'compact'` | a body cell | `padding-inline-start` 4px |
  | the compact cell padding (block), `0.125rem`, with `density 'compact'` | a body cell | `padding-block-start` 2px |
  | the minimum row height, `3rem` | a body cell of one line | border-box height (`getBoundingClientRect`) 48px (the minimum is the cells' `height`: browsers ignore `min-height` on table rows and cells; taller content still grows the row) |
  | the corner radius, `0.5rem` | the region, a button, a filter field | `border-top-left-radius` 8px |
  | the sort-mark size, `1rem` | a sort mark | `width` 16px |
  | the header vertical alignment, `top` | a header cell | `vertical-align` top |
  | the input padding, `0.5rem` | a filter field | `padding-inline-start` 8px |

  The tokens' names are those of THEME-02's table.
- Reason: what grids expose beside colour; the application sizes the table without overriding its rules (PRD-T9).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T9.

**THEME-22** In the compact view, every pointer target of the component MUST be at least 24 by 24 CSS px.
- Example: as A11Y-39, in the compact view with the light, the dark and the no-token sets: every target at least 24
  by 24.
- Reason: compact lowers padding, never a target below WCAG 2.5.8 (PRD-T5, PRD-A6, PRD-T10).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T10, PRD-A6, PRD-T5.

**THEME-42** In the compact view, the clipping check MUST pass in the zoom, 320 and spacing views, with and without
a dialog open.
- Example: as A11Y-40, A11Y-41, A11Y-42 and A11Y-49, in the compact view with the light, the dark and the no-token
  sets: the clipping check passes, and an open dialog's box lies within the viewport.
- Reason: every shipped variant meets A1's claims (PRD-T10, PRD-A11; PRD section 4.3's variant views).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T10, PRD-A11.

**THEME-43** In the compact view, every control but the region MUST show a visible focus indicator, also under the
pointer.
- Example: as A11Y-45, in the compact view with the light, the dark and the no-token sets, with the pointer over a
  striped row, a plain row, a selected row and a sticky cell in turn, and with one row both focused and hovered: each
  control's indicator is visible as A11Y-45 measures it.
- Reason: WCAG 2.4.7 on plain, striped, selected and hovered rows (PRD section 4.3, PRD-T10).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T10, PRD-A1.

**THEME-44** In the compact view, axe MUST find no serious or critical violation in any state of the table.
- Example: as A11Y-06's states, in the compact view with the light, the dark and the no-token sets: 0 serious or
  critical violations.
- Reason: 1.4.3 with the variants' surfaces, which axe decides on the rendered page (PRD section 4.3, PRD-T10).
- Layer: real browser (Chromium, Firefox, WebKit).
- Traces: PRD-T10, PRD-A1.

**THEME-45** In the compact view, the forced-colours checks of A11Y-11 MUST pass.
- Example: A11Y-11's rows, in the compact view with the light set: each passes.
- Reason: stripes, hover and the sorted-column surface may vanish under forced colours; states keep their own marks
  (PRD-A8, PRD-T6).
- Layer: real browser (Chromium only, as A11Y-11).
- Traces: PRD-A8, PRD-T10.

**THEME-46** The package's stylesheet MUST NOT define a `--sdt-*` custom property.
- Examples (the scan reads the stylesheet as THEME-01 does and reports how many declarations it read; with no
  stylesheet or 0 declarations it reports "could not check"; the test runs every row against a canary stylesheet):

  | Declaration | Result |
  |---|---|
  | `.sdt { --sdt-cell-padding-block: 0.25rem }` | finding |
  | `@property --sdt-x { syntax: '*'; inherits: true; initial-value: 1px }` | finding |
  | `.sdt-compact td { padding-block: var(--sdt-compact-cell-padding-block, 0.25rem) }` | passes |

- Reason: the tokens are the application's (PRD-T1); a value the package defined would hide a missing token and break
  the no-token view, where no `--sdt-*` property is defined (PRD section 4.3).
- Layer: static check.
- Traces: PRD-T1.

**THEME-38** For invalid variant input the table MUST render the alert of RND-05 with the fixed message below.
- Examples (as RND-05; the test runs every row and every value in it):

  | Invalid input | Message key | Alert text (default) |
  |---|---|---|
  | `density` is given and is not `'normal'` or `'compact'` (`'dense'`, 5) | `densityInvalid` | "The density is not valid." |
  | `striped`, `hover`, `cellBorders` or `orderColumn` is given and is not `true` or `false` (`'yes'`, 1) | `variantInvalid` | "A table variant setting is not valid." |
  | `density 'dense'` and `striped 'yes'` | `densityInvalid` | "The density is not valid." |
  | a column's `align 'left'` and `density 'dense'` | `alignInvalid` | "A column alignment is not valid." |

  With several faults at once, the faults of RND-05, SORT-15, FILT-32, COL-25, SEL-10, CHILD-09 and THEME-31 win, in
  that order, then the first two rows of this table in their order. `density null` with `striped null` renders no alert,
  the normal density and no stripe (as not given).
- Reason: a variant the application meant to set and the table silently dropped changes what users see (PRD-B16).
- Layer: component.
- Traces: PRD-B16, PRD-T5, PRD-T6, PRD-T13.

**THEME-39** Every fixed word of the variants MUST come from a prop with an English default.
- Examples (as RND-06): the alert messages of THEME-38 (THEME-38).
- Reason: consumers translate and reword without forking the component (PRD-I1).
- Layer: component.
- Traces: PRD-I1.

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
| RND-17 | PRD-B16, PRD-S4 |
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
| STATE-09 | PRD-B22 |
| STATE-10 | PRD-B22 |
| STATE-11 | PRD-B22, PRD-B23 |
| STATE-12 | PRD-B22 |
| STATE-13 | PRD-B22 |
| STATE-14 | PRD-B22 |
| STATE-15 | PRD-B22, PRD-B23 |
| STATE-16 | PRD-B22, PRD-B23 |
| STATE-17 | PRD-B23, PRD-B3 |
| STATE-18 | PRD-B23, PRD-B24, PRD-B2 |
| STATE-19 | PRD-B2, PRD-B23, PRD-B24 |
| STATE-20 | PRD-B24, PRD-B15 |
| STATE-21 | PRD-B15, PRD-B24 |
| STATE-22 | PRD-B24, PRD-B16 |
| STATE-23 | PRD-B24, PRD-B3 |
| STATE-24 | PRD-B24, PRD-B16 |
| STATE-25 | PRD-B24, PRD-A3 |
| STATE-26 | PRD-I1, PRD-B22, PRD-B23, PRD-B24 |
| STATE-27 | PRD-S2 |
| STATE-28 | PRD-B24, PRD-B15 |
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
| A11Y-22 | PRD-A4 |
| A11Y-21 | PRD-B24, PRD-B15 |
| A11Y-23 | PRD-B24, PRD-A3 |
| A11Y-24 | PRD-A3 |
| A11Y-25 | PRD-A1, PRD-B22, PRD-B23, PRD-B24 |
| A11Y-20 | PRD-A4, PRD-B22 |
| A11Y-26 | PRD-A4, PRD-B24 |
| A11Y-27 | PRD-B23, PRD-A3 |
| A11Y-28 | PRD-B23, PRD-A3 |
| A11Y-29 | PRD-B24, PRD-A3 |
| A11Y-30 | PRD-B24, PRD-A3 |
| A11Y-31 | PRD-A3, PRD-B23 |
| A11Y-32 | PRD-B22, PRD-B24 |
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
| FOOT-05 | PRD-B19, PRD-B22 |
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
| THEME-15 | PRD-T2, PRD-A1 |
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
| PAGE-16 | PRD-B9, PRD-S4, PRD-B26 |
| PAGE-19 | PRD-I1, PRD-B26 |
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
| PAGE-37 | PRD-B26, PRD-I1, PRD-I2 |
| PAGE-38 | PRD-B26, PRD-I1, PRD-I2 |
| PAGE-39 | PRD-B26, PRD-A4 |
| PAGE-40 | PRD-B26, PRD-A3 |
| ID-01 | PRD-B18 |
| ID-02 | PRD-B18 |
| ID-03 | PRD-B18, PRD-K4 |
| I18N-01 | PRD-I2, PRD-I1, PRD-B26 |
| FILT-29 | PRD-B6, PRD-B7, PRD-B3 |
| FILT-01 | PRD-B6 |
| FILT-27 | PRD-B6 |
| FILT-28 | PRD-B6 |
| FILT-13 | PRD-B6, PRD-A1 |
| FILT-14 | PRD-B6 |
| FILT-03 | PRD-B6 |
| FILT-15 | PRD-B6, PRD-A1 |
| FILT-16 | PRD-B6 |
| FILT-17 | PRD-B7 |
| FILT-04 | PRD-B7 |
| FILT-37 | PRD-B6, PRD-B2 |
| FILT-05 | PRD-B6 |
| FILT-02 | PRD-B6, PRD-B7, PRD-A1 |
| FILT-34 | PRD-B6, PRD-A1 |
| FILT-11 | PRD-B6, PRD-B7, PRD-A1 |
| FILT-12 | PRD-B6, PRD-B7, PRD-A1, PRD-B29 |
| FILT-52 | PRD-B29, PRD-B7 |
| FILT-53 | PRD-B7 |
| FILT-18 | PRD-B29, PRD-B2, PRD-B7 |
| FILT-06 | PRD-B6, PRD-B7 |
| FILT-19 | PRD-B6, PRD-B7, PRD-B19 |
| FILT-07 | PRD-B6, PRD-B7, PRD-A1 |
| FILT-36 | PRD-B19, PRD-B6, PRD-B7 |
| FILT-20 | PRD-B6, PRD-B7, PRD-A1 |
| FILT-21 | PRD-B6, PRD-B7, PRD-A1 |
| FILT-35 | PRD-B6, PRD-B2 |
| FILT-08 | PRD-B8, PRD-A1 |
| FILT-22 | PRD-B7, PRD-B8 |
| FILT-09 | PRD-B8, PRD-B2 |
| FILT-24 | PRD-B8, PRD-A3 |
| FILT-10 | PRD-B8 |
| FILT-25 | PRD-B8, PRD-B2 |
| FILT-30 | PRD-B8, PRD-B3 |
| FILT-26 | PRD-B8, PRD-B2, PRD-B25 |
| FILT-31 | PRD-B8, PRD-A3 |
| FILT-32 | PRD-B16, PRD-B7, PRD-B6, PRD-B25 |
| FILT-39 | PRD-S4, PRD-B16 |
| FILT-33 | PRD-I1, PRD-B25 |
| FILT-47 | PRD-I1, PRD-I2, PRD-B29, PRD-B7 |
| FILT-40 | PRD-B25 |
| FILT-41 | PRD-B25, PRD-B6 |
| FILT-42 | PRD-B25, PRD-B6 |
| FILT-48 | PRD-B25, PRD-B6, PRD-A1 |
| FILT-43 | PRD-B25, PRD-B6 |
| FILT-44 | PRD-B25, PRD-B6, PRD-B2 |
| FILT-49 | PRD-B25, PRD-B6 |
| FILT-46 | PRD-B8, PRD-B25 |
| COL-01 | PRD-B10, PRD-B2 |
| COL-24 | PRD-B10 |
| COL-29 | PRD-B10, PRD-A3 |
| COL-26 | PRD-B10, PRD-A1 |
| COL-27 | PRD-B10, PRD-A1 |
| COL-28 | PRD-B19, PRD-B10 |
| COL-02 | PRD-B10 |
| COL-05 | PRD-B10, PRD-B2 |
| COL-06 | PRD-B10, PRD-B2 |
| COL-03 | PRD-B10 |
| COL-04 | PRD-B10, PRD-B2 |
| SORT-07 | PRD-B5, PRD-B10 |
| SORT-26 | PRD-B4, PRD-B10 |
| SORT-27 | PRD-B4, PRD-B10 |
| SORT-28 | PRD-B5, PRD-A2 |
| SORT-08 | PRD-B5, PRD-A2 |
| A11Y-35 | PRD-A2, PRD-B5 |
| FILT-23 | PRD-B8, PRD-B10 |
| FILT-50 | PRD-B8, PRD-A3 |
| FILT-51 | PRD-B8, PRD-B10 |
| COL-25 | PRD-B16, PRD-B10, PRD-B11, PRD-B12 |
| COL-23 | PRD-I1 |
| COL-09 | PRD-B11, PRD-B2 |
| COL-08 | PRD-B11, PRD-B2, PRD-A1 |
| COL-10 | PRD-B11, PRD-A1 |
| COL-11 | PRD-B11, PRD-A3 |
| COL-12 | PRD-A4, PRD-B11 |
| COL-30 | PRD-I1, PRD-I2, PRD-B11 |
| COL-13 | PRD-B11, PRD-A1 |
| COL-14 | PRD-B11, PRD-B2 |
| COL-20 | PRD-B11 |
| COL-15 | PRD-B11 |
| COL-16 | PRD-B11, PRD-B19 |
| COL-17 | PRD-B11 |
| COL-18 | PRD-A4, PRD-B11 |
| COL-19 | PRD-B11 |
| COL-21 | PRD-B12, PRD-A1 |
| COL-22 | PRD-B12, PRD-B2, PRD-I3 |
| COL-31 | PRD-B12, PRD-B19 |
| COL-37 | PRD-B12, PRD-B2 |
| COL-32 | PRD-B12, PRD-A1 |
| COL-33 | PRD-B12, PRD-A6 |
| COL-34 | PRD-B12 |
| COL-35 | PRD-B12, PRD-B2 |
| COL-36 | PRD-I1, PRD-B12 |
| THEME-16 | PRD-T11 |
| SEL-01 | PRD-B13, PRD-A1 |
| SEL-06 | PRD-B13, PRD-A1 |
| SEL-02 | PRD-B13 |
| SEL-03 | PRD-B13, PRD-B2 |
| SEL-07 | PRD-B13, PRD-B2 |
| SEL-08 | PRD-B13 |
| SEL-04 | PRD-B13 |
| SEL-05 | PRD-B13, PRD-B2 |
| SEL-09 | PRD-B11, PRD-B13 |
| SEL-12 | PRD-B13, PRD-B12 |
| SEL-10 | PRD-B16, PRD-B13 |
| SEL-11 | PRD-I1 |
| STK-01 | PRD-B14 |
| STK-04 | PRD-B14, PRD-A11 |
| STK-09 | PRD-B14, PRD-A2 |
| STK-10 | PRD-B14, PRD-D3 |
| STK-03 | PRD-B14 |
| STK-05 | PRD-B14 |
| STK-06 | PRD-B14, PRD-I3 |
| STK-07 | PRD-B11, PRD-B14 |
| STK-08 | PRD-B14, PRD-A1 |
| STK-11 | PRD-B16, PRD-B14 |
| STK-13 | PRD-B14 |
| STK-15 | PRD-I1 |
| CHILD-01 | PRD-B27, PRD-A1 |
| CHILD-02 | PRD-B27 |
| CHILD-03 | PRD-B27, PRD-B2 |
| CHILD-04 | PRD-B27, PRD-B2 |
| CHILD-05 | PRD-B27 |
| CHILD-14 | PRD-B27 |
| CHILD-15 | PRD-B27, PRD-A4 |
| CHILD-11 | PRD-B18, PRD-B27 |
| CHILD-06 | PRD-B27, PRD-B1 |
| CHILD-07 | PRD-B27, PRD-A3 |
| CHILD-13 | PRD-B27, PRD-A3 |
| CHILD-08 | PRD-B27, PRD-B11 |
| CHILD-12 | PRD-B27, PRD-B12 |
| CHILD-16 | PRD-B27, PRD-A3 |
| CHILD-09 | PRD-B16, PRD-B27 |
| CHILD-10 | PRD-I1, PRD-B27 |
| A11Y-36 | PRD-A9 |
| A11Y-48 | PRD-A9, PRD-A3 |
| A11Y-39 | PRD-A6, PRD-A1 |
| A11Y-40 | PRD-A11, PRD-A1 |
| A11Y-41 | PRD-A11, PRD-A1 |
| A11Y-42 | PRD-A11, PRD-A1 |
| A11Y-49 | PRD-A11, PRD-A1 |
| A11Y-45 | PRD-A1 |
| A11Y-11 | PRD-A8 |
| I18N-02 | PRD-I3, PRD-A1 |
| I18N-03 | PRD-I3, PRD-A3 |
| THEME-23 | PRD-T7 |
| THEME-27 | PRD-T14 |
| THEME-24 | PRD-T8 |
| THEME-28 | PRD-T8 |
| THEME-29 | PRD-T8, PRD-B1 |
| THEME-26 | PRD-T14 |
| THEME-30 | PRD-T14, PRD-I3 |
| THEME-31 | PRD-B16, PRD-T7, PRD-T8, PRD-T14 |
| THEME-32 | PRD-I1 |
| THEME-33 | PRD-T4, PRD-A12 |
| THEME-17 | PRD-T4, PRD-A12 |
| THEME-34 | PRD-T4 |
| THEME-47 | PRD-D9, PRD-T4 |
| THEME-41 | PRD-T6, PRD-T13, PRD-A12 |
| THEME-19 | PRD-T5 |
| THEME-20 | PRD-T6 |
| THEME-36 | PRD-T6 |
| THEME-25 | PRD-T13 |
| THEME-21 | PRD-T9 |
| THEME-37 | PRD-T9 |
| THEME-22 | PRD-T10, PRD-A6, PRD-T5 |
| THEME-42 | PRD-T10, PRD-A11 |
| THEME-43 | PRD-T10, PRD-A1 |
| THEME-44 | PRD-T10, PRD-A1 |
| THEME-45 | PRD-A8, PRD-T10 |
| THEME-46 | PRD-T1 |
| THEME-48 | PRD-K3 |
| THEME-38 | PRD-B16, PRD-T5, PRD-T6, PRD-T13 |
| THEME-39 | PRD-I1 |
| A11Y-46 | PRD-A9, PRD-A10 |
| A11Y-37 | PRD-A3 |
| A11Y-38 | PRD-A3 |
| A11Y-43 | PRD-A1 |
| A11Y-44 | PRD-A1 |
| A11Y-47 | PRD-I1 |
| FILT-45 | PRD-B25, PRD-A3 |
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
| PRD-B1 | RND-01, STATE-05, SORT-14, RND-15, RND-16, CHILD-06, THEME-29 | in part: the filter group states in its own statement that given filters still leave the rows unfiltered; an empty or duplicate row or column id is refused by RND-05 (PRD-B16) |
| PRD-B2 | STATE-05, SORT-01, SORT-03, SORT-12, PAGE-01, PAGE-12, PAGE-13, PAGE-14, PAGE-21, PAGE-22, STATE-18, STATE-19, FILT-37, FILT-35, FILT-09, FILT-25, FILT-26, FILT-44, FILT-18, COL-01, COL-05, COL-06, COL-04, COL-09, COL-08, COL-14, COL-22, COL-35, COL-37, SEL-03, SEL-07, SEL-05, CHILD-03, CHILD-04 | in part: the filter, column and selection groups add their one-callback and props-only statements and the rest of the internal-state list |
| PRD-B3 | RND-02, RND-08, RND-05, RND-07, RND-11, RND-12, SORT-10, SORT-15, STATE-17, STATE-23, FILT-29, FILT-30 | in full |
| PRD-B4 | SORT-10, SORT-01, SORT-02, SORT-03, SORT-04, SORT-12, SORT-15, SORT-26, SORT-27 | in full |
| PRD-B5 | SORT-09, SORT-13, SORT-05, SORT-06, SORT-07, SORT-08, A11Y-35, SORT-28 | in full |
| PRD-B6 | FILT-01, FILT-27, FILT-28, FILT-13, FILT-14, FILT-03, FILT-15, FILT-16, FILT-05, FILT-29, FILT-37, FILT-02, FILT-34, FILT-11, FILT-12, FILT-06, FILT-19, FILT-07, FILT-20, FILT-21, FILT-35, FILT-36, FILT-32, FILT-41, FILT-42, FILT-43, FILT-44, FILT-48, FILT-49 | in full |
| PRD-B7 | FILT-17, FILT-04, FILT-29, FILT-02, FILT-11, FILT-12, FILT-06, FILT-19, FILT-07, FILT-20, FILT-21, FILT-36, FILT-22, FILT-32, FILT-52, FILT-53, FILT-47, FILT-18 | in full for the columns so far |
| PRD-B10 | COL-01, COL-24, COL-02, COL-05, COL-06, COL-03, COL-04, SORT-07, SORT-26, FILT-23, FILT-51, COL-25, COL-29, COL-26, COL-27, COL-28, SORT-27 | in full |
| PRD-B11 | COL-09, COL-08, COL-10, COL-11, COL-12, COL-30, COL-25, COL-13, COL-14, COL-15, COL-16, COL-17, COL-18, COL-19, COL-20, SEL-09, STK-07, CHILD-08 | in full |
| PRD-B12 | COL-21, COL-22, COL-31, COL-32, COL-33, COL-34, COL-35, COL-36, COL-25, COL-37, SEL-12, CHILD-12 | in full |
| PRD-A6 | COL-33, A11Y-39, THEME-22 | in full |
| PRD-I3 | COL-22, I18N-02, I18N-03, THEME-30, STK-06 | in part: sticky columns at the inline start are the sticky group's |
| PRD-B13 | SEL-01, SEL-06, SEL-02, SEL-03, SEL-07, SEL-08, SEL-04, SEL-05, SEL-09, SEL-10, SEL-12 | in full |
| PRD-B14 | STK-01, STK-04, STK-09, STK-10, STK-03, STK-05, STK-06, STK-07, STK-08, STK-11, STK-13 | in part: the later sticky branch states the rest (section 14's set-up) |
| PRD-D3 | STK-10 | in part: the warning for design D's layout duty; the accessibility statement itself comes with the documentation group |
| PRD-A11 | STK-04, A11Y-40, A11Y-41, A11Y-42, A11Y-49, THEME-42 | in full, by the clipping check of PRD section 4.3, which tests overlap between controls only |
| PRD-B27 | CHILD-01, CHILD-02, CHILD-03, CHILD-04, CHILD-05, CHILD-14, CHILD-15, CHILD-11, CHILD-06, CHILD-07, CHILD-13, CHILD-08, CHILD-12, CHILD-16, CHILD-09, CHILD-10 | in full |
| PRD-B25 | FILT-40, FILT-41, FILT-42, FILT-48, FILT-43, FILT-44, FILT-49, FILT-45, FILT-46, FILT-32, FILT-33, FILT-26 | in full |
| PRD-B29 | FILT-52, FILT-18, FILT-12, FILT-47 | in full |
| PRD-B8 | RND-12, FILT-08, FILT-22, FILT-09, FILT-24, FILT-10, FILT-25, FILT-30, FILT-26, FILT-31, FILT-46, FILT-23, FILT-50, FILT-51 | in full |
| PRD-B9 | PAGE-01 to PAGE-27 except PAGE-19 and PAGE-20 | in full |
| PRD-B26 | PAGE-37, PAGE-38, PAGE-39, PAGE-40, PAGE-16, PAGE-19, I18N-01 | in full |
| PRD-B15 | STATE-01, STATE-02, STATE-03, STATE-04, STATE-06, STATE-07, STATE-08, A11Y-15, RND-13, A11Y-05, STATE-20, STATE-21, A11Y-21, STATE-28 | in full |
| PRD-B16 | RND-05, RND-09, RND-10, RND-13, RND-14, RND-17, STATE-08, EXP-02, SORT-15, SORT-16, STATE-22, STATE-24, FILT-32, FILT-39, COL-25, SEL-10, CHILD-09, THEME-31, THEME-38, STK-11 | in full for the props so far; later groups state the faults of their own props in their own statements |
| PRD-B17 | EXP-02, EXP-01, EXP-03 | in full |
| PRD-B18 | ID-01, ID-02, ID-03, CHILD-11 | in part: each later group that adds an id reference states its instances in its own statement |
| PRD-B19 | FOOT-01, FOOT-02, FOOT-03, FOOT-04, SORT-24, PAGE-31, PAGE-32, PAGE-33, FOOT-05, FILT-19, FILT-36, COL-28, COL-16, COL-31 | in part: the filter dialog adds no listener on `document` or `window` (FILT-19 by the browser's light dismiss) and states the Escape rule (FILT-36); B19's oracle allows "at most one passive outside-press listener" for the open dialog, and the filter dialog adds none; the column chooser states its own |
| PRD-B22 | STATE-09, STATE-10, STATE-11, STATE-12, STATE-13, STATE-14, STATE-15, STATE-16, STATE-26, FOOT-05, A11Y-25, A11Y-20, A11Y-32 | in part: not under the sticky header arrives with the later sticky branch; colours from tokens: THEME-01, which reaches every colour of the stylesheet |
| PRD-B23 | STATE-11, STATE-15, STATE-16, STATE-17, STATE-18, STATE-19, STATE-26, A11Y-25, A11Y-27, A11Y-28, A11Y-31 | in full |
| PRD-B24 | STATE-18, STATE-19, STATE-20, STATE-21, STATE-22, STATE-23, STATE-24, STATE-25, STATE-26, STATE-28, A11Y-21, A11Y-23, A11Y-25, A11Y-26, A11Y-29, A11Y-30, A11Y-32 | in full |
| PRD-A1 | A11Y-06, A11Y-07, A11Y-16, A11Y-18, THEME-03, THEME-06, SORT-09, SORT-13, SORT-18, SORT-19, SORT-20, SORT-21, SORT-22, PAGE-09, PAGE-11, PAGE-04, PAGE-24, PAGE-28, PAGE-29, PAGE-30, PAGE-34, PAGE-35, A11Y-25, THEME-15, FILT-13, FILT-15, FILT-02, FILT-34, FILT-11, FILT-12, FILT-07, FILT-20, FILT-21, FILT-08, FILT-48, COL-26, COL-27, COL-08, COL-10, COL-13, COL-21, COL-32, SEL-01, SEL-06, CHILD-01, A11Y-43, A11Y-44, A11Y-39, A11Y-40, A11Y-41, A11Y-42, A11Y-45, A11Y-49, I18N-02, THEME-43, THEME-44, STK-08 | in part: "with none" (no tokens) is THEME-03, THEME-06, SORT-21, SORT-22, PAGE-34 and PAGE-35; "with the example tokens" is THEME-17 and THEME-33, the browser check a later theming branch's; target size is A11Y-39; the remaining criteria of PRD section 4.3 arrive with the controls they concern |
| PRD-A2 | A11Y-01, A11Y-13, A11Y-09, A11Y-12, A11Y-08, A11Y-02, A11Y-04, A11Y-03, SORT-06, SORT-08, A11Y-35, STK-09, SORT-28 | in full |
| PRD-A3 | A11Y-12, A11Y-08, A11Y-10, FOOT-03, RND-14, SORT-11, PAGE-10, PAGE-05, PAGE-21, PAGE-06, PAGE-23, A11Y-17, A11Y-19, PAGE-33, STATE-25, A11Y-23, A11Y-24, A11Y-27, A11Y-28, A11Y-29, A11Y-30, A11Y-31, FILT-24, FILT-31, FILT-45, FILT-50, COL-29, COL-11, PAGE-40, CHILD-07, CHILD-13, CHILD-16, A11Y-37, A11Y-38, A11Y-48, I18N-03 | in part: focus and no-scroll after the intents of later groups, and the place of the sort buttons and "Reset table" in the Tab order, arrive as the later groups' own statements |
| PRD-A4 | A11Y-05, A11Y-14, A11Y-15, A11Y-22, A11Y-20, A11Y-26, COL-12, COL-18, PAGE-39, CHILD-15 | in full |
| PRD-A8 | A11Y-11, THEME-45 | in part: the contrast-theme step of the release (PRD-A5) is the rendered proof in Firefox; WebKit's limit is stated in PRD-D3 |
| PRD-A10 | A11Y-16, SORT-18, PAGE-28, A11Y-46 | in part: the skip-link and dialog groups state their own controls in their own statements |
| PRD-I1 | RND-06, SORT-17, PAGE-19, I18N-01, STATE-26, FILT-33, FILT-47, COL-23, COL-30, COL-36, PAGE-37, PAGE-38, SEL-11, CHILD-10, A11Y-47, THEME-32, THEME-39, STK-15 | in part: later groups state their own words in their own statements |
| PRD-A9 | A11Y-36, A11Y-46, A11Y-48 | in full |
| PRD-I2 | RND-06, SORT-17, I18N-01, FILT-47, COL-30, PAGE-37, PAGE-38 | in part: later groups state the numbers they show in their own statements |
| PRD-S1 | FOOT-04, THEME-07 | in part: the client-rendered zero-violation half is `spec/site.md`'s (POL-01, POL-02, POL-04); the server-rendered half is `spec/package.md`'s (CON-03 to CON-05), its zero-violation check not yet stated (CON-07 reserved); no `eval`, `new Function` or string timers in the build comes with the built-package scans (PRD-K2) |
| PRD-S2 | RND-03, RND-04, SORT-23, PAGE-20, STATE-27 | in part: later groups state their own props in their own statements |
| PRD-S3 | EXP-03 | in part: no network request, cookie or web storage arrive with the strict-policy group |
| PRD-S4 | RND-09, RND-17, SORT-16, PAGE-16, FILT-39 | in full for the props so far |
| PRD-P2 | PAGE-03 | in part: the large-pages group adds the time budgets |
| PRD-K4 | ID-03 | in part: the release and site specs prove it on the packed package and in three engines |
| PRD-T4 | THEME-33, THEME-17, THEME-34, THEME-47 | in full |
| PRD-D9 | THEME-11, THEME-47 | in part: the overrides (THEME-11) and the place and form of the token table; the rest of the guide comes with the docs |
| PRD-A12 | THEME-33, THEME-17, THEME-41 | in part: the browser check of computed colours in each theme view comes with a later theming branch |
| PRD-T10 | THEME-22, THEME-42, THEME-43, THEME-44, THEME-45 | in part: the P2 and P3 budgets of the variants are the performance group's |
| PRD-T13 | THEME-25, THEME-38, THEME-41 | in part: the no-token view's sorted cells come with a later theming branch |
| PRD-T1 | THEME-01, THEME-02, THEME-46 | in part: the built-package half of each scan runs once the package is built (PRD-K2) |
| PRD-T2 | THEME-03, THEME-06, SORT-21, SORT-22, PAGE-34, PAGE-35, THEME-15 | in part: the later sticky branch states "the header is opaque over rows" |
| PRD-T3 | THEME-04, FOOT-04 | in part: the export path is PKG-05 and the consumer's layered import CON-10, both of `spec/package.md`; the documented import lines arrive with PRD-D1; the built-package half runs once the package is built (PRD-K2) |
| PRD-T15 | THEME-04, THEME-08, FOOT-04 | in part: the built-package half runs once the package is built (PRD-K2); the hook props' own classes are stated with PRD-T7, PRD-T8 and PRD-T14 |
| PRD-T11 | THEME-10, THEME-11, SORT-25, PAGE-36, THEME-16 | in part: the Tailwind 4 host is CON-12 and CON-13 of `spec/package.md`, which land with the consumer project's build step, after the first stylesheet commit; the sort buttons (SORT-25) and the pager (PAGE-36) land with their own milestones; the fields, the sort marks, the dialogs (the chooser, the grips and the separators: THEME-16) and the progress indicator add their own statements as THEME-10 for them; the owner's checkpoint at the end of the walking-skeleton milestone is the plan's |
| PRD-T16 | THEME-12 | in full |
| PRD-T7 | THEME-23, THEME-31 | in full |
| PRD-T8 | THEME-24, THEME-28, THEME-29, THEME-31 | in full |
| PRD-T14 | THEME-27, THEME-26, THEME-30, THEME-31 | in full |
| PRD-K3 | THEME-09, THEME-48 | in part: the public classes on their elements; the documented ARIA state selectors and what counts as breaking are not stated yet |
| PRD-G2 | THEME-07 | in part: rule (b) for `style:` only; the other forms and rules (a), (c) to (e) come with the gate statements |
| PRD-G4 | THEME-13, THEME-14 | in part: a rule that only the consumer project's tests can prove gets its marker statement with the consumer project |

### PRD musts not yet traced

- Accessibility beyond the read-only table: PRD-A5, PRD-A7.
- Large pages, size and memory: PRD-P1, PRD-P3, PRD-P4, PRD-P5.
- Browsers: PRD-E1.
- Packaging: PRD-K1, PRD-K2 (in part in `spec/package.md`).
- Gate: PRD-G1, PRD-G3 (PRD-G2 in part, see above).
- Documentation: PRD-D1, PRD-D2, PRD-D3 and PRD-D9 (in part, see above), PRD-D4, PRD-D5, PRD-D6, PRD-D7, PRD-D8.
- Licence: PRD-L1.
- Supply chain and publishing: PRD-S5, PRD-S7.
- Test site and consumer project: PRD-W1, PRD-W2, PRD-W3, PRD-W4, PRD-W5, PRD-W6, PRD-W7, PRD-W8, PRD-W9, PRD-W10.
