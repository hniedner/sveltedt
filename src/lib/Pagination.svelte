<!-- Adapted from ontoprism, frontend/src/lib/components/Pagination.svelte (Apache License 2.0, the owner's own
     project): the nav, the aria-disabled step buttons, the keyed number row and its gaps. -->
<script lang="ts">
  import { defaultPagerMessages, mergeMessages } from "./messages.js";
  import { pageNumbers, pagerState, validatePager } from "./pager.js";
  import type { PaginationProps } from "./types.js";

  const props: PaginationProps = $props();
  const words = $derived(mergeMessages(defaultPagerMessages, props.messages));
  const fault = $derived(validatePager(props));
  const state = $derived(pagerState(props.offset, props.limit, props.total));
  const items = $derived(pageNumbers(state.page - 1, state.pages));
  const sizes = $derived(props.sizes ?? []);
  // The information line; the unfiltered total follows only when it differs (PAGE-37, PAGE-38)
  const info = $derived(
    words.info({
      first: state.firstRow,
      last: state.lastRow,
      total: props.total,
    }) +
      (props.unfilteredTotal != null && props.unfilteredTotal !== props.total
        ? ` ${words.infoFiltered(props.unfilteredTotal)}`
        : ""),
  );

  // A step that cannot move stays a focusable button and emits nothing (PAGE-05, PAGE-13)
  function step(can: boolean, offset: number): void {
    if (can) props.onpage(offset);
  }

  // The select shows `limit` again until the consumer passes a new one (PAGE-22)
  function choose(event: Event & { currentTarget: HTMLSelectElement }): void {
    const size = Number(event.currentTarget.value);
    event.currentTarget.value = String(props.limit);
    props.onsize?.(size);
  }
</script>

{#if fault !== null}
  <div role="alert">{words[fault]}</div>
{:else}
  <nav class="sdt-pager" aria-label={props.label}>
    {#if sizes.length > 0}
      <label
        >{words.sizeLabel}
        <select value={props.limit} onchange={choose}>
          {#each sizes as size (size)}
            <option value={size}>{words.sizeOption(size)}</option>
          {/each}
        </select></label
      >
    {/if}
    <span>{info}</span>
    <button
      type="button"
      aria-label={words.firstPage}
      aria-disabled={!state.canPrevious}
      onclick={() => step(state.canPrevious, 0)}
      ><span aria-hidden="true">«</span></button
    >
    <button
      type="button"
      aria-label={words.previousPage}
      aria-disabled={!state.canPrevious}
      onclick={() => step(state.canPrevious, state.previous)}
      ><span aria-hidden="true">‹</span></button
    >
    {#each items as item (item)}
      {#if typeof item === "number"}
        <!-- The current page emits only when `offset` is off its own grid offset (PAGE-12, PAGE-27) -->
        <button
          type="button"
          aria-label={words.pageLabel(item + 1)}
          aria-current={item + 1 === state.current ? "page" : undefined}
          onclick={() =>
            step(item * props.limit !== props.offset, item * props.limit)}
          >{words.pageNumber(item + 1)}</button
        >
      {:else}
        <span aria-hidden="true">…</span>
      {/if}
    {/each}
    <button
      type="button"
      aria-label={words.nextPage}
      aria-disabled={!state.canNext}
      onclick={() => step(state.canNext, state.next)}
      ><span aria-hidden="true">›</span></button
    >
    <button
      type="button"
      aria-label={words.lastPage}
      aria-disabled={!state.canNext}
      onclick={() => step(state.canNext, state.last)}
      ><span aria-hidden="true">»</span></button
    >
  </nav>
{/if}
