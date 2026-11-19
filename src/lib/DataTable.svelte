<script lang="ts" generics="Row">
  import { defaultMessages } from "./messages.ts";
  import type { DataTableMessages, DataTableProps } from "./types.ts";
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
  // An entry given as undefined keeps its default, as a translation lookup that misses gives it
  const words = $derived({
    ...defaultMessages,
    ...(Object.fromEntries(
      Object.entries(messages ?? {}).filter(([, word]) => word !== undefined),
    ) as Partial<DataTableMessages>),
  });
  const fault = $derived(
    validateTable({ rows, columns, getRowId, caption, regionLabel, status }),
  );
  // Counted only while the rows shown are the answer (A11Y-05)
  const count = $derived(
    fault === null && status === "ready" && !busy
      ? words.rowCount(rows.length)
      : "",
  );
</script>

{@render heading?.()}
{@render actions?.()}
<!-- Both live elements stay in the document in every state, the alert's included, so a change of their text is
     announced -->
<div role="status">
  {fault === null && status === "loading" ? words.loading : ""}
</div>
<div class="sr-only" aria-live="polite">{count}</div>
{#if fault !== null}
  <div role="alert">{words[fault]}</div>
{:else}
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
