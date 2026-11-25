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
  // Every value a test selects in Status, so no test mounts a table that DataTable refuses
  const statusOptions = [
    "active",
    "inactive",
    "a.b",
    "x-(1)",
    "a/b",
    "*+?[]{}\\$^",
    "a|b",
  ].map((value) => ({ value, label: value }));
  const columns: DataTableColumn<Row>[] = [
    {
      id: "name",
      label: "Name",
      value: ({ row }) => row.name,
      sortable: ["asc", "desc"],
      filter: { kind: "text" },
    },
    // `code` and `status` only give the intents three ids; their values are not meant to match the labels. Each column
    // has a filter, so the table takes the filter intents; the options of Status are every value a test selects.
    {
      id: "code",
      label: "Code",
      value: ({ row }) => row.id,
      sortable: ["asc", "desc"],
      filter: { kind: "text" },
    },
    {
      id: "status",
      label: "Status",
      value: ({ row }) => row.name,
      sortable: ["asc", "desc"],
      filter: {
        kind: "categorical",
        options: statusOptions,
        emptyOption: true,
      },
    },
  ];
  const getRowId = ({ row }: { row: Row }): string => row.id;
</script>

<DataTable
  rows={connection.table.rows}
  {columns}
  {getRowId}
  caption="Rows"
  regionLabel="Rows table"
  status={connection.table.status}
  busy={connection.table.busy}
  sort={connection.table.sort}
  onsort={connection.table.onsort}
  filters={connection.table.filters}
  onfilter={connection.table.onfilter}
  onclearfilter={connection.table.onclearfilter}
  onclearfilters={connection.table.onclearfilters}
  search={connection.table.search}
/>
{#if connection.pager}
  <Pagination
    offset={connection.pager.offset}
    limit={connection.pager.limit}
    total={connection.pager.total}
    unfilteredTotal={connection.pager.unfilteredTotal}
    onpage={connection.pager.onpage}
    sizes={[10, 25]}
    onsize={connection.pager.onsize}
    label="Rows pages"
  />
{/if}
