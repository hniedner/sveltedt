<script lang="ts">
  import { DataTable, type DataTableColumn } from "@hniedner/sveltedt";

  // The page of the real-browser filter tests: a sortable Name, a sortable Region with a text filter and a Link with a
  // text filter, over synthetic rows. Nothing sorts or filters here; the handlers the table requires do nothing.
  interface Item {
    id: string;
    name: string;
    region: string;
  }
  const regions = ["North", "South", "East", "West", "Central"];
  const rows: Item[] = Array.from({ length: 5 }, (_, index) => ({
    id: `r${index + 1}`,
    name: `Item ${index + 1}`,
    region: regions[index] ?? "",
  }));
  const columns: DataTableColumn<Item>[] = [
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
      filter: { kind: "text" },
    },
    { id: "open", label: "Link", cell: open, filter: { kind: "text" } },
  ];
  const getRowId = (item: Item): string => item.id;
  const nothing = (): void => undefined;
</script>

{#snippet open(item: Item)}<a href={`#${item.id}`}>Open {item.name}</a
  >{/snippet}

<main>
  <h1>Filters</h1>
  <DataTable
    {rows}
    {columns}
    {getRowId}
    caption="Items"
    regionLabel="Items table"
    onsort={nothing}
    onfilter={nothing}
    onclearfilter={nothing}
    onclearfilters={nothing}
  />
</main>
