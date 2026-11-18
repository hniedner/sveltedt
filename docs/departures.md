# Departures from DataTables

SvelteDT takes DataTables (datatables.net) as its inspiration and functional template (PRD, section 2, Vision). This
file lists every intentional difference, with its reason, so a project leaving DataTables knows what changes; it also
lists what SvelteDT adds where DataTables has no equivalent. The migration guide (PRD-D8) answers each entry; its docs
test fails on an entry the guide does not have.

Classes: **platform** (Svelte, Tailwind, the strict content-security policy), **improvement** (shown by a measurement or
a source, not asserted), **best practice**, **standards** (WCAG), **owner** (a scope or product choice the owner makes).
An entry of class owner is the owner's decision; the others are decided under the Vision's rule and recorded here.
**Status**: decided, or open (an open entry is not built until it is decided).

| Id | The difference | PRD source | DataTables | Reason | Class | Status |
|---|---|---|---|---|---|---|
| DEP-01 | No cell editing, cell cursor or grid keyboard | Non-goals | Editor, KeyTable, AutoFill | SvelteDT is a data table, not a spreadsheet grid | owner | decided |
| DEP-02 | The component fetches nothing; the connection helper speaks the server-side protocol through the application's own `send` | Non-goals; PRD-B20 | the `ajax` option and server libraries | a project leaving DataTables keeps its backend, while the component stays transport-free | platform | decided |
| DEP-03 | No export, print or copy | Non-goals; PRD-B17 | Buttons | export policy is the application's | owner | decided |
| DEP-04 | No saving of table state | Non-goals | `stateSave`, StateRestore | storage is the application's; the component stores nothing | owner | decided |
| DEP-05 | No raw HTML in cells; strings are shown as text | Non-goals; PRD-S2 | HTML strings rendered by default | values may hold anything (PRD-S2) | platform | decided |
| DEP-06 | No shipped stylesheet; the look comes from prefixed tokens | Non-goals; PRD-T1, PRD-T3 | its own CSS and framework integrations | one stylesheet per application; prefixed names cannot collide with an application's tokens | platform | decided |
| DEP-07 | No bundled translations; every word is a prop | Non-goals; PRD-I1 | 90+ language files | applications translate without forking | owner | decided |
| DEP-08 | No virtualisation | Non-goals; PRD-P1 | Scroller | find-in-page and table navigation need the rows in the page | owner | decided |
| DEP-09 | No grouping, tree, pivot or aggregation rows | Non-goals | RowGroup, footer callbacks | the owner's scope (a non-goal) | owner | decided; whether a footer the application fills counts as an aggregation row is open |
| DEP-10 | Criteria beyond column filters are the application's | Non-goals; PRD section 5.2 | SearchBuilder, SearchPanes | the component knows no application concept | owner | decided |
| DEP-11 | Client-side processing is a separate local data source, not a mode of the component | Non-goals; PRD-B21 | client-side processing inside the table | the component never knows where its rows come from; a page switches between server and local data without changing the table | platform | decided |
| DEP-12 | Props, callbacks and snippets; no imperative API, events or plug-in registry | Vision | the API, its events and plug-in kinds | built idiomatically for Svelte | platform | decided |
| DEP-13 | At most 1000 rows per page; no "All" page length | PRD-P1, PRD-B9 | `lengthMenu` with -1 | every given row renders, up to 1000, with no virtualisation: find-in-page and table navigation need the rows (PRD-P1) | owner | decided |
| DEP-14 | A filter applies on Enter, not while typing | PRD-B6 | debounced search while typing (`searchDelay`, 400 ms by default); Enter optional | every apply is a query; the user learns at the field | owner | decided |
| DEP-15 | Cells wrap; never an ellipsis | PRD-B12, PRD-A11 | `nowrap`, the Ellipsis renderer | nothing is clipped at 200 % zoom or with the WCAG text-spacing values (PRD-A11) | owner | decided |
| DEP-16 | The page scrolls; no fixed-height scroll box | PRD section 5.1 | `scrollY` | the owner's layout choice (design D) | owner | decided |
| DEP-17 | The connection helper speaks only the 1.10-and-later protocol form | PRD-B20 | the legacy 1.9 form is also accepted | a backend that speaks only the legacy form is out of scope (PRD-B20) | owner | decided |
| DEP-18 | Newlines and line and paragraph separators become spaces in search text | PRD-B21 (4), PRD-D8 | a row holding U+2029 never matches a search (measured 2026-11-17, DataTables 3.1.5) | a row is found by its words whatever separates them (this list's wording) | improvement | decided |
| DEP-19 | Nothing is detected from strings: each value is compared by its own type, and numbers held as text need a declared type or a sort value (as text, "3.2" sorts before "3.14") | PRD-B21 (2), PRD-D8 | number, formatted-number and date columns are detected from their text; a column of numbers held as text sorts by value, and one "n/a" cell turns the whole column to text order, "1000" before "3.14" (measured 2026-11-18, DataTables 3.1.5) | detection makes a column's order depend on its data | owner | decided |
| DEP-20 | Text is ordered by a collator for an explicit locale: digit groups by value, punctuation and accents counted, case, width and kana ignored | PRD-B21 (1), PRD-D8 | ASCII text in plain lowercased order ("item10" before "item2"); non-ASCII text by the browser locale's collator, ignoring punctuation ("a b" ties "ab") | "item2" before "item10"; distinct values such as "a b" and "ab" no longer tie where DataTables' non-ASCII rule ties them; the locale's own case rules (in Turkish "IŞIK" and "ışık" tie, where DataTables lowercases without a locale and they do not). Consequence: dates and signed, decimal or zero-padded numbers held as text need a declared type ("2024-01-05" ties "2024-1-5", "007" ties "7", "-10" sorts after "-2"); all measured 2026-11-18 | improvement | decided |
| DEP-21 | Search treats the dotted and the dotless i alike in every locale | PRD-B21 (3), PRD-D8 | its case-insensitive match never maps "ı" or "İ" to "i", so "ışık" does not find "IŞIK" (measured 2026-11-18 on a port of DataTables 3.1.5's search) | a search finds the word whichever i was typed (this list's wording) | improvement | decided |
| DEP-22 | No global search box | none | a default layout control | not yet decided | owner | open |
| DEP-23 | No option to search while typing, beside applying on Enter | PRD-B6 | the default, debounced | not yet decided | owner | open |
| DEP-24 | No information line ("Showing 1 to 10 of 57 entries") | none | a default layout control | not yet decided | owner | open |
| DEP-25 | No child rows | none | `row().child()` | not yet decided | owner | open |
| DEP-26 | No range filters | none | range search examples | not yet decided | owner | open |
| DEP-27 | A Cancel button beside "Still loading", and a stopped state with Try again (an addition) | PRD-B23, PRD-B24 | no equivalent | a user can stop waiting without reloading the page | owner | decided |
