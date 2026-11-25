<script lang="ts" generics="Row">
  import { untrack } from "svelte";
  import { faultLine } from "./faults.js";
  import { defaultMessages, mergeMessages } from "./messages.js";
  import HeaderCell from "./parts/HeaderCell.svelte";
  import Toolbar from "./parts/Toolbar.svelte";
  import { nextOrder, sortState } from "./sort.js";
  import type { DataTableColumn, DataTableProps } from "./types.js";
  import { validateTable } from "./validate.js";
  import { TableView } from "./view.svelte.js";

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
  }
  // Stryker restore OptionalChaining,ArrayDeclaration
  // The text of a cell without a snippet; RND-05 refuses a column with neither, so its value is there
  // Stryker disable OptionalChaining: unreachable, see above
  const textOf = (column: DataTableColumn<Row>, row: Row) =>
    column.value?.({ row });
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
  // Counted only while the rows shown are the answer (A11Y-05)
  const count = $derived(
    fault === null && status === "ready" && !busy
      ? words.rowCount(rows.length)
      : "",
  );
  // Loading or busy, with valid input: what the slow-load feedback waits on (STATE-09)
  const pending = $derived(fault === null && (status === "loading" || busy));
  // The slow-load state of PRD-B2; its first effect keeps focus off a Cancel that is about to go (A11Y-28; why it is
  // there: see TableView)
  const view = new TableView(
    () => pending,
    () => keepFocus(cancelButton),
  );
  // The callback of "Cancel" while it is shown (STATE-17), nothing otherwise; the markup and the focus hand-off read it
  const cancel = $derived(view.still ? oncancel : undefined);
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
</script>

<div class="sdt">
  {@render heading?.()}
  {@render actions?.()}
  <Toolbar
    {fault}
    {columns}
    {filters}
    {words}
    {criteria}
    {onclearfilter}
    {onclearfilters}
    {onreset}
  />
  <!-- The status line: the status region and "Cancel" beside it. The status region and the live count stay in the
     document in every state, the invalid-input alert's included, so a change of their text is announced -->
  <div class={[(pending || view.started) && "sdt-status"]}>
    <div role="status" aria-atomic="false">
      {fault === null && status === "loading" ? words.loading : ""}
      {#if view.still}<span>{words.stillLoading}</span>{/if}
      {#if fault === null && status === "stopped"}<div class="sdt-stopped">
          {words.stopped}
        </div>{/if}
    </div>
    {#if cancel}<button
        bind:this={cancelButton}
        type="button"
        onclick={() => cancel()}>{words.cancel}</button
      >{/if}
  </div>
  <div class="sdt-sr-only" aria-live="polite">{count}</div>
  {#if fault !== null}
    <div role="alert">{words.invalidInput}</div>
  {:else}
    {#if status === "failed"}
      <div role="alert">{words.failed}</div>
    {/if}
    {#if view.shown}<div data-sdt-progress aria-hidden="true"></div>{/if}
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
              <HeaderCell
                {column}
                {order}
                describedBy={`${uid}-sort-${index}`}
                {words}
                onkeydown={sortKey}
                onblur={() => (keyShift = null)}
                onpress={(event: MouseEvent) => press(column, event)}
              />
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
            {#each rows as row (getRowId({ row }))}
              <tr class="sdt-row">
                {#each columns as column (column.id)}
                  <td class="sdt-cell"
                    >{#if typeof column.cell === "function"}{@render column.cell(
                        { row, column },
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
            >{words.sortDescription(sortState(order, column.id))}</span
          >
        {/if}
      {/each}
    </div>
  {/if}
</div>
