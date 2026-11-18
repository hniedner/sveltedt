<script lang="ts" generics="Row">
  import type { DataTableProps } from "./types.ts";

  const { rows, columns, getRowId, caption, regionLabel }: DataTableProps<Row> =
    $props();
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
    <tbody>
      {#each rows as row (getRowId(row))}
        <tr>
          {#each columns as column (column.id)}
            <td>{column.value?.(row)}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
