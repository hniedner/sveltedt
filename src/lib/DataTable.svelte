<script lang="ts" generics="Row">
  import { untrack } from "svelte";
  import { faultLine } from "./faults.js";
  import { badges, resetShown } from "./filters.js";
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
    oncancel,
    onretry,
    filters,
    onfilter,
    onclearfilter,
    onclearfilters,
    onreset,
    criteria,
    search,
    searchDelay,
    maxLength,
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
      filters,
      onfilter,
      onclearfilter,
      onclearfilters,
      search,
      searchDelay,
      maxLength,
      emptyOption: words.emptyOption,
    }),
  );
  // The cause of a fault goes to the developer (RND-17). `fault` is a derived code, so the effect runs again only when
  // it changes: once for each change, and never on the server
  $effect(() => {
    if (fault !== null) console.error(faultLine(fault));
  });
  // The applied filters as badges; none while the alert shows, as the table cannot vouch for filters it could not
  // validate (FILT-08)
  const badgeList = $derived(
    fault === null ? badges(columns, filters, words) : [],
  );
  // Counted only while the rows shown are the answer (A11Y-05)
  const count = $derived(
    fault === null && status === "ready" && !busy
      ? words.rowCount(rows.length)
      : "",
  );
  // Loading or busy, with valid input: what the slow-load feedback waits on (STATE-09)
  const pending = $derived(fault === null && (status === "loading" || busy));
  // The slow-load state of PRD-B2: `shown` is the progress indicator being in the component, `held` its 500 ms
  // minimum still running, `still` the still-loading text being shown
  let shown = $state(false);
  // Stryker disable next-line BooleanLiteral: equivalent, a wrongly true start only skips a reset of shown and still, which are false then
  let held = $state(false);
  let still = $state(false);
  // 1 s of pending without a gap shows the indicator (STATE-09); a gap clears the delay. Once nothing is pending and
  // the minimum has passed, the indicator goes (STATE-10) and the still-loading text with it (STATE-12)
  $effect(() => {
    if (!pending) {
      if (!held) {
        // A block that depends on state a plain $effect writes is removed in the same flush, before any pre-effect runs
        // (measured with Svelte 5.57.3, an effect-order detail that may change): so focus is kept here, before `still`
        // is written
        untrack(() => keepFocus(cancelButton));
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
  // The callback of "Cancel" while it is shown (STATE-17), nothing otherwise; the markup and the focus hand-off read it
  const cancel = $derived(still ? oncancel : undefined);
  // The callback of "Try again" while it is shown (STATE-23), nothing otherwise
  const retry = $derived(
    status === "stopped" || status === "failed" ? onretry : undefined,
  );
  // For the focus hand-off: bind:this sets them, and nulls them when their element goes. State, because a variable that
  // bind:this sets inside an {#if} must be declared with $state(...) (the compiler warns otherwise)
  let table = $state<HTMLTableElement | null>(null);
  let cancelButton = $state<HTMLButtonElement | null>(null);
  let retryButton = $state<HTMLButtonElement | null>(null);
  // A focused button about to go hands focus to the table, which takes it without scrolling (A11Y-28, A11Y-30). The
  // tabindex is set only for this focus and goes with the table's `onblur`. With invalid
  // input there is no table. It must run before the button leaves the DOM
  function keepFocus(button: HTMLElement | null): void {
    if (table && button?.matches(":focus")) {
      table.tabIndex = -1;
      table.focus({ preventScroll: true });
    }
  }
  // A button goes with the props: a props flush, where a pre-effect runs before the DOM update. Both are read, so
  // either going reruns it
  $effect.pre(() => {
    const goneCancel = !cancel;
    const goneRetry = !retry;
    untrack(() => {
      if (goneCancel) keepFocus(cancelButton);
      if (goneRetry) keepFocus(retryButton);
    });
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
  {#each badgeList as badge (badge.id)}
    <!-- A badge exists only for a column with a filter, so the table has an onclearfilter (FILT-32) -->
    <button
      type="button"
      aria-label={words.clearFilter(badge.text)}
      onclick={() =>
        // Stryker disable next-line OptionalChaining: unreachable fallback, see above
        onclearfilter?.({ id: badge.id })}>{badge.text}</button
    >
  {/each}
  {@render criteria?.()}
  {#if badgeList.length > 0}
    <button
      type="button"
      onclick={() =>
        // Stryker disable next-line OptionalChaining: unreachable fallback, the table has an onclearfilters (FILT-32)
        onclearfilters?.()}>{words.clearFilters}</button
    >
  {/if}
  {#if resetShown(fault, columns, onreset)}
    <button
      type="button"
      onclick={() =>
        // Stryker disable next-line OptionalChaining: unreachable fallback, the button shows only with an onreset (FILT-30)
        onreset?.()}>{words.reset}</button
    >
  {/if}
  <!-- Both live elements stay in the document in every state, the invalid-input alert's included, so a change of
     their text is announced -->
  <div role="status" aria-atomic="false">
    {fault === null && status === "loading" ? words.loading : ""}
    {#if still}<div>{words.stillLoading}</div>{/if}
    {#if fault === null && status === "stopped"}<div>{words.stopped}</div>{/if}
  </div>
  {#if cancel}<button
      bind:this={cancelButton}
      type="button"
      onclick={() => cancel()}>{words.cancel}</button
    >{/if}
  <div class="sdt-sr-only" aria-live="polite">{count}</div>
  {#if fault !== null}
    <div role="alert">{words.invalidInput}</div>
  {:else}
    {#if status === "failed"}
      <div role="alert">{words.failed}</div>
    {/if}
    {#if shown}<div data-sdt-progress aria-hidden="true"></div>{/if}
    <div class="sdt-region" role="region" aria-label={regionLabel}>
      <table
        bind:this={table}
        class="sdt-table"
        aria-busy={busy || status === "loading"}
        onblur={(event) => event.currentTarget.removeAttribute("tabindex")}
      >
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
                aria-label={column.label}
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
                {/if}{#if column.filter}
                  <!-- No handler yet: the filter dialog is a later statement -->
                  <button
                    type="button"
                    aria-label={words.filterButton(column.label)}
                    ><svg
                      aria-hidden="true"
                      focusable="false"
                      viewBox="0 0 16 16"
                      width="12"
                      height="12"
                      ><path
                        d="M1 2h14l-5.5 6.5V14l-3-1.5V8.5z"
                        fill="currentColor"
                      /></svg
                    ></button
                  >
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
    {#if retry}<button
        bind:this={retryButton}
        type="button"
        onclick={() => retry()}>{words.retry}</button
      >{/if}
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
