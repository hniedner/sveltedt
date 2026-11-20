<script lang="ts">
  import {
    DataTable,
    type DataTableColumn,
    type DataTableSortEntry,
    type DataTableStatus,
  } from "@hniedner/sveltedt";

  // The page of the real-browser sort tests: three sortable columns over synthetic rows. It never sorts: a test
  // passes the consumer's steps (sort, rows, status, busy) through window.__table and reads every onsort call from
  // window.__sorts.
  interface Item {
    id: string;
    code: string;
    name: string;
    region: string;
  }
  const regions = ["North", "South", "East", "West", "Central"];
  const initial: Item[] = Array.from({ length: 25 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return {
      id: `r${number}`,
      code: `C${number}`,
      name: `Item ${number}`,
      region: regions[index % regions.length] ?? "",
    };
  });
  const state = $state<{
    rows: Item[];
    sort: DataTableSortEntry[];
    status: DataTableStatus;
    busy: boolean;
  }>({ rows: initial, sort: [], status: "ready", busy: false });

  const sorts: DataTableSortEntry[][] = [];
  Object.assign(window, {
    __sorts: sorts,
    __table: {
      set: (next: Partial<typeof state>): void => {
        Object.assign(state, next);
      },
    },
  });

  const columns: DataTableColumn<Item>[] = [
    {
      id: "code",
      label: "Code",
      value: (r) => r.code,
      sortable: ["asc", "desc"],
    },
    {
      id: "name",
      label: "Name",
      value: (r) => r.name,
      sortable: ["asc", "desc"],
    },
    {
      id: "region",
      label: "Region",
      value: (r) => r.region,
      sortable: ["asc", "desc"],
    },
    { id: "open", label: "Link", cell: open },
  ];
  const getRowId = (item: Item): string => item.id;
  const onsort = (next: DataTableSortEntry[]): void => {
    sorts.push(next);
  };
</script>

{#snippet open(item: Item)}<a href={`#${item.id}`}>Open {item.code}</a
  >{/snippet}

<main>
  <h1>Sort</h1>
  <DataTable
    rows={state.rows}
    {columns}
    {getRowId}
    caption="Items"
    regionLabel="Items table"
    sort={state.sort}
    status={state.status}
    busy={state.busy}
    {onsort}
  />
</main>
