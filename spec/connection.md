# The connection helper: spec

- **Name:** `createConnection`, the connection helper of SvelteDT (`@hniedner/sveltedt/connection`, PKG-06 of
  `spec/package.md`), which connects `DataTable` and `Pagination` to a server that speaks the DataTables
  server-side protocol (PRD-B20).
- **Status:** part 1 of the helper's spec. Later parts add their statements to this file; the trace at the end says
  which requirements the statements so far cover.
- Field names: no
- **Scope:** part 1: the request the helper sends (its keys, its three forms, the query's sort, filters, search,
  offset and limit, `draw`), the return to the first page and "Reset table", the answer it maps and the answers it
  refuses, `onerror`, dropping a superseded answer, `busy` and `loading`, the pager props before the first answer,
  `reload()`, and the empty option of a categorical filter (in CONN-10; the id CONN-11 stays unused). Later parts:
  cancel, the stopped state, `onretry` and
  writing the query (PRD-B23, PRD-B24), which would take this part past its cap of 25 statements; the first page
  loaded on the server, which needs the site's server route; whether a superseded request is aborted (PRD-B20 is
  silent, DataTables' practice not yet checked); and the contract tests against the recorded backends (PRD-W11),
  which need fixtures not yet recorded.

## Conventions

- **Statement form** as in `spec/table.md`: one observable behaviour, an example or example table (the test runs
  every row), the reason, the layer and a `Traces:` line; each test carries its statement's id and a hash.
- **Layer.** Every statement here is tested at the component layer: a probe component, mounted in the simulated DOM,
  calls `createConnection` in its script and renders `DataTable` with the returned `table` props and, once `pager`
  is given, `Pagination` with the returned `pager` props. Its `send` is a fake that records each call and returns a
  promise the test settles. Time is never involved.
- **The options.** `send(request, signal)`, the application's transport: it returns a promise of the answer body,
  parsed, and rejects for every answer that is not a success (an HTTP status outside 2xx included); `columns`, the
  column map, a list whose entry `i` describes the backend's column `i`: `{ data, name, id, searchable, orderable }`,
  `data` a string, `name` a string (default `""`), `id` the table column id the entry serves (optional),
  `searchable` and `orderable` booleans (default `true`). A given `name` is the name the server knows the column by,
  never a free label: a server may resolve a column by `name` when it is not empty and by `data` otherwise, and may
  read `order[i][name]` or ignore it in favour of the index. `form`, `'bracketed'` (default), `'dotted'` or `'json'`;
  `query`, the initial query (required); `onerror(error)`. A later part adds the option of a first page loaded on
  the server (PRD-B20); every statement of this part is without it.
- **The query** is `{ sort, filters, search, offset, limit }` with the shapes of `spec/table.md`: `sort` a list of
  `{ id, direction }`, lead first (default `[]`); `filters` the applied filter of each column id (default `{}`);
  `search` the global search text (default `""`); `offset` (default 0) and `limit` (required) the pager's.
- **What it returns:** `{ table, pager, query, reload }`. `table` holds `rows`, `status`, `busy`, `sort`, `filters`,
  `search`, `onsort`, `onfilter`, `onclearfilter`, `onclearfilters`, `onreset` and `onsearch`; `pager` holds
  `offset`, `limit`, `total`, `unfilteredTotal`, `onpage` and `onsize`, or is `undefined` (CONN-25); `query` reads
  the current query. A column id is "served" when a map entry's `id` is that id; the first such entry serves it.
  The "decimal text" of a number is its digits only, without sign, space, point or exponent (`'57'`, `'057'`).
- **Examples.** The map M is `[{ data: 'name', name: 'n', id: 'name' }, { data: 'code', name: 'c', id: 'code' },
  { data: 'status', name: 's', id: 'status' }]`, its `data` and `name` both names the server knows; the initial query
  Q0 is sort `[name asc]`, no filter, search `""`, offset 0, limit 10. Status has a categorical filter (`spec/table.md`
  section 11). A request is written as its key-value pairs in the bracketed form, `draw=1`; a missing value is `""`.
  An answer is the body `send` resolves with; A1 is `{ draw: 1, recordsTotal: 1000, recordsFiltered: 57, data: D }`, D
  a list of 10 rows. Unless a row says otherwise, the form is bracketed, the map M and the query Q0.

