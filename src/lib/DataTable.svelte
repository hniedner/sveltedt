<script lang="ts" generics="Row">
  import { defaultMessages, mergeMessages } from "./messages.js";
  import { nextOrder } from "./sort.js";
  import type {
    DataTableColumn,
    DataTableProps,
    SortDirection,
  } from "./types.js";
  import { validateTable } from "./validate.js";

  const {
    rows,
    columns,
    getRowId,
    caption,
    regionLabel,
    status = "ready",
    busy = false,
    messages,
    sort,
    onsort,
    heading,
    actions,
  }: DataTableProps<Row> = $props();
  // The caption text and the hint (SORT-28) are one name: Svelte trims a bare space beside a tag, so it is a value
  const SPACE = " ";
  // Ties each sort button to its description, unique per table on the page
  const uid = $props.id();
  // Shift held at the Enter or Space keydown (null: no such key pending) decides the next click with no pointer,
  // whatever Shift that click carries or another key changes; the click or a blur clears it
  let keyShift: boolean | null = null;
  function sortKey(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") keyShift = event.shiftKey;
  }
  function shiftOf(event: MouseEvent): boolean {
    const shift =
      event.detail === 0 && keyShift !== null ? keyShift : event.shiftKey;
    keyShift = null;
    return shift;
  }
  // A sort button's press emits the next order (SORT-12). A sort button exists only for a sortable column, and the table
  // has an onsort whenever a column is sortable (RND-05), so neither fallback below can be reached
  function press(column: DataTableColumn<Row>, event: MouseEvent): void {
    // Stryker disable OptionalChaining,ArrayDeclaration: unreachable fallbacks, see above
    onsort?.(
      nextOrder(order, column.id, column.sortable ?? [], shiftOf(event)),
    );
    // Stryker restore OptionalChaining,ArrayDeclaration
  }
  // The direction mark of a sorted column (SORT-13)
  const arrow = (direction: SortDirection): string =>
    direction === "asc" ? "▲" : "▼";
  // The text of a cell without a snippet; RND-05 refuses a column with neither, so its value is there
  // Stryker disable OptionalChaining: unreachable, see above
  const textOf = (column: DataTableColumn<Row>, row: Row) =>
    column.value?.(row);
  // Stryker restore OptionalChaining
  // The given words over the English defaults (RND-06)
  const words = $derived(mergeMessages(defaultMessages, messages));
  // null is no order (SORT-15)
  const order = $derived(sort ?? []);
  const fault = $derived(
    validateTable({
      rows,
      columns,
      getRowId,
      caption,
      regionLabel,
      status,
      sort,
      onsort,
    }),
  );
  // Counted only while the rows shown are the answer (A11Y-05)
  const count = $derived(
    fault === null && status === "ready" && !busy
      ? words.rowCount(rows.length)
      : "",
  );
  // Loading or busy, with valid input: what the slow-load feedback waits on (STATE-09)
  const pending = $derived(fault === null && (status === "loading" || busy));
  // The progress indicator is in the component; it is inside its 500 ms minimum; the still-loading text is shown (PRD-B2)
  let shown = $state(false);
  // Stryker disable next-line BooleanLiteral: equivalent, a wrongly true start only skips a reset of shown and still, which are false then
  let held = $state(false);
  let still = $state(false);
  // 1 s of pending without a gap shows the indicator (STATE-09); a gap clears the delay. Once nothing is pending and
  // the minimum has passed, the indicator goes (STATE-10) and the still-loading text with it (STATE-12)
  $effect(() => {
    if (!pending) {
      if (!held) {
        shown = false;
        still = false;
      }
      return;
    }
    if (shown) return;
    const delay = setTimeout(() => {
      shown = true;
      held = true;
    }, 1000);
    return () => clearTimeout(delay);
  });
  // While the indicator is shown: its 500 ms minimum (STATE-10) and the still-loading text 5 s after it appeared
  // (STATE-12), both ended when it goes or the table unmounts (FOOT-05)
  $effect(() => {
    if (!shown) return;
    const minimum = setTimeout(() => (held = false), 500);
    const long = setTimeout(() => (still = true), 5000);
    return () => {
      clearTimeout(minimum);
      clearTimeout(long);
    };
  });
  // A column's direction and rank in the order; the rank only while two or more columns are sorted (SORT-05, SORT-06)
  function sortState(id: string): {
    direction: SortDirection | null;
    rank: number | null;
  } {
    const place = order.findIndex((entry) => entry.id === id);
    const entry = order[place];
    if (!entry) return { direction: null, rank: null };
    return {
      direction: entry.direction,
      rank: order.length > 1 ? place + 1 : null,
    };
  }
