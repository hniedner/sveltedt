<script lang="ts">
  // The fixture of FILT-31: the criteria snippet declared in markup, as a consumer writes it. It holds the button
  // "Clear my criteria"; the table's other props are passed on as given.
  import DataTable from "../src/lib/DataTable.svelte";
  import type { DataTableProps } from "../src/lib/types.ts";

  interface Item {
    id: string;
    name: string;
    code: string;
    status: string;
    note: string;
  }

  const {
    rows,
    columns,
    getRowId,
    caption,
    regionLabel,
    sort,
    onsort,
    filters,
    onfilter,
    onclearfilter,
    onclearfilters,
    onreset,
  }: Omit<DataTableProps<Item>, "criteria"> = $props();
</script>

{#snippet criteria()}
  <button type="button">Clear my criteria</button>
{/snippet}

<DataTable
  {rows}
  {columns}
  {getRowId}
  {caption}
  {regionLabel}
  {sort}
  {onsort}
  {filters}
  {onfilter}
  {onclearfilter}
  {onclearfilters}
  {onreset}
  {criteria}
/>
