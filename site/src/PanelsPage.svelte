<script lang="ts">
  import { DataTable, type DataTableColumn } from "@hniedner/sveltedt";

  // The panels page: a button in the `actions` snippet opens and closes a panel in the `panels` snippet, as the
  // WAI-ARIA disclosure pattern describes. The table keeps no open state and moves no focus, so this page does both:
  // the panel stays in the document, hidden while closed, so `aria-controls` always names it, and its "Close" button
  // puts focus back on the button that opened it.
  interface Item {
    id: string;
    name: string;
  }
  const rows: Item[] = Array.from({ length: 3 }, (_, index) => ({
    id: `r${index + 1}`,
    name: `Item ${index + 1}`,
  }));
  const columns: DataTableColumn<Item>[] = [
    { id: "name", label: "Name", value: ({ row }) => row.name },
  ];
  const getRowId = ({ row }: { row: Item }): string => row.id;
  let open = $state(false);
  let toggle = $state<HTMLButtonElement>();
  const close = (): void => {
    open = false;
    toggle?.focus();
  };
</script>

{#snippet actions()}<button
    type="button"
    bind:this={toggle}
    aria-expanded={open}
    aria-controls="advanced-search"
    onclick={() => (open = !open)}>Advanced search</button
  >{/snippet}

{#snippet panels()}<div
    id="advanced-search"
    role="group"
    aria-label="Advanced search"
    hidden={!open}
  >
    <p>The application's own search fields go here.</p>
    <button type="button" onclick={close}>Close</button>
  </div>{/snippet}

<main>
  <h1>Panels</h1>
  <DataTable
    {rows}
    {columns}
    {getRowId}
    caption="Items"
    regionLabel="Items table"
    {actions}
    {panels}
  />
</main>