## 1. The request (CONN)

**CONN-01** On mount, with no first page given and every column id of the initial query's sort and filters served,
the helper MUST call `send` exactly once, with the request of the initial query and an `AbortSignal` that is not
aborted.
- Example: Q0, `send` not settled: one call; its request holds `draw=1`, `start=0`, `length=10`, `order[0][column]=0`
  and `order[0][dir]=asc`; its signal is an `AbortSignal`, `aborted` false. No further call while nothing changes.
- Reason: the table needs its first page, and the application's transport needs the signal to abort the request
  (PRD-B20).
- Layer: component.
- Traces: PRD-B20.

**CONN-02** The request MUST hold exactly these keys, each once: `draw`, `start`, `length`, `search[value]`,
`search[regex]`; for every entry `i` of the map, in index order, `columns[i][data]`, `columns[i][name]`,
`columns[i][searchable]`, `columns[i][orderable]`, `columns[i][search][value]` and `columns[i][search][regex]`; for
every sort entry `i`, `order[i][column]`, `order[i][dir]` and `order[i][name]`.
- Examples (the test compares the set of pairs; their order is not stated):

  | Map, query | Request |
  |---|---|
  | M, Q0 | `draw=1`, `start=0`, `length=10`, `search[value]=`, `search[regex]=false`; `columns[0][data]=name`, `columns[0][name]=n`, `columns[0][searchable]=true`, `columns[0][orderable]=true`, `columns[0][search][value]=`, `columns[0][search][regex]=false`; the same six for 1 (`code`, `c`) and 2 (`status`, `s`); `order[0][column]=0`, `order[0][dir]=asc`, `order[0][name]=n`: 26 pairs |
  | M plus a fourth entry `{ data: 'internal' }` (no `name`, no `id`), Q0 | the 26 pairs and the six for 3, with `columns[3][data]=internal` and `columns[3][name]=` |

  No other key: no `_` cache-buster, no key from the table's column order or hiding, which the helper never reads.
- Reason: these are the parameters the DataTables manual lists as sent (FETCHED 2026-11-20,
  datatables.net/manual/server-side); a backend reads columns by index, so every entry is sent, in map order, whatever
  the table shows (PRD-B20).
- Layer: component.
- Traces: PRD-B20.

**CONN-03** `columns[i][searchable]` and `columns[i][orderable]` MUST be the map entry's `searchable` and
`orderable`, `true` when not given.
- Examples (the test runs every row; entry 1 of M changed):

  | Entry 1 | `columns[1][searchable]` | `columns[1][orderable]` |
  |---|---|---|
  | as in M | `true` | `true` |
  | `orderable: false` | `true` | `false` |
  | `searchable: false, orderable: false` | `false` | `false` |

- Reason: a backend skips a column marked not searchable or not orderable, and DataTables' defaults are `true`
  (FETCHED 2026-11-18, columns.searchable); the `ssp.class.php` helper compares both with `'true'` (FETCHED
  2026-11-20, its source).
- Layer: component.
- Traces: PRD-B20.

**CONN-04** With `form` not given or `'bracketed'`, `send` MUST receive a `URLSearchParams` whose keys are the
bracketed ones and whose booleans are `true` and `false` and numbers their decimal text.
- Examples (the test runs every row): `form` not given, and `form: 'bracketed'`: the request is a `URLSearchParams`;
  `get('columns[0][search][value]')` is `""`, `get('columns[0][searchable]')` is `"true"`, `get('start')` is `"0"`.
- Reason: the bracketed form is what a DataTables client sends by default; most backends read it (PRD-B20).
- Layer: component.
- Traces: PRD-B20.

