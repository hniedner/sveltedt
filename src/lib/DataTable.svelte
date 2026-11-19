<script lang="ts" generics="Row">
  import type { DataTableProps } from "./types.ts";
  import { validateTable } from "./validate.ts";

  const {
    rows,
    columns,
    getRowId,
    caption,
    regionLabel,
    status = "ready",
    heading,
    actions,
  }: DataTableProps<Row> = $props();
  const fault = $derived(
    validateTable({ rows, columns, getRowId, caption, regionLabel }),
  );
</script>

{@render heading?.()}
{@render actions?.()}
{#if fault}
  <div role="alert">{fault}</div>
{:else}
  <div role="status">{status === "loading" ? "Loading data…" : ""}</div>
  {#if status === "failed"}
    <div role="alert">The data could not be loaded.</div>
  {/if}
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
        {#if status === "ready"}
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
            <tr><td colspan={columns.length}>No data.</td></tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
{/if}
