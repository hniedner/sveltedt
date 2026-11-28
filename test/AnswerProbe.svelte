<script lang="ts">
  // The probe of a categorical press an application answers at once: it plays an application whose `onfilter` sets its
  // own `$state` `filters` to `answer` (no `flushSync`), so the answer is rendered after the press's handler has
  // returned, as an application's is. A `rerender` of the testing library runs `flushSync` and cannot play this.
  import DataTable from "../src/lib/DataTable.svelte";
  import type {
    DataTableColumn,
    DataTableFilterState,
  } from "../src/lib/types.ts";

  interface Row {
    id: string;
    name: string;
  }
  const { answer }: { answer: string[] } = $props();
  const columns: DataTableColumn<Row>[] = [
    {
      id: "status",
      label: "Status",
      value: ({ row }) => row.name,
      filter: {
        kind: "categorical",
        options: [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
      },
    },
  ];
  let filters: Record<string, DataTableFilterState> = $state({
    status: { kind: "categorical", selected: ["inactive"] },
  });
</script>

<DataTable
  rows={[{ id: "r1", name: "Alpha" }]}
  {columns}
  getRowId={({ row }: { row: Row }) => row.id}
  caption="Orders"
  regionLabel="Orders table"
  {filters}
  onfilter={() => {
    filters = { status: { kind: "categorical", selected: answer } };
  }}
  onclearfilter={() => undefined}
  onclearfilters={() => undefined}
/>
