<script lang="ts">
  import {
    DataTable,
    type DataTableColumn,
    type DataTableSortEntry,
  } from "@hniedner/sveltedt";
  import { orders, type Order } from "./orders.ts";

  const columns: DataTableColumn<Order>[] = [
    {
      id: "name",
      label: "Order",
      value: (order) => order.name,
      sortable: ["asc", "desc"],
    },
  ];
  // The page sorts its own fixed list, as an application asks its server to: the site's server answers files only
  let sort = $state<DataTableSortEntry[]>([]);
  function onsort(next: DataTableSortEntry[]): void {
    sort = next;
  }
  const rows = $derived(
    sort[0] === undefined
      ? orders
      : orders.toSorted(
          (a, b) => a.name.localeCompare(b.name) * (sort[0]?.desc ? -1 : 1),
        ),
  );
  // Typed here, not inline: svelte-check infers an inline callback's row type, but the type-aware lint does not
  // and reads it as any
  const getRowId = (order: Order): string => order.id;
</script>

<main>
  <h1>Orders</h1>
  <DataTable
    {rows}
    {columns}
    {getRowId}
    caption="Orders"
    regionLabel="Orders table"
    {sort}
    {onsort}
  />
</main>
