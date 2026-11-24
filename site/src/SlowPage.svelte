<script lang="ts">
  import {
    DataTable,
    type DataTableColumn,
    type DataTableStatus,
  } from "@hniedner/sveltedt";

  // The page of the real-browser slow-load tests: it mounts loading with both callbacks passed (Cancel shows from 6 seconds of loading, Try again once `status` is stopped or failed), so the clock of a test counts
  // from the mount. A test passes the consumer's next props through window.__table and reads every press of "Cancel"
  // and "Try again" from window.__calls.
  interface Item {
    id: string;
    name: string;
  }
  const table = $state<{
    rows: Item[];
    status: DataTableStatus;
    busy: boolean;
    cancel: boolean;
    retry: boolean;
  }>({ rows: [], status: "loading", busy: false, cancel: true, retry: true });

  const calls = { cancel: 0, retry: 0 };
  Object.assign(window, {
    __calls: calls,
    __table: {
      set: (next: Partial<typeof table>): void => {
        for (const key of Object.keys(next))
          if (!(key in table)) throw new Error(`unknown prop ${key}`);
        Object.assign(table, next);
      },
    },
  });

  const columns: DataTableColumn<Item>[] = [
    { id: "name", label: "Name", value: ({ row }) => row.name },
    { id: "open", label: "Link", cell: open },
  ];
  const getRowId = (item: Item): string => item.id;
  const oncancel = (): void => {
    calls.cancel += 1;
  };
  const onretry = (): void => {
    calls.retry += 1;
  };
</script>

{#snippet open(item: Item)}<a href={`#${item.id}`}>Open {item.name}</a
  >{/snippet}

{#snippet heading()}<h1><a href="#all">All orders</a></h1>{/snippet}
{#snippet actions()}<button type="button">Export</button>{/snippet}

<main>
  <DataTable
    rows={table.rows}
    {columns}
    {getRowId}
    caption="Orders"
    regionLabel="Orders table"
    status={table.status}
    busy={table.busy}
    oncancel={table.cancel ? oncancel : undefined}
    onretry={table.retry ? onretry : undefined}
    {heading}
    {actions}
  />
  <p>After the table.</p>
  <div class="tall"></div>
</main>
