<script lang="ts">
  import {
    DataTable,
    type DataTableColumn,
    type DataTableFilterState,
  } from "@hniedner/sveltedt";

  // The page of the real-browser filter dialog tests (spec/table.md section 11): Name with a text filter and Status with
  // a categorical one, over synthetic rows. `?delay=`, `?enter` and `?max=` set `searchDelay`, `searchOnEnter` and
  // `maxLength` at load. A test replaces the applied filters through window.__table.set and reads every `onfilter`
  // argument from window.__calls.
  interface Item {
    id: string;
    name: string;
    status: string;
  }
  const query = new URLSearchParams(location.search);
  const delay = query.get("delay");
  const max = query.get("max");
  const settings = {
    searchDelay: delay === null ? undefined : Number(delay),
    searchOnEnter: query.has("enter"),
    maxLength: max === null ? undefined : Number(max),
  };

  const table = $state<{
    filters: Record<string, DataTableFilterState>;
  }>({ filters: {} });
  const calls: { onfilter: unknown[] } = { onfilter: [] };
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

  const rows: Item[] = [
    { id: "r1", name: "Item 1", status: "Active" },
    { id: "r2", name: "Item 2", status: "Inactive" },
  ];
  const columns: DataTableColumn<Item>[] = [
    {
      id: "name",
      label: "Name",
      value: ({ row }) => row.name,
      filter: { kind: "text" },
    },
    {
      id: "status",
      label: "Status",
      value: ({ row }) => row.status,
      filter: {
        kind: "categorical",
        options: [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
      },
    },
  ];
  const getRowId = ({ row }: { row: Item }): string => row.id;
  const nothing = (): void => undefined;
</script>

<main>
  <h1>Filter dialog</h1>
  <DataTable
    {rows}
    {columns}
    {getRowId}
    caption="Items"
    regionLabel="Items table"
    filters={table.filters}
    onfilter={(change) => {
      const copy: unknown = structuredClone(change);
      calls.onfilter.push(copy);
    }}
    onclearfilter={nothing}
    onclearfilters={nothing}
    searchDelay={settings.searchDelay}
    searchOnEnter={settings.searchOnEnter}
    maxLength={settings.maxLength}
  />
</main>
