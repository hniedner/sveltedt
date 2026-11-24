<script lang="ts">
  // RND-02's fixture: a cell snippet declared in markup, as a consumer writes one. It renders a link naming its row
  // and its column id, so the test reads both fields of its one argument from the page.
  import DataTable from "../src/lib/DataTable.svelte";
  import type { DataTableColumn } from "../src/lib/types.ts";

  interface Item {
    id: string;
    name: string;
  }

  // `nameValue`: the Name column's value, a function unless a test passes what a plain JavaScript caller might (RND-05)
  const {
    rows,
    nameValue = ({ row }: { row: Item }) => row.name,
    identity = false,
  }: {
    rows: readonly Item[];
    nameValue?: unknown;
    identity?: boolean;
  } = $props();
  // The snippet column second and with a value too: the snippet wins, and gets its own column
  const columns: DataTableColumn<Item>[] = $derived([
    { id: "id", label: "Id", value: ({ row }: { row: Item }) => row.id },
    {
      id: "name",
      label: "Name",
      value: nameValue as (context: { readonly row: Item }) => string,
      cell: link,
    },
  ]);
  const getRowId = ({ row }: { row: Item }): string => row.id;
</script>

{#snippet link({ row, column }: { row: Item; column: DataTableColumn<Item> })}
  <a href="#{row.id}">Open {row.name} in {column.id}</a>
  {#if identity}
    <!-- RND-18: whether the snippet got the given row and the given Name column themselves -->
    <span
      >{rows.includes(row) && column === columns[1]
        ? "given row and column"
        : "another row or column"}</span
    >
  {/if}
{/snippet}

<DataTable
  {rows}
  {columns}
  {getRowId}
  caption="Orders"
  regionLabel="Orders table"
/>
