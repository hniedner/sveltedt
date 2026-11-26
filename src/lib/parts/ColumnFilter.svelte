<script lang="ts">
  import type {
    DataTableFilter,
    DataTableFilterState,
    DataTableMessages,
    DataTableProps,
  } from "../types.js";
  import Search from "./Search.svelte";

  type Props = Pick<
    DataTableProps<unknown>,
    "searchDelay" | "searchOnEnter" | "maxLength" | "onfilter"
  > & {
    id: string;
    label: string;
    filter: DataTableFilter;
    // The filter the application applied to this column
    applied: DataTableFilterState | undefined;
    words: Pick<
      DataTableMessages,
      | "filterButton"
      | "filterDialog"
      | "filterText"
      | "pressEnter"
      | "textHiddenCharacter"
      | "textTooLong"
    >;
  };

  const {
    id,
    label,
    filter,
    applied,
    words,
    searchDelay,
    searchOnEnter,
    maxLength,
    onfilter,
  }: Props = $props();
  // Ties the button to its dialog, unique per part on the page
  const dialogId = $props.id();
  // The browser holds whether the dialog is open; this mirrors it from the event that precedes every change, so the
  // fields exist only while it is open and their unsent text and pause go with it
  let open = $state(false);
</script>

<!-- Adapted from ontoprism, frontend/src/lib/components/data-table/DataTableFilterPopover.svelte (Apache License 2.0,
     the owner's own project): the dialog named "<label> filter" (FILT-02). The button and its dialog, which follows it
     in the document (the intro of the filter dialog section of spec/table.md). The dialog is a popover: the browser
     opens it on a press of the button and holds whether it is open. The text filter's field is the search field's part
     and class, given this column's applied text (FILT-01) -->
<button
  type="button"
  aria-label={words.filterButton(label)}
  popovertarget={dialogId}
  ><svg
    aria-hidden="true"
    focusable="false"
    viewBox="0 0 16 16"
    width="12"
    height="12"
    ><path d="M1 2h14l-5.5 6.5V14l-3-1.5V8.5z" fill="currentColor" /></svg
  ></button
>
<div
  id={dialogId}
  popover="auto"
  role="dialog"
  aria-label={words.filterDialog(label)}
  onbeforetoggle={(event) => (open = event.newState === "open")}
>
  {#if open && filter.kind === "text"}
    <Search
      label={words.filterText(label)}
      {words}
      search={applied?.kind === "text" ? applied.text : ""}
      {searchDelay}
      {searchOnEnter}
      {maxLength}
      onsearch={(next: string) =>
        // Stryker disable next-line OptionalChaining: unreachable fallback, a filter exists only with an onfilter (FILT-32)
        onfilter?.({ id, state: { kind: "text", text: next } })}
    />
  {/if}
</div>
