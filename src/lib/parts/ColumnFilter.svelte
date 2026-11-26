<script lang="ts">
  import type { DataTableMessages } from "../types.js";

  interface Props {
    label: string;
    words: Pick<DataTableMessages, "filterButton" | "filterDialog">;
  }

  const { label, words }: Props = $props();
  // Ties the button to its dialog, unique per part on the page
  const dialogId = $props.id();
</script>

<!-- Adapted from ontoprism, frontend/src/lib/components/data-table/DataTableFilterPopover.svelte (Apache License 2.0,
     the owner's own project): the dialog named "<label> filter". The button and its dialog, which follows it in the
     document (FILT-02). The dialog is a popover: the browser opens it on a press of the button and holds whether it is
     open -->
<button
  type="button"
  popovertarget={dialogId}
  aria-label={words.filterButton(label)}
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
></div>
