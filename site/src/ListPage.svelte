<script lang="ts">
  import {
    DataTable,
    Pagination,
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
  let offset = $state(0);
  let limit = $state(25);
  // A sort draws from the first page, as DataTables does
  function onsort(next: DataTableSortEntry[]): void {
    sort = next;
    offset = 0;
  }
  function onpage(next: number): void {
    offset = next;
  }
  // The offset of the page of the new size that holds the first row shown, as DataTables and CONN-27 do
  function onsize(next: number): void {
    offset -= offset % next;
    limit = next;
  }
  const sorted = $derived(
    sort[0] === undefined
      ? orders
      : orders.toSorted(
          (a, b) =>
            a.name.localeCompare(b.name) *
            (sort[0]?.direction === "desc" ? -1 : 1),
        ),
  );
  const rows = $derived(sorted.slice(offset, offset + limit));
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
  <Pagination
    {offset}
    {limit}
    total={sorted.length}
    label="Orders pages"
    sizes={[5, 10, 25]}
    {onpage}
    {onsize}
  />
</main>
