# 004: Component structure: parts, state and region order

Design record for the inside of `DataTable`, decided before search, filter dialogs, the column chooser, selection, child
rows and sticky layout arrive. Facts were read at main b20d582 (READ: a bare path:line; every line number is that
commit's), measured with the command named (MEASURED), fetched on 2026-11-24 from the URL named (FETCHED), or reasoned
(INFERRED). "At b20d582" marks a fact about the code that a later commit may change; the Decision and rule text is meant
to last. Nothing here is public API: PRD-K3 lists what is. One point is a recommendation the owner decides, not a
decision (see Region order).

## Starting point (at b20d582)

- `src/lib/DataTable.svelte` is 248 lines: the props (`src/lib/DataTable.svelte:12-36`), the sort press and the Shift
  state its buttons share (`src/lib/DataTable.svelte:41-60`), the derived values with the validation
  (`src/lib/DataTable.svelte:68-115`), the one `TableView` (`src/lib/DataTable.svelte:104-109`), the focus hand-off
  (`src/lib/DataTable.svelte:116-139`) and the markup (`src/lib/DataTable.svelte:142-248`).
- Two parts exist, `src/lib/parts/HeaderCell.svelte` (76 lines) and `src/lib/parts/Toolbar.svelte` (61), and one state
  class, `src/lib/view.svelte.ts` (49). None is exported: the root entry `src/lib/index.ts` exports `DataTable`,
  `Pagination` and types (`src/lib/index.ts:1-15`); the package's other entries are `./connection` and `./styles.css`
  (`package.json:8-17`). `Pagination` is placed by the application and holds the information line
  (`src/lib/Pagination.svelte:14-24`, `src/lib/Pagination.svelte:53`).
- Added with the global search (#162), measured at 1df7c3b: a third part,
  `src/lib/parts/Search.svelte` (70 lines), and a second state class, `src/lib/search.svelte.ts` (84 lines), built by
  the part, which amends the Fields rule below.
- Binding rules: PRD-G2 (a) puts logic in `.ts` and `.svelte.ts`, (b) bans `class:`, `style:`, `use:`, `{@attach}`,
  spreads and any `bind:` but `bind:this` (`docs/PRD.md:1297-1299`; ESLint, `eslint.config.mjs:38-84`). PRD-T15 bans a
  `<style>` block and classes other than `sdt`, `sdt-*` or from a hook (`docs/PRD.md:1021-1025`). Enforced: the
  `<style>` block, by ESLint (labelled PRD-T3, `eslint.config.mjs:60-63`) and the stylesheet step (THEME-04,
  `scripts/check-stylesheet.ts:483-502`). The class-name rule is enforced by neither (INFERRED from those reads):
  THEME-08's scan of every `class` attribute is specified (`spec/table.md:1370`, `spec/table.md:1385`) and not built
  (MEASURED: `git grep -n "THEME-08" b20d582 -- scripts src site` finds nothing).

## Decomposition

- **Need:** the root is about to take search, filter dialogs, the chooser, drag and resize, selection, child rows and
  sticky layout, each with its own state and markup (INFERRED from the PRD's milestones); PRD-G2 wants logic in modules.
- **Candidates:** one file; parts per feature with their logic inside; parts per region with logic in modules.
- **Decision:** parts per region, internal, in `src/lib/parts/`, none exported. The root keeps the props and defaults,
  `validateTable` and the alert branch, the one `TableView`, the root `div.sdt`, and its regions and parts in document
  order: the one place the order of the regions is written. A part writes the order inside it, as `Toolbar` writes
  FILT-31's (`src/lib/parts/Toolbar.svelte:33-61`).
- **Built, at b20d582:** `HeaderCell` (`src/lib/parts/HeaderCell.svelte:38-76`) and `Toolbar`. Expected, each written by
  the branch that builds it (INFERRED): the filter dialog, the chooser, a body row. Root markup, not parts: the live
  count, the failed notice, Try again, the hidden sort descriptions and the alert, one element each (Try again's `retry`
  and `bind:this` reference are the root's, `src/lib/DataTable.svelte:112-115`). The loading line (status region,
  Cancel, progress indicator) meets rule (2), but the rule applies from the next feature on and #146 decides the line: a
  part would move the Cancel button's `bind:this` and the `ending` hand-off across a part boundary (INFERRED).
- **Logic:** pure functions in `.ts` beside the parts (`src/lib/sort.ts:18-51`, `src/lib/filters.ts`), reactive logic in
  `.svelte.ts` (`src/lib/view.svelte.ts`). A new module comes when a function has a statement to test on its own.
- Today's pattern, not a rule: both parts are `generics="Row"` like the root (`src/lib/DataTable.svelte:1`,
  `src/lib/parts/Toolbar.svelte:1`). A part renders inside `div.sdt`, with no portal (THEME-09,
  `spec/table.md:1399-1402`; the "no portal" reading is INFERRED). The filter dialog is a popover in the top layer; its
  markup follows its own filter button (`spec/table.md:2773-2779`).
- **The rule** (from the next feature on; the two parts built fit it): a feature gets its own part when it (1) is a slot
  of the document order below (a slot in that order, not the spec's `role="region"` element) that holds more than one
  element with controls of their own, (2) owns a field of `TableView` and more than one element, or (3) repeats per
  column or per row with its own controls. Otherwise it is markup in the nearest part. Walk at b20d582 (INFERRED): the
  `heading` and `actions` snippets, adopter markup, root; the toolbar, (1), the part; status region, Cancel and progress
  indicator, the loading line above; live count, alert, failed notice, Try again and sort descriptions, one element
  each, root; the table region, (3) for its header cells (`HeaderCell`), the wrapper and `table` stay root.
- **Callbacks:** called once per intent (PRD-B2), in the part where the press happens
  (`src/lib/parts/Toolbar.svelte:40-59`) or through a handler the root passes down when the intent needs root state: the
  sort press and its Shift state (`src/lib/DataTable.svelte:41-60`, `src/lib/DataTable.svelte:190-198`,
  `src/lib/parts/HeaderCell.svelte:16-19`).
- **Tests:** at the component boundary, `DataTable` mounted. At b20d582 no test mounts a part or imports
  `view.svelte.ts` (MEASURED: `git grep -n -e "parts/" -e "view.svelte" b20d582 -- "*.ts" "*.svelte"` lists only
  `src/lib/DataTable.svelte:5`, `src/lib/DataTable.svelte:6` and `src/lib/DataTable.svelte:10`).
- **Reopens when:** a part passes about 150 lines (`HeaderCell` 76, `Toolbar` 61 at b20d582), or a feature fits none of
  (1) to (3).

## State

- **Need:** PRD-B2 lists the internal state and says "It resets on remount" (`docs/PRD.md:164-172`).
- **Candidates:** (i) `$state` in each part, coordinated by props and callbacks; (ii) a context object; (iii) one class
  with `$state` fields in a `.svelte.ts`, built per table and passed as a prop where a part needs it. Svelte's advice
  (FETCHED): "use classes with `$state` fields to share reactivity between components, instead of using stores" and
  "Consider using context instead of declaring state in a shared module"
  (https://svelte.dev/docs/svelte/best-practices); `.svelte.js` files are "useful for creating reusable reactive logic,
  or sharing reactive state across your app" (https://svelte.dev/docs/svelte/svelte-js-files).
- **Decision:** (iii), `class TableView` in `src/lib/view.svelte.ts`.
  - **Fields:** one `$state` field per PRD-B2 item that the markup, a part or one of its effects reads, named for it. At
    b20d582 three, the slow-load items of PRD-B22: `shown`, `held` (its minimum display time is running; read only by
    the first effect) and `still` (`src/lib/view.svelte.ts:6-10`, `src/lib/view.svelte.ts:20`). Each timer is a local of
    the effect that starts it, cleared by its teardown (`src/lib/view.svelte.ts:31-35`, `src/lib/view.svelte.ts:41-46`;
    FOOT-05, `spec/table.md:1272`). At b20d582 no test compares the fields with PRD-B2's list; a review does (MEASURED:
    `git grep -n "PRD-B2" b20d582 -- src site test scripts` finds no test of the fields: `scripts/trace.test.ts:61` is a
    trace-hash test, the other hits are comments).
    This amends the rule above: a field the user types into keeps its unsent text and its pause timer in a class of its
    own, built by the part that shows the field (`src/lib/search.svelte.ts`, #162); `TableView` keeps the table-wide
    items.
  - **Writers:** only `TableView`'s own effects write its fields; the root reads `still` and `shown`
    (`src/lib/DataTable.svelte:111`, `src/lib/DataTable.svelte:159`, `src/lib/DataTable.svelte:174`; MEASURED:
    `grep -rnE "view\.\w+ =" src/lib` finds nothing). The fields are public and writable in TypeScript; a part that
    writes one is a review finding (a stated limit).
  - **`ending`:** `TableView` is built with two functions: `pending`, which its first effect reads, so that a change of
    the table's pending state runs that effect again, and `ending`, the table's focus hand-off (A11Y-28), which the same
    effect calls untracked just before it hides the indicator and the still-loading text. Both stay closed over inside
    the effect: no field holds them, and `TableView` holds none of the consumer's callbacks
    (`src/lib/view.svelte.ts:15-28`; `src/lib/DataTable.svelte:106-109`).
  - **Lifetime:** built once while the root's script initialises (`src/lib/view.svelte.ts:12-14`,
    `src/lib/DataTable.svelte:104-109`). A new instance per mount gives "resets on remount" and shares nothing between
    server requests; effects "only run in the browser, not during server-side rendering" (FETCHED,
    https://svelte.dev/docs/svelte/$effect), so no timer starts there.
  - **A prop when a part needs a field, not context:** at b20d582 no part receives the `TableView` (MEASURED:
    `git grep -n TableView b20d582 -- src site` lists `src/lib/view.svelte.ts:6`, `src/lib/DataTable.svelte:10` and
    `src/lib/DataTable.svelte:105-106`; no file under `src/lib/parts/` mentions it). Parts are one or two levels deep
    and a prop shows in the part's `Props` type. Context would work at the peer floor of 5.20 (`package.json:57`)
    through `setContext` and `getContext`; only the typed `createContext` needs 5.40 (FETCHED,
    https://svelte.dev/docs/svelte/context).
  - **Props stay the only source of truth (PRD-B2):** `TableView` never copies a prop: `pending` arrives as a function
    that reads a `$derived` of the props (`src/lib/DataTable.svelte:103`, `src/lib/DataTable.svelte:107`). No `$state`
    cell of `DataTable` or its parts starts from a prop (MEASURED:
    `grep -rnE '\$state' src/lib/*.svelte src/lib/parts/*.svelte src/lib/*.svelte.ts` lists `src/lib/view.svelte.ts:7`,
    `src/lib/view.svelte.ts:9`, `src/lib/view.svelte.ts:10` and `src/lib/DataTable.svelte:118-120`, and a comment at
    `src/lib/DataTable.svelte:117`); the connection helper, a separate entry, is not covered by this claim. Values
    computed from props are `$derived` (`src/lib/DataTable.svelte:68-115`). Unsent search and filter text, when those
    branches add it, shows over the applied prop only while it is newer (FILT-05, `spec/table.md:2763`, not built at
    b20d582).
  - **Kept outside `TableView` (a reading of PRD-B2, INFERRED):** `keyShift`, a plain variable between a keydown and the
    click it decides, from which nothing renders (`src/lib/DataTable.svelte:41-52`), and the element references that
    `bind:this` sets for the focus hand-off (`src/lib/DataTable.svelte:118-120`).
  - No two-way binding between parts (PRD-G2 (b)). Measured offsets reach the DOM through CSSOM, never a `style`
    attribute (`docs/PRD.md:1429`, `docs/PRD.md:1614-1615`); that this runs in an effect is INFERRED.
- **Reopens when:** a third level of nesting needs `TableView`.

## Region order and what an adopter can change

- **Need:** the public classes sit on fixed elements (`spec/table.md:1399-1402`, `src/lib/classes.test.ts:48-131`), and
  Tab and reading order follow the visible order (WCAG technique C27, FETCHED,
  https://www.w3.org/WAI/WCAG22/Techniques/css/C27: "A keyboard user may have trouble predicting where focus will go
  next when the source order does not match the visual order.").
- **The order at b20d582** inside `div.sdt` (`src/lib/DataTable.svelte:142-248`): the `heading` snippet
  (`src/lib/DataTable.svelte:143`); the `actions` snippet (`src/lib/DataTable.svelte:144`); the toolbar, with no element
  of its own: badges, the `criteria` snippet, "Clear column filters", "Reset table" (`src/lib/DataTable.svelte:145-154`,
  `src/lib/parts/Toolbar.svelte:35-61`; FILT-31); the status region (`src/lib/DataTable.svelte:157-161`); Cancel
  (`src/lib/DataTable.svelte:162-166`); the live count (`src/lib/DataTable.svelte:167`); then either the alert
  (`src/lib/DataTable.svelte:168-169`), or the failed notice (`src/lib/DataTable.svelte:171-173`), the progress
  indicator (`src/lib/DataTable.svelte:174`), the region with the table (`src/lib/DataTable.svelte:175-231`), Try again
  (`src/lib/DataTable.svelte:232-236`) and the hidden sort descriptions (`src/lib/DataTable.svelte:238-246`).
- **In the alert state:** the heading, the actions, the `criteria` snippet, "Reset table" for a sort or filter fault
  (`src/lib/filters.ts:54-65`), the status region and the live count stay, both live elements empty
  (`spec/table.md:61-67`). The badges and "Clear column filters" go (FILT-08, `src/lib/parts/Toolbar.svelte:28-30`).
  Cancel goes too (INFERRED, not run: `pending` is false under a fault, `src/lib/DataTable.svelte:103`, so the first
  effect sets `still` false, `src/lib/view.svelte.ts:19-26`, because `still` implies `held` is false,
  `src/lib/view.svelte.ts:20`). The alert takes the place of the failed notice, the progress indicator, the region, Try
  again and the descriptions.
- **What pins it:** the heading (RND-14, `spec/table.md:359`), the Tab order (A11Y-10, `spec/table.md:858`), Cancel
  (A11Y-31, `spec/table.md:1064`), the toolbar (FILT-31, `spec/table.md:3070`) and Try again (STATE-25,
  `spec/table.md:737`; A11Y-23, `spec/table.md:931`). At b20d582, tested: RND-14, FILT-31, STATE-25 and A11Y-23
  (MEASURED: `git grep -l '"<ID>"' b20d582 -- src site test`). Specified and built, no test carrying the id: A11Y-10 and
  A11Y-31 (MEASURED: `git grep "A11Y-10\|A11Y-31" b20d582 -- src site test scripts` is empty). Specified, not built, no
  test yet: the skip link first (A11Y-36, `spec/table.md:4460`) and its target (A11Y-48, `spec/table.md:4468`);
  "Columns" (COL-29, `spec/table.md:3323`); the sort summary
  (SORT-08, `spec/table.md:3439`). Search before the badges (FILT-45) is built and tested (note of 2026-11-25, #262).
- **Decision (internal structure):**
  - The order is written once, in the root; each part writes its own inner order.
  - Places no statement gives yet (the sort summary among the toolbar controls) are
    written by the statements of the branches that build them, not by this record. The same holds for the status region,
    the live count and the progress indicator: the branch that builds the loading line decides whether they move.
  - The order is pinned where a statement exists, and for the positions under "What pins it" only. PRD-K3's breaking
    list does not name element order (`docs/PRD.md:1247-1258`): a change of order is a spec change, and its commit gives
    the changelog line.
  - **Breaking, as a reading of PRD-K3's text (INFERRED):** PRD-K3 makes removing or renaming a public class, or moving
    it to another element, a breaking change (`docs/PRD.md:1249`), and THEME-09 gives the reason, "an application's
    selectors rely on where they sit" (`spec/table.md:1415-1416`). This record reads #191's ruling, that a change moving
    an element which carries a public class is breaking, inside that text.
  - **THEME-48:** it calls four more classes (`sdt-region`, `sdt-caption`, `sdt-sr-only`, `sdt-empty`) public interface
    (`spec/table.md:1420-1427`), against PRD-K3's "Every other `sdt-*` class is internal" (`docs/PRD.md:1255`); this
    record follows PRD-K3's seven (`docs/PRD.md:1250-1252`), and #237 settles the conflict.
- **Compared with the practice** (FETCHED 2026-11-24): DataTables lets the page place its built-in features by slot name
  (https://datatables.net/reference/option/layout: "The layout option provides the ability to control the items that
  surround and control the DataTable.") and deprecates `dom` (https://datatables.net/reference/option/dom: "As of v2.0
  this feature has been deprecated."). AG Grid places its status bar itself and lets the developer align its panels
  (https://www.ag-grid.com/javascript-data-grid/status-bar/: "The Status Bar appears below the grid and contains Status
  Bar Panels."; "The `align` property can be `left`, `center` or `right` (default)."). MUI X lets the developer replace
  parts (https://mui.com/x/react-data-grid/components/: "You can replace the pagination component completely or reuse
  the default one."); that it does not reorder them is INFERRED from that page. TanStack Table renders nothing
  (https://tanstack.com/table/latest: "supplies state and typed APIs without prescribing a single element or style").
- **What an adopter has today** (a fact at the pinned commit, not a promise): the fixed order; the snippets `heading`,
  `actions`, `criteria` and a column's `cell` (`src/lib/types.ts:15-23`, `src/lib/types.ts:134`,
  `src/lib/types.ts:141-142`); a `Pagination` the application places anywhere; CSS on the public classes and the tokens.
  Not: moving or removing a built-in part, or a slot map. CSS `order` or grid placement would split the visual order
  from the document and focus order (C27 above).
- **Recommendation, not a decision:** no `layout` or `dom`-style option in 0.x. Reasons: adding a snippet later is a
  minor ("MINOR version when you add functionality in a backward compatible manner", https://semver.org/, FETCHED) and
  removing one is breaking (`docs/PRD.md:1247-1249`); slot names fixed at 0.1.0 would bind every later feature before
  those features exist (INFERRED); the practice is split (see the comparison above). Offering such an option or not is a
  product choice for the owner. #191 is to record it as an open owner entry in `docs/departures.md` (none exists at
  b20d582), and that entry, not this record, carries the outcome.
- **Reopens when:** an adopter needs a built-in part somewhere a snippet cannot cover, the owner decides the
  recommendation otherwise, or design R (PRD-X5, `docs/PRD.md:1577`, `docs/PRD.md:1597`) changes what scrolls.
