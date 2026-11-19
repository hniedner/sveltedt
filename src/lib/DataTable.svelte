<script lang="ts" generics="Row">
  import { defaultMessages } from "./messages.ts";
  import type { DataTableProps } from "./types.ts";
  import { validateTable } from "./validate.ts";

  const {
    rows,
    columns,
    getRowId,
    caption,
    regionLabel,
    status = "ready",
    busy = false,
    messages,
    heading,
    actions,
  }: DataTableProps<Row> = $props();
  const words = $derived({ ...defaultMessages, ...messages });
  const fault = $derived(
    validateTable(
      { rows, columns, getRowId, caption, regionLabel, status },
      words,
    ),
  );
  // Counted only while the rows shown are the answer (A11Y-05)
  const count = $derived(
    status === "ready" && !busy ? words.rowCount(rows.length) : "",
  );
</script>

{@render heading?.()}
{@render actions?.()}
{#if fault}
  <div role="alert">{fault}</div>
{:else}
  <!-- Both live elements stay in the document in every state, so a change of their text is announced -->
  <div role="status">{status === "loading" ? words.loading : ""}</div>
  <div class="sr-only" aria-live="polite">{count}</div>
  {#if status === "failed"}
    <div role="alert">{words.failed}</div>
  {/if}
  <div role="region" aria-label={regionLabel}>
    <table aria-busy={busy || status === "loading"}>
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
            <tr><td colspan={columns.length}>{words.empty}</td></tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
{/if}
