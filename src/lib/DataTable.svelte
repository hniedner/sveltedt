<script lang="ts" generics="Row">
  import type { DataTableProps } from "./types.ts";

  const { columns, caption, regionLabel }: DataTableProps<Row> = $props();
</script>

<div role="region" aria-label={regionLabel}>
  <table>
    <caption>{caption}</caption>
    <thead>
      <tr>
        {#each columns as column (column.id)}
          <th scope="col">{column.label}</th>
        {/each}
      </tr>
    </thead>
  </table>
</div>
