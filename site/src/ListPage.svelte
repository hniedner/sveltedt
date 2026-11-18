<script lang="ts">
  import { DataTable, type DataTableColumn } from "@hniedner/sveltedt";
  import { orders, type Order } from "./orders.ts";

  const columns: DataTableColumn<Order>[] = [
    { id: "name", label: "Order", value: (order) => order.name },
  ];
  // Typed here, not inline: svelte-check infers an inline callback's row type, but the type-aware lint does not
  // and reads it as any
  const getRowId = (order: Order): string => order.id;
</script>

<main>
  <h1>Orders</h1>
  <DataTable
    rows={orders}
    {columns}
    {getRowId}
    caption="Orders"
    regionLabel="Orders table"
  />
</main>
