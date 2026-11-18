<script lang="ts">
  import { DataTable, type DataTableColumn } from "@hniedner/sveltedt";
  import { orders, type Order } from "./orders.ts";

  const columns: DataTableColumn<Order>[] = [
    { id: "name", label: "Order", value: (order) => order.name },
  ];
</script>

<main>
  <h1>Orders</h1>
  <DataTable
    rows={orders}
    {columns}
    getRowId={(order: Order) => order.id}
    caption="Orders"
    regionLabel="Orders table"
  />
</main>
