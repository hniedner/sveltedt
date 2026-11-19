<script lang="ts" generics="Row">
  import { defaultMessages } from "./messages.ts";
  import { nextOrder } from "./sort.ts";
  import type {
    DataTableMessages,
    DataTableProps,
    SortDirection,
  } from "./types.ts";
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
    sort = [],
    onsort,
    heading,
    actions,
  }: DataTableProps<Row> = $props();
  // Ties each sort button to its description, unique per table on the page
  const uid = $props.id();
  // An entry given as undefined keeps its default, as a translation lookup that misses gives it
  const words = $derived({
    ...defaultMessages,
    ...(Object.fromEntries(
      Object.entries(messages ?? {}).filter(([, word]) => word !== undefined),
    ) as Partial<DataTableMessages>),
  });
  const fault = $derived(
    validateTable({
      rows,
      columns,
      getRowId,
      caption,
      regionLabel,
      status,
    }),
  );
  // Counted only while the rows shown are the answer (A11Y-05)
  const count = $derived(
    fault === null && status === "ready" && !busy
      ? words.rowCount(rows.length)
      : "",
  );
  // A column's direction and rank in the order; the rank only while two or more columns are sorted (SORT-05, SORT-06)
  function sortState(id: string): {
    direction: SortDirection | null;
    rank: number | null;
  } {
    const place = sort.findIndex((entry) => entry.id === id);
    const entry = sort[place];
    if (!entry) return { direction: null, rank: null };
    return {
      direction: entry.desc ? "desc" : "asc",
      rank: sort.length > 1 ? place + 1 : null,
    };
  }
</script>

{@render heading?.()}
{@render actions?.()}
<!-- Both live elements stay in the document in every state, the invalid-input alert's included, so a change of
     their text is announced -->
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
          {#each columns as column, index (column.id)}
            {@const state = sortState(column.id)}
            <!-- aria-sort on the lead column's header only (A11Y-03) -->
            <th
              scope="col"
              aria-sort={sort[0]?.id !== column.id
                ? undefined
                : state.direction === "asc"
                  ? "ascending"
                  : "descending"}
            >
              {#if column.sortable}
                <!-- The table emits the next order and shows only the one it is given (SORT-12) -->
                <button
                  type="button"
                  aria-label={words.sortBy(column.label)}
                  aria-describedby={`${uid}-sort-${index}`}
                  onclick={(event) =>
                    onsort?.(
                      nextOrder(
                        sort,
                        column.id,
                        column.sortable ?? [],
                        event.shiftKey,
                      ),
                    )}>{column.label}</button
                >{#if state.direction}<span aria-hidden="true"
                    >{state.direction === "asc" ? "▲" : "▼"}</span
                  >{/if}{#if state.rank !== null}<span aria-hidden="true"
                    >{words.sortRank(state.rank)}</span
                  >{/if}
              {:else}
                {column.label}
              {/if}
            </th>
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
  <!-- The sort buttons' descriptions, outside the table so they are no header text -->
  <div hidden>
    {#each columns as column, index (column.id)}
      {#if column.sortable}
        <span id={`${uid}-sort-${index}`}
          >{words.sortDescription(sortState(column.id))}</span
        >
      {/if}
    {/each}
  </div>
{/if}