**CONN-05** With `form: 'dotted'`, `send` MUST receive a `URLSearchParams` with the values of the bracketed form under
keys that keep the list indexes in brackets and join object keys with a dot.
- Examples (the test runs every row):

  | Bracketed key | Dotted key |
  |---|---|
  | `columns[0][data]` | `columns[0].data` |
  | `columns[0][search][value]` | `columns[0].search.value` |
  | `order[0][column]` | `order[0].column` |
  | `search[value]` | `search.value` |
  | `draw` | `draw` |

  No bracketed key with an object key in brackets remains.
- Reason: Spring MVC cannot bind the bracketed form; spring-data-jpa-datatables reads this one ("changing
  `column[0][data]` into `column[0].data`", its README and `jquery.spring-friendly.js`, FETCHED 2026-11-20).
- Layer: component.
- Traces: PRD-B20.

**CONN-06** With `form: 'json'`, `send` MUST receive the plain object a DataTables 2.x client builds, without its
`fixed` lists, its numbers and booleans as such.
- Example: M, Q0: the request deep-equals `{ draw: 1, start: 0, length: 10, search: { value: '', regex: false },
  columns: [{ data: 'name', name: 'n', searchable: true, orderable: true, search: { value: '', regex: false } },
  { data: 'code', name: 'c', searchable: true, orderable: true, search: { value: '', regex: false } },
  { data: 'status', name: 's', searchable: true, orderable: true, search: { value: '', regex: false } }],
  order: [{ column: 0, dir: 'asc', name: 'n' }] }`. It is an object, not a string: the
  application stringifies it and sets its own content type.
- Reason: a backend that binds a JSON body (spring-data-jpa-datatables' `@RequestBody DataTablesInput`, FETCHED
  2026-11-20) expects what the client's `JSON.stringify(d)` gives (PRD-B20). The client's `search.fixed` and
  `columns[i].search.fixed` lists (READ, DataTables 2.1.8 source) carry its own fixed searches, which the helper has
  none of.
- Layer: component.
- Traces: PRD-B20.

**CONN-07** `start` MUST be the query's offset and `length` its limit.
- Examples (the test runs every row): offset 0, limit 10: `start=0`, `length=10`; offset 20, limit 25: `start=20`,
  `length=25`; the same with `form: 'json'`: `start: 20`, `length: 25`, numbers; from offset 20, limit 10, answered,
  `pager.onpage(30)`: one request, `start=30`, `length=10`, and `pager.offset` 30 before it is settled.
- Reason: the pager is offset-based, as the protocol is (PRD-B9, PRD-B20).
- Layer: component.
- Traces: PRD-B20, PRD-B9.

**CONN-08** Each sort entry, lead first, MUST give `order[i]` with the map index of the entry serving its column id,
its direction as `asc` or `desc` and that entry's `name`; an empty sort MUST give no order entry.
- Examples (the test runs every row):

  | Map, sort | Order sent |
  |---|---|
  | M, `[name asc]` | `order[0][column]=0`, `order[0][dir]=asc`, `order[0][name]=n` |
  | M, `[code desc, name asc]` | `order[0][column]=1`, `order[0][dir]=desc`, `order[0][name]=c`, `order[1][column]=0`, `order[1][dir]=asc`, `order[1][name]=n` |
  | M reversed (Status 0, Code 1, Name 2), `[name asc]` | `order[0][column]=2`, `order[0][dir]=asc`, `order[0][name]=n` |
  | M, `[]` | no key starting with `order`; with `form: 'dotted'` the same; with `form: 'json'`, `order: []` |

- Reason: the backend reads the column by its index and, from a 2.x client, also by name; the lead goes first
  (PRD-B4, PRD-B20).
- Layer: component.
- Traces: PRD-B20, PRD-B4.

**CONN-09** A column's text filter MUST send its text as given in `columns[i][search][value]` with
`columns[i][search][regex]=false`; a column without a filter MUST send `""` and `false`.
- Examples (the test runs every row; Name's filter):

  | `filters.name` | `columns[0][search][value]` | `columns[0][search][regex]` |
  |---|---|---|
  | `{ kind: 'text', text: 'Beta ' }` | `Beta ` (the space kept) | `false` |
  | `{ kind: 'text', text: 'a.b' }` | `a.b` | `false` |
  | `{ kind: 'text', text: '' }` | `""` | `false` |
  | none | `""` | `false` |

- Reason: what a text filter matches is the server's (PRD-D6); the helper passes the text on unchanged (PRD-B6).
- Layer: component.
- Traces: PRD-B20, PRD-B6.

**CONN-10** A categorical filter with selected values MUST send `^(v1|v2|…)$`, the values in the order of
`selected`, each with `/ . * + ? | ( ) [ ] { } \ $ ^ -` escaped by a backslash, and `regex=true`; with none
selected, `""` and `false`.
- Examples (the test runs every row; Status's filter):

  | `selected` | `columns[2][search][value]` | `columns[2][search][regex]` |
  |---|---|---|
  | `['active']` | `^(active)$` | `true` |
  | `['inactive', 'active']` | `^(inactive\|active)$` | `true` |
  | `['a.b', 'x-(1)', 'a/b']` | `^(a\.b\|x\-\(1\)\|a\/b)$` | `true` |
  | one value of the ten characters `*+?[]{}\$^` (in JavaScript `'*+?[]{}\\$^'`) | `^(\*\+\?\[\]\{\}\\\$\^)$` | `true` |
  | `[]` | `""` | `false` |
  | `['']`, the empty option of FILT-53 in `spec/table.md` | `^()$` | `true` |
  | `['active', '']` | `^(active\|)$` | `true` |
  | `['', 'active']` | `^(\|active)$` | `true` |

  `['']` is a selection, unlike `[]`: its empty value is sent as an empty alternative. A `\|` in a cell is the
  character `|`. A value holding the character itself: `['a|b']` sends `^(a\|b)$`
  (backslash, then pipe), `true`.

- Reason: the protocol has one search value per column, so "one of these values" is an anchored alternation that a
  backend honouring `regex` matches exactly (PRD-B7); one value keeps the group form, so the server sees one shape.
  The `ssp.class.php` helper of DataTables' examples reads no `regex` and runs every column search as
  `LIKE '%value%'` (FETCHED 2026-11-20, its source, master): there a categorical filter matches no row, and the
  server guide (PRD-D6) says so. The escaped characters are those of DataTables' own `escapeRegex` (FETCHED
  2026-11-20, DataTables 2.3.2); a JavaScript backend compiling the value with the `u` or `v` flag rejects `\-`
  (MEASURED 2026-11-20, Node 26), which the server guide also says. The empty alternative adds the empty value, and no
  other, to what the group matches, so "no value" needs no word a server must know; that `^()$` with `regex=true`
  finds exactly the rows without a value is the backend reviewer's claim (2026-11-20), not measured here, and whether
  a server counts a null as empty is the server's (PRD-D6).
- Layer: component.
- Traces: PRD-B20, PRD-B7.

**CONN-12** The global search MUST send its text as given in `search[value]`, with `search[regex]=false`.
- Examples (the test runs every row): search `beta`: `search[value]=beta`; search `a.b`: `search[value]=a.b`; search
  `""`: `search[value]=`; in every row `search[regex]=false`.
- Reason: the search box emits plain text; what matches is the server's (PRD-B25).
- Layer: component.
- Traces: PRD-B20, PRD-B25.

**CONN-13** A sort, filter or search intent MUST set the query at once, with offset 0, and send one request for it.
- Examples (the test runs every row; from offset 20, limit 10, the first answer settled unless a row says otherwise;
  one intent each; the props are read before the request is settled):

  | Intent | The one request | `table`, `pager` |
  |---|---|---|
  | `table.onsort([code desc])` | `start=0`, `order[0][column]=1`, `order[0][dir]=desc` | `sort` `[code desc]`, `offset` 0 |
  | `table.onfilter({ id: 'name', state: { kind: 'text', text: 'beta' } })` | `start=0`, `columns[0][search][value]=beta` | `filters.name` as given |
  | `table.onclearfilter({ id: 'name' })`, Name filtered by "beta" | `start=0`, `columns[0][search][value]=` | no `filters.name` |
  | `table.onclearfilters()`, Name filtered, search `x` | `start=0`, every column search `""`, `search[value]=x` | `filters` `{}`, `search` `x` |
  | `table.onsearch('beta')` | `start=0`, `search[value]=beta` | `search` `beta` |
  | `table.onsearch('beta')` before the first answer (from Q0, request 1 running) | `start=0`, `search[value]=beta` | `search` `beta`; `pager` still `undefined` |

- Reason: after the rows change, the old page may not exist; DataTables' default draw goes back to the first page
  ("The paging will be reset back to the first page", FETCHED 2026-11-20, datatables.net/reference/api/draw()). The
  marks and boxes follow the intent before the answer, so the user sees what was asked.
- Layer: component.
- Traces: PRD-B20, PRD-B4, PRD-B8, PRD-B25.

**CONN-27** A page-size intent MUST set the query at once, with the offset of the page of the new size that holds
the first row shown, and send one request for it.
- Examples (the test runs every row; the first answer settled; the props are read before the request is settled):

  | From | Intent | The one request | `pager` |
  |---|---|---|---|
  | offset 20, limit 10 | `pager.onsize(25)` | `start=0`, `length=25` | `offset` 0, `limit` 25 |
  | offset 60, limit 10 | `pager.onsize(25)` | `start=50`, `length=25` | `offset` 50, `limit` 25 |
  | offset 50, limit 25 | `pager.onsize(10)` | `start=50`, `length=10` | `offset` 50, `limit` 10 |

- Reason: DataTables keeps the first row shown on screen when the page size changes ("Keep the start record on the
  current page", `start -= start % len`, READ 2026-11-20, DataTables 2.1.8 source), so the offset stays a whole
  number of pages of the new size (PRD-B20).
- Layer: component.
- Traces: PRD-B20, PRD-B9.

**CONN-14** `table.onreset()` MUST send one request with the initial order, no column filter, an empty search, offset
0 and the current page size.
- Examples (the test runs every row; the first answer settled, then sort `[code desc]`, Name filtered by "beta", search
  `x`, limit 25, offset 50, each answered):

  | Initial sort | The one request | `table`, `pager`, read before it is settled |
  |---|---|---|
  | `[name asc]` (Q0) | `order[0][column]=0`, `order[0][dir]=asc`; every column search `""`; `search[value]=`; `start=0`, `length=25` | `sort` `[name asc]`, `filters` `{}`, `search` `""`, `offset` 0, `limit` 25 |
  | `[]` | no `order` key; the rest as above | `sort` `[]`; the rest as above |

- Reason: "Reset table" undoes what narrows and orders the rows (PRD-B8); the page size is the user's reading
  preference, not a narrowing, and "Reset table" shows only for sort and filters (FILT-30).
- Layer: component.
- Traces: PRD-B20, PRD-B8.

**CONN-15** `draw` MUST be 1 in the first request and one more in every later request, whatever sent it.
- Examples (the test runs every row): mount, `table.onsort([code desc])`, `reload()`, `table.onsearch('x')`, none
  answered: `draw` 1, 2, 3, 4. Map M without entry 1's `id`: mount, then `table.onsort([code asc])` (refused, CONN-16,
  nothing sent), then `table.onsearch('x')`: `draw` 1, then 2.
- Reason: the answer echoes `draw` as a check that it answers the request sent (CONN-18); which request an answer
  belongs to the helper knows from the call of `send` itself (CONN-22) (PRD-B20). Stated limit, not tested: the
  counter starts at 1 for each helper and has no upper bound; at ten requests a second it reaches 2^31-1, where a
  backend reading `draw` as a 32-bit integer would overflow, after 6.8 years.
- Layer: component.
- Traces: PRD-B20.

**CONN-16** A sort or filter on a column id that no map entry serves, in an intent, in the initial query or in the
query of a `reload()`, MUST send nothing, keep the query, and call `onerror` once with an `Error` naming that column
id.
- Examples (the test runs every row; map M without entry 1's `id`; for an intent, the first answer settled):

  | Intent or mount | `send` calls after it | `table.sort`, `table.filters` | `onerror` |
  |---|---|---|---|
  | `table.onsort([code asc])` | none | `[name asc]`, `{}` | once, message holds `code` |
  | `table.onfilter({ id: 'code', state: { kind: 'text', text: 'B' } })` | none | `[name asc]`, `{}` | once, message holds `code` |
  | mount with sort `[code asc]` | none | `[code asc]`, `{}` | once, message holds `code` |
  | `reload()` after that mount | none | `[code asc]`, `{}` | once more, message holds `code` |

  After the refused mount, `table.status` is `'failed'`.

- Reason: without an index the backend cannot be told which column; sending the request without it would show rows
  that do not match the marks (PRD-B20).
- Layer: component.
- Traces: PRD-B20.

## 2. The answer (CONN)

**CONN-17** For an answer it can map, the helper MUST set `table.rows` to the answer's `data` itself,
`pager.total` to `recordsFiltered`, `pager.unfilteredTotal` to `recordsTotal`, `table.status` to `'ready'` and
`table.busy` to `false`.
- Examples (the test runs every row):

  | Answer | Result |
  |---|---|
  | A1 | `table.rows === D`; `pager.total` 57, `pager.unfilteredTotal` 1000; `'ready'`, not busy; `onerror` not called |
  | A1 with `draw: '1'` or `draw: '01'`, or without `draw` | the same: a `draw` given as text is read as its decimal number |
  | A1 with `recordsFiltered: '57'` and `recordsTotal: '1000'` | the same: `pager.total` the number 57, `pager.unfilteredTotal` 1000 |
  | A1 with `recordsFiltered: '057'` | the same: `pager.total` 57 |
  | A1 with `error: ''`, `error: null`, `error: false`, `error: 0` or `error_code: 'X'` | the same: no error |
  | A1 with an extra field `debug: 1`, each row holding `DT_RowId` | the same; each row as given |

- Reason: rows are passed on as given, never deeply reactive (PRD-B20, MEASURED 2026-11-17 in the PRD); the filtered
  count is the total and the unfiltered one is the information line's (PRD-B26). DataTables reads both counts with
  `parseInt` and an `error` by its truth (READ 2026-11-20, DataTables 2.1.8 source); a count as text is common (a
  PostgreSQL `COUNT` arrives as a string through node-postgres, INFERRED).
- Layer: component.
- Traces: PRD-B20, PRD-B26.

**CONN-18** An answer it cannot map MUST be a failure: `table.status` `'failed'`, `table.busy` `false`, `table.rows`
as before, and `onerror` called once with an `Error`.
- Examples (the test runs every row; the request sent `draw=1`):

  | Answer | Why |
  |---|---|
  | `null`, `'ok'`, `[]` | not an object |
  | A1 without `recordsTotal`; without `recordsFiltered`; without `data` | a field missing |
  | A1 with `recordsFiltered` -1, 1.5, `'5x'`, `'-1'`, `''`, 2^53, `null`, `'1e3'`, `'+5'`, `' 5'`, `'5.0'`, `'9007199254740993'` | neither a safe non-negative integer nor its decimal text (the same for `recordsTotal`) |
  | A1 with `data: {}` | not a list |
  | A1 with `draw` 2, `'2'`, `null`, `'1a'`, `' 1'`, `'1e0'`, `'+1'`, `'1.0'` | `draw` given and neither the number sent nor its decimal text |

  With A1 on screen, the second request answered by A1 with `draw: 2` and without `data`: `'failed'`, `busy` false.

- Reason: a wrong table is worse than none; a total that is not a safe integer breaks the pager (PRD-B9); the manual's
  `draw` echoes the request's counter, and an answer for another request is the helper's failure (PRD-B20).
- Layer: component.
- Traces: PRD-B20, PRD-B9.

**CONN-19** An answer whose `error` is true as a JavaScript condition MUST be a failure whatever its counts and
data.
- Examples (the test runs every row): A1 with `error: 'SQL near WHERE'`, and A1 with `error: true`: `table.status`
  `'failed'`, `onerror` called once. (`error` given as `''`, `null`, `false` or `0` is no error: CONN-17.)
- Reason: the manual's `error` means the script failed, so its counts and rows are not to be trusted; DataTables
  tests it by its truth (READ 2026-11-20, 2.1.8 source) (PRD-B20, PRD-B15).
- Layer: component.
- Traces: PRD-B20, PRD-B15.

**CONN-26** No text from an answer body or from a rejection of `send` MUST appear on screen.
- Examples (the test runs every row; the document is read after the failure):

  | Failure | Text the document does not hold |
  |---|---|
  | A1 with `error: 'SQL near WHERE'` | `SQL near WHERE` |
  | the body `'ok-7731'` (not an object, CONN-18) | `ok-7731` |
  | `send` rejects with `new Error('boom: row 7')` | `boom`, `row 7` |

- Reason: server text and error messages may hold row values and reach screenshots (PRD-S4, PRD-B20); what
  `onerror` receives is the application's to log.
- Layer: component.
- Traces: PRD-B20, PRD-S4.

**CONN-20** A `send` that rejects or throws MUST be a failure: `table.status` `'failed'` and `onerror` called once
with the rejection itself.
- Examples (the test runs every row): `send` rejects with an `Error` E: `onerror(E)`, the same object; `send` throws E
  when called: the same; A1 on screen, `onsort([code desc])`, its `send` rejects: `'failed'`, `busy` false.
- Reason: the application's transport rejects every answer that is not a success (an HTTP status outside 2xx
  included); the application decides what it means (PRD-B20).
- Layer: component.
- Traces: PRD-B20.

**CONN-21** The `Error` of an answer's failure MUST carry `code`: the answer's `error_code` when that is a string,
else `null`.
- Examples (the test runs every row):

  | Answer | `code` |
  |---|---|
  | A1 with `error: 'x'`, `error_code: 'TIMEOUT'` | `'TIMEOUT'` |
  | A1 with `error: 'x'`, `error_code: 42` | `null` |
  | A1 with `error: 'x'` | `null` |
  | A1 without `recordsTotal`, with `error_code: 'TIMEOUT'` | `'TIMEOUT'` |

- Reason: the application can tell a refusal it knows from any other without reading server text (PRD-B20); the
  code is passed as given, the helper maps none.
- Layer: component.
- Traces: PRD-B20.

**CONN-22** The answer or rejection of a request that a later request superseded MUST change nothing and MUST NOT call
`onerror`.
- Examples (the test runs every row; request 1 sent, then `onsort([code desc])` sends request 2):

  | Settled, in this order | `table` and `pager` | `onerror` |
  |---|---|---|
  | request 1 with A1 | still `'loading'`, no rows | not called |
  | request 1 rejects | still `'loading'` | not called |
  | request 2 with a valid answer (draw 2), then request 1 with A1 | request 2's rows and totals | not called |

- Reason: only the latest request's answer matches the marks and boxes on screen (PRD-B20).
- Layer: component.
- Traces: PRD-B20.

**CONN-23** A request MUST run as `table.busy` true with the rows kept while an answer is on screen, and as
`table.status` `'loading'` while none is.
- Examples (the test runs every row):

  | Before the request | While it runs |
  |---|---|
  | mounted, nothing answered | `'loading'`, `busy` false |
  | A1 on screen | `'ready'`, `busy` true, `rows === D` |
  | an answer of 0 rows on screen | `'ready'`, `busy` true |
  | the last request failed | `'loading'`, `busy` false |

- Reason: rows on screen stay readable while the next page loads; a first load or one after a failure has nothing to
  keep (PRD-B15, PRD-B20).
- Layer: component.
- Traces: PRD-B20, PRD-B15.

**CONN-24** `reload()` MUST send the current query again, with the next `draw`, when every column id of its sort and
filters is served (else CONN-16).
- Example: A1 settled, `reload()`: `send` called a second time; the request holds `draw=2` and every other pair of
  the first request; after a failure, the same.
- Reason: the application retries a failed or stale page without changing what the user chose (PRD-B20).
- Layer: component.
- Traces: PRD-B20.

**CONN-25** `pager` MUST be `undefined` until the first answer the helper maps, and given from then on.
- Examples (the test runs every row):

  | After | `pager` | `Pagination` in the probe |
  |---|---|---|
  | mount, nothing settled | `undefined` | none |
  | the first request fails | `undefined` | none |
  | A1 | `offset` 0, `limit` 10, `total` 57, `unfilteredTotal` 1000 | shown |
  | A1, then a failed request | as after A1 | shown |

- Reason: the pager has no state for a total not yet known, so the application shows it only once its props exist
  (PRD-B20, PRD-B9).
- Layer: component.
- Traces: PRD-B20, PRD-B9.

## Trace

### Statement -> PRD

| Statement | PRD ids |
|---|---|
| CONN-01 | PRD-B20 |
| CONN-02 | PRD-B20 |
| CONN-03 | PRD-B20 |
| CONN-04 | PRD-B20 |
| CONN-05 | PRD-B20 |
| CONN-06 | PRD-B20 |
| CONN-07 | PRD-B20, PRD-B9 |
| CONN-08 | PRD-B20, PRD-B4 |
| CONN-09 | PRD-B20, PRD-B6 |
| CONN-10 | PRD-B20, PRD-B7 |
| CONN-12 | PRD-B20, PRD-B25 |
| CONN-13 | PRD-B20, PRD-B4, PRD-B8, PRD-B25 |
| CONN-14 | PRD-B20, PRD-B8 |
| CONN-15 | PRD-B20 |
| CONN-16 | PRD-B20 |
| CONN-17 | PRD-B20, PRD-B26 |
| CONN-18 | PRD-B20, PRD-B9 |
| CONN-19 | PRD-B20, PRD-B15 |
| CONN-20 | PRD-B20 |
| CONN-21 | PRD-B20 |
| CONN-22 | PRD-B20 |
| CONN-23 | PRD-B20, PRD-B15 |
| CONN-24 | PRD-B20 |
| CONN-25 | PRD-B20, PRD-B9 |
| CONN-26 | PRD-B20, PRD-S4 |
| CONN-27 | PRD-B20, PRD-B9 |

### PRD must -> statements

| PRD id | Statements | Coverage |
|---|---|---|
| PRD-B20 | CONN-01 to CONN-10, CONN-12 to CONN-27 | in part: the export path is PKG-06 of `spec/package.md`; cancel, the stopped state and `onretry`, writing the query and the first page loaded on the server come with later parts |
| PRD-B4 | CONN-08, CONN-13 | in part: the rest is `spec/table.md`'s |
| PRD-B6 | CONN-09 | in part: the rest is `spec/table.md`'s |
| PRD-B7 | CONN-10 | in part: the rest is `spec/table.md`'s |
| PRD-B8 | CONN-13, CONN-14 | in part: the rest is `spec/table.md`'s |
| PRD-B9 | CONN-07, CONN-18, CONN-25, CONN-27 | in part: the rest is `spec/table.md`'s |
| PRD-B15 | CONN-19, CONN-23 | in part: the rest is `spec/table.md`'s |
| PRD-B25 | CONN-12, CONN-13 | in part: the rest is `spec/table.md`'s |
| PRD-B26 | CONN-17 | in part: the rest is `spec/table.md`'s |
| PRD-S4 | CONN-26 | in part: the rest is `spec/table.md`'s |

PRD-D6, the server guide, is cited in the reasons of CONN-09 and CONN-10 and traced by none: its text is the guide's.
