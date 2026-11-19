<script lang="ts">
  // RND-02's fixture: a cell snippet declared in markup, as a consumer writes one. It renders a link naming its row
  // and its column id, so the test reads both arguments from the page.
  import DataTable from "../src/lib/DataTable.svelte";
  import type { DataTableColumn } from "../src/lib/types.ts";

  interface Item {
    id: string;
    name: string;
  }

  // `nameValue`: the Name column's value, a function unless a test passes what a plain JavaScript caller might (RND-05)
  const {
    rows,
    nameValue = (row: Item) => row.name,
  }: { rows: readonly Item[]; nameValue?: unknown } = $props();
  // The snippet column second and with a value too: the snippet wins, and gets its own column's id
  const columns: DataTableColumn<Item>[] = $derived([
    { id: "id", label: "Id", value: (row) => row.id },
    {
      id: "name",
      label: "Name",
      value: nameValue as (row: Item) => string,
      cell: link,
    },
  ]);
  const getRowId = (row: Item): string => row.id;
</script>

{#snippet link(row: Item, columnId: string)}
  <a href="#{row.id}">Open {row.name} in {columnId}</a>
{/snippet}

<DataTable
  {rows}
  {columns}
  {getRowId}
  caption="Orders"
  regionLabel="Orders table"
/>
