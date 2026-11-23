<script lang="ts">
  import { DataTable, type DataTableColumn } from "@hniedner/sveltedt";

  // The page of the host-independence statements (THEME-10, THEME-11): the table of THEME-10 over synthetic rows, as
  // many as ?rows= says (default 2); with ?app it sits inside an element with class app and a second table follows
  // outside it (THEME-11)
  interface Item {
    id: string;
    name: string;
  }
  const params = new URLSearchParams(location.search);
  const count = Number(params.get("rows") ?? 2);
  const rows: Item[] = Array.from({ length: count }, (_, index) => ({
    id: `r${index + 1}`,
    name: `Item ${index + 1}`,
  }));
  const columns: DataTableColumn<Item>[] = [
    { id: "id", label: "Id", value: (row) => row.id },
    { id: "name", label: "Name", value: (row) => row.name },
  ];
  const getRowId = (row: Item): string => row.id;
</script>

{#snippet table(caption: string, regionLabel: string)}
  <DataTable {rows} {columns} {getRowId} {caption} {regionLabel} />
{/snippet}

{#if params.has("app")}
  <div class="app">{@render table("Orders", "Orders table")}</div>
  {@render table("Other", "Other table")}
{:else}
  {@render table("Orders", "Orders table")}
{/if}
