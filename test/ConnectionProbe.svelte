<script lang="ts">
  // The probe of the connection helper's tests (see Conventions, Layer, in spec/connection.md): it calls
  // createConnection in its script, as an application's component does, so the helper's onMount runs during this
  // component's initialisation; it hands what the helper returns to `onconnect` and renders DataTable with its table
  // props and, once the pager props are given, Pagination with them.
  import { untrack } from "svelte";
  import DataTable from "../src/lib/DataTable.svelte";
  import Pagination from "../src/lib/Pagination.svelte";
  import { createConnection } from "../src/lib/connection/index.js";
  import type {
    Connection,
    ConnectionOptions,
  } from "../src/lib/connection/index.ts";
  import type { DataTableColumn } from "../src/lib/types.ts";

  interface Row {
    id: string;
    name: string;
  }
  const {
    options,
    onconnect,
  }: {
    options: ConnectionOptions;
    onconnect: (connection: Connection<Row>) => void;
  } = $props();
  // The probe never changes its options, so what the helper reads of them at each request stays the same.
  const connection = untrack(() => createConnection<Row>(options));
  untrack(() => onconnect(connection));
  const columns: DataTableColumn<Row>[] = [
    { id: "name", label: "Name", value: ({ row }) => row.name },
  ];
  const getRowId = (row: Row): string => row.id;
</script>

<DataTable
  rows={connection.table.rows}
  {columns}
  {getRowId}
  caption="Rows"
  regionLabel="Rows table"
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
    label="Rows pages"
  />
{/if}
