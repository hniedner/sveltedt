<script lang="ts">
  import {
    DataTable,
    type DataTableColumn,
    type DataTableStatus,
  } from "@hniedner/sveltedt";
  // The page of the real-browser tests of the table (keyboard, focus, states, scroll), served twice, as table.html and
  // table-plain.html: a table of ?cols= columns (default 3) and ?rows= rows (default 25), "Name" first. With ?link the
  // first column's cell is a link "Open <name>", with ?edit the second column's is "Edit <name>", with ?heading a link
  // "All orders" stands in the heading. A test changes the number of columns, the number of rows, the status, busy and
  // whether the table is mounted through window.__table.set; every set gives the rows new ids (a generation prefix, as
  // a refetch would). ?status= mounts in that status (an unknown one is the invalid-input alert) and ?busy with busy;
  // ?long puts 2000 px above and below a box of fixed height and leaves the table unmounted until a test sets mounted
  interface Item {
    id: string;
    name: string;
  }
  const params = new URLSearchParams(location.search);
  const table = $state({
    cols: Number(params.get("cols") ?? 3),
    rows: Number(params.get("rows") ?? 25),
    status: (params.get("status") ?? "ready") as DataTableStatus,
    busy: params.has("busy"),
    mounted: !params.has("long"),
  });
  let generation = $state(1);
  Object.assign(window, {
    __table: {
      set: (next: Partial<typeof table>): void => {
        for (const key of Object.keys(next))
          if (!(key in table)) throw new Error(`unknown prop ${key}`);
        Object.assign(table, next);
        generation += 1;
      },
    },
  });

  const names = ["Beta", "Gamma"];
  const rows: Item[] = $derived(
    Array.from({ length: table.rows }, (_, index) => ({
      id: `g${generation}-r${String(index + 1).padStart(2, "0")}`,
      name: names[index] ?? `Item ${String(index + 1).padStart(2, "0")}`,
    })),
  );
  const getRowId = ({ row }: { row: Item }): string => row.id;
  const columns: DataTableColumn<Item>[] = $derived(
    Array.from({ length: table.cols }, (_, index) => {
      const n = index + 1;
      const label = n === 1 ? "Name" : `Column ${String(n).padStart(2, "0")}`;
      const value = ({ row }: { row: Item }): string =>
        n === 1 ? row.name : `${row.name} ${n}`;
      if (n === 1 && params.has("link")) return { id: "c1", label, cell: open };
      if (n === 2 && params.has("edit")) return { id: "c2", label, cell: edit };
      return { id: `c${n}`, label, value };
    }),
  );
</script>

{#snippet open({ row }: { row: Item })}<a href={`#${row.id}`}>Open {row.name}</a
  >{/snippet}
{#snippet edit({ row }: { row: Item })}<a href={`#${row.id}-edit`}
    >Edit {row.name}</a
  >{/snippet}
{#snippet heading()}<h1><a href="#all">All orders</a></h1>{/snippet}
{#snippet actions()}<button type="button">Export</button>{/snippet}

{#snippet view()}
  {#if table.mounted}
    <DataTable
      {rows}
      {columns}
      {getRowId}
      caption="Orders"
      regionLabel="Orders table"
      status={table.status}
      busy={table.busy}
      heading={params.has("heading") ? heading : undefined}
      {actions}
    />
  {/if}
{/snippet}

<main>
  {#if params.has("long")}
    <div class="spacer"></div>
    <div class="box">{@render view()}</div>
    <div class="spacer"></div>
  {:else}
    {@render view()}
  {/if}
  <p><a href="#after">After the table</a></p>
</main>
