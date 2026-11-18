<script lang="ts">
  // RND-10's and EXP-02's fixture: the heading and actions snippets declared in markup, as a consumer writes them.
  // Each is passed only when its flag is set, so a test chooses which of the two the table gets.
  import DataTable from "../src/lib/DataTable.svelte";
  import type { DataTableProps } from "../src/lib/types.ts";

  interface Item {
    id: string;
    name: string;
  }

  const {
    rows,
    columns,
    getRowId,
    caption,
    regionLabel,
    withHeading = false,
    withActions = false,
  }: Omit<DataTableProps<Item>, "heading" | "actions"> & {
    withHeading?: boolean;
    withActions?: boolean;
  } = $props();
</script>

{#snippet heading()}
  <h2>Orders</h2>
{/snippet}

{#snippet actions()}
  <button type="button">Export</button>
{/snippet}

<DataTable
  {rows}
  {columns}
  {getRowId}
  {caption}
  {regionLabel}
  heading={withHeading ? heading : undefined}
  actions={withActions ? actions : undefined}
/>
