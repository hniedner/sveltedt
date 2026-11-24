<script lang="ts">
  // The fixture of RND-10, RND-14 and the EXP statements: the heading and actions snippets declared in markup, as a
  // consumer writes them. Each is passed only when its flag is set; the table's other props are passed on as given.
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
    status,
    busy,
    messages,
    onretry,
    withHeading = false,
    withActions = false,
    withQuietActions = false,
  }: Omit<DataTableProps<Item>, "heading" | "actions"> & {
    withHeading?: boolean;
    // An actions snippet holding the button "Export"
    withActions?: boolean;
    // An actions snippet holding no control (EXP-01)
    withQuietActions?: boolean;
  } = $props();
</script>

{#snippet heading()}
  <h2>Orders</h2>
{/snippet}

{#snippet actions()}
  <button type="button">Export</button>
{/snippet}

{#snippet quietActions()}
  <span>Tools</span>
{/snippet}

<DataTable
  {rows}
  {columns}
  {getRowId}
  {caption}
  {regionLabel}
  {status}
  {busy}
  {messages}
  {onretry}
  heading={withHeading ? heading : undefined}
  actions={withActions ? actions : withQuietActions ? quietActions : undefined}
/>
