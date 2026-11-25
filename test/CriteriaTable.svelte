<script lang="ts">
  // The fixture of FILT-31, EXP-04 and EXP-06: the criteria snippet declared in markup, as a consumer writes it. It
  // holds the button "Clear my criteria". `withActions` adds an actions snippet ("Export") and `withPanels` a panels
  // snippet (a block holding "Apply search"); the table's other props are passed on as given.
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
    status,
    busy,
    onfilter,
    onclearfilter,
    onclearfilters,
    onreset,
    onretry,
    withActions = false,
    withPanels = false,
  }: Omit<DataTableProps<Item>, "criteria" | "actions" | "panels"> & {
    withActions?: boolean;
    withPanels?: boolean;
  } = $props();
</script>

{#snippet criteria()}
  <button type="button">Clear my criteria</button>
{/snippet}

{#snippet actions()}
  <button type="button">Export</button>
{/snippet}

{#snippet panels()}
  <div><button type="button">Apply search</button></div>
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
  {status}
  {busy}
  {onfilter}
  {onclearfilter}
  {onclearfilters}
  {onreset}
  {onretry}
  {criteria}
  actions={withActions ? actions : undefined}
  panels={withPanels ? panels : undefined}
/>
