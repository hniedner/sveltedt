<script lang="ts" generics="Row">
  import type { TableFault } from "../faults.js";
  import { badges, resetShown } from "../filters.js";
  import type { DataTableMessages, DataTableProps } from "../types.js";

  type Props = Pick<
    DataTableProps<Row>,
    | "columns"
    | "filters"
    | "criteria"
    | "onclearfilter"
    | "onclearfilters"
    | "onreset"
  > & { fault: TableFault | null; words: DataTableMessages };

  const {
    fault,
    columns,
    filters,
    words,
    criteria,
    onclearfilter,
    onclearfilters,
    onreset,
  }: Props = $props();
  // The applied filters as badges; none while the alert shows, as the table cannot vouch for filters it could not
  // validate (FILT-08)
  const badgeList = $derived(
    fault === null ? badges(columns, filters, words) : [],
  );
</script>

<!-- No element of its own: the controls render in place, in this order, as the table's direct children. A wrapper, a
     role="toolbar" included, would change the document and how it reads -->
{#each badgeList as badge (badge.id)}
  <!-- A badge exists only for a column with a filter, so the table has an onclearfilter (FILT-32) -->
  <button
    type="button"
    aria-label={words.clearFilter(badge.text)}
    onclick={() =>
      // Stryker disable next-line OptionalChaining: unreachable fallback, a badge exists only with an onclearfilter (FILT-32)
      onclearfilter?.({ id: badge.id })}>{badge.text}</button
  >
{/each}
{@render criteria?.()}
{#if badgeList.length > 0}
  <button
    type="button"
    onclick={() =>
      // Stryker disable next-line OptionalChaining: unreachable fallback, the table has an onclearfilters (FILT-32)
      onclearfilters?.()}>{words.clearFilters}</button
  >
{/if}
{#if resetShown(fault, columns, onreset)}
  <button
    type="button"
    onclick={() =>
      // Stryker disable next-line OptionalChaining: unreachable fallback, the button shows only with an onreset (FILT-30)
      onreset?.()}>{words.reset}</button
  >
{/if}
