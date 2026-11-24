<script lang="ts">
  import {
    DataTable,
    Pagination,
    type DataTableColumn,
  } from "@hniedner/sveltedt";
  import { createConnection } from "@hniedner/sveltedt/connection";
  import type { Order } from "./orders.ts";

  const columns: DataTableColumn<Order>[] = [
    { id: "name", label: "Order", value: (order) => order.name },
  ];
  // The page's transport (spec/site.md, section 8): the request goes to the site's route in the bracketed form and the
  // parsed body comes back. It rejects on a non-2xx answer, a network failure or a body that is not JSON, and the helper
  // does not handle a rejection of `send` (src/lib/connection/types.ts), so each goes unhandled in this page
  async function send(
    request: URLSearchParams,
    signal: AbortSignal,
  ): Promise<unknown> {
    const answer = await fetch(`/api/orders?${request}`, { signal });
    if (!answer.ok) throw new Error(`The route answered ${answer.status}.`);
    return answer.json();
  }
  const connection = createConnection<Order>({
    send,
    columns: [
      { data: "id", name: "id" },
      { data: "name", name: "name", id: "name" },
    ],
    query: { limit: 10 },
    onerror: (error) => console.error(error),
  });
  const getRowId = (order: Order): string => order.id;
</script>

<main>
  <h1>Orders</h1>
  <DataTable
    rows={connection.table.rows}
    {columns}
    {getRowId}
    caption="Orders"
    regionLabel="Orders table"
    status={connection.table.status}
    busy={connection.table.busy}
  />
  {#if connection.pager}
    <Pagination
      offset={connection.pager.offset}
      limit={connection.pager.limit}
      total={connection.pager.total}
      unfilteredTotal={connection.pager.unfilteredTotal}
      onpage={connection.pager.onpage}
      label="Orders pages"
    />
  {/if}
</main>