</script>

<div class="sdt">
  {@render heading?.()}
  {@render actions?.()}
  <!-- Both live elements stay in the document in every state, the invalid-input alert's included, so a change of
     their text is announced -->
  <div role="status" aria-atomic="false">
    {fault === null && status === "loading" ? words.loading : ""}
    {#if still}<div>{words.stillLoading}</div>{/if}
  </div>
  <div class="sdt-sr-only" aria-live="polite">{count}</div>
  {#if fault !== null}
    <div role="alert">{words[fault]}</div>
  {:else}
    {#if status === "failed"}
      <div role="alert">{words.failed}</div>
    {/if}
    {#if shown}<div data-sdt-progress aria-hidden="true"></div>{/if}
    <div class="sdt-region" role="region" aria-label={regionLabel}>
      <table class="sdt-table" aria-busy={busy || status === "loading"}>
        <caption class="sdt-caption"
          >{caption}{#if columns.some((column) => column.sortable)}{SPACE}<span
              >{words.sortableHint}</span
            >{/if}</caption
        >
        <thead>
          <tr class="sdt-head-row">
            {#each columns as column, index (column.id)}
              {@const state = sortState(column.id)}
              <!-- aria-sort on the lead column's header only (A11Y-03) -->
              <th
                class="sdt-th"
                scope="col"
                aria-sort={order[0]?.id !== column.id
                  ? undefined
                  : state.direction === "asc"
                    ? "ascending"
                    : "descending"}
              >
                {#if column.sortable}
                  <!-- The table emits the next order and shows only the one it is given (SORT-12) -->
                  <button
                    type="button"
                    aria-describedby={`${uid}-sort-${index}`}
                    onkeydown={sortKey}
                    onblur={() => (keyShift = null)}
                    onclick={(event) => press(column, event)}
                    >{column.label}</button
                  >{#if state.direction}<span aria-hidden="true"
                      >{arrow(state.direction)}</span
                    >{/if}{#if state.rank !== null}<span aria-hidden="true"
                      >{words.sortRank(state.rank)}</span
                    >{/if}
                {:else}
                  {column.label}
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <!-- STATE-20: stopped shows one spanning cell and no rows; loading and failed leave the body empty and
             show their message outside the table (STATE-01, STATE-02, STATE-06, STATE-07) -->
          {#if status === "stopped"}
            <tr
              ><td class="sdt-cell" colspan={columns.length}>{words.stopped}</td
              ></tr
            >
          {:else if status === "ready"}
            {#each rows as row (getRowId(row))}
              <tr class="sdt-row">
                {#each columns as column (column.id)}
                  <td class="sdt-cell"
                    >{#if typeof column.cell === "function"}{@render column.cell(
                        row,
                        column.id,
                      )}{:else}{textOf(column, row)}{/if}</td
                  >
                {/each}
              </tr>
            {:else}
              <tr
                ><td class="sdt-cell sdt-empty" colspan={columns.length}>
                  {words.empty}</td
                ></tr
              >
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
    <!-- The sort buttons' descriptions, outside the table so they are no header text -->
    <div hidden>
      {#each columns as column, index (column.id)}
        {#if column.sortable}
          <span id={`${uid}-sort-${index}`}
            >{words.sortDescription(sortState(column.id))}</span
          >
        {/if}
      {/each}
    </div>
  {/if}
</div>
