<!-- Adapted from ontoprism, frontend/src/lib/components/Pagination.svelte (Apache License 2.0, the owner's own
     project): the nav, the aria-disabled step buttons, the keyed number row and its gaps. -->
<script lang="ts">
  import { pagerWords as words } from "./messages.ts";
  import { pageNumbers, pagerState } from "./pager.ts";
  import type { PaginationProps } from "./types.ts";

  const props: PaginationProps = $props();
  const state = $derived(pagerState(props.offset, props.limit, props.total));
  const items = $derived(pageNumbers(state.page - 1, state.pages));

  // A step that cannot move stays a focusable button and emits nothing (PAGE-05, PAGE-13)
  function step(can: boolean, offset: number): void {
    if (can) props.onpage(offset);
  }
</script>

<nav aria-label={props.label}>
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
      <button
        type="button"
        aria-label={words.pageLabel(item + 1)}
        aria-current={item + 1 === state.current ? "page" : undefined}
        onclick={() => step(true, item * props.limit)}
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
