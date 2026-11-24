<script lang="ts">
  import { DataTable } from "@hniedner/sveltedt";
  import type { DataTableColumn } from "@hniedner/sveltedt";
  import { orders } from "../lib/orders.ts";
  import type { Order } from "../lib/orders.ts";

  const columns: DataTableColumn<Order>[] = [
    { id: "name", label: "Order", value: ({ row }) => row.name },
  ];
</script>

<DataTable
  rows={orders}
  {columns}
  getRowId={(order) => order.id}
  caption="Orders"
  regionLabel="Orders"
/>
