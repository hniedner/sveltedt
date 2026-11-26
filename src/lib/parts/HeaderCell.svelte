<script lang="ts" generics="Row">
  import { sortState } from "../sort.js";
  import type {
    DataTableColumn,
    DataTableMessages,
    DataTableSortEntry,
    SortDirection,
  } from "../types.js";
  import ColumnFilter from "./ColumnFilter.svelte";

  interface Props {
    column: DataTableColumn<Row>;
    order: readonly DataTableSortEntry[];
    // The id of the hidden description of this column's sort button
    describedBy: string;
    words: DataTableMessages;
    // The table's handlers: the Shift state they share is the table's, one for all its sort buttons
    onkeydown: (event: KeyboardEvent) => void;
    onblur: () => void;
    onpress: (event: MouseEvent) => void;
  }

  const {
    column,
    order,
    describedBy,
    words,
    onkeydown,
    onblur,
    onpress,
  }: Props = $props();
  // The direction mark of a sorted column (SORT-13)
  const arrow = (direction: SortDirection): string =>
    direction === "asc" ? "▲" : "▼";
  const state = $derived(sortState(order, column.id));
</script>

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
      aria-describedby={describedBy}
      {onkeydown}
      {onblur}
      onclick={onpress}>{column.label}</button
    >{#if state.direction}<span aria-hidden="true"
        >{arrow(state.direction)}</span
      >{/if}{#if state.rank !== null}<span aria-hidden="true"
        >{words.sortRank(state.rank)}</span
      >{/if}
  {:else}
    {column.label}
  {/if}{#if column.filter}<ColumnFilter label={column.label} {words} />{/if}
</th>
