<script lang="ts" generics="Row">
  import type { DataTableProps } from "./types.ts";

  const { rows, columns, getRowId, caption, regionLabel }: DataTableProps<Row> =
    $props();
</script>

<div role="region" aria-label={regionLabel}>
  <table>
    <caption>{caption}</caption>
    <thead
      class="bg-[var(--sdt-header-surface,ButtonFace)] text-[var(--sdt-header-text,ButtonText)]"
    >
      <tr>
        {#each columns as column (column.id)}
          <th scope="col">{column.label}</th>
        {/each}
      </tr>
    </thead>
    <tbody class="divide-y divide-[var(--sdt-border,GrayText)]">
      {#each rows as row (getRowId(row))}
        <tr>
          {#each columns as column (column.id)}
            <td
              >{#if column.cell}{@render column.cell(
                  row,
                  column.id,
                )}{:else}{column.value?.(row)}{/if}</td
            >
          {/each}
        </tr>
      {:else}
        <tr><td colspan={columns.length}>No records.</td></tr>
      {/each}
    </tbody>
  </table>
</div>
