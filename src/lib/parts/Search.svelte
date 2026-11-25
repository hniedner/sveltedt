<script lang="ts">
  import { SearchText } from "../search.svelte.js";
  import type { DataTableProps } from "../types.js";

  type Props = Pick<
    DataTableProps<unknown>,
    "search" | "searchDelay" | "searchOnEnter"
  > & { label: string; onsearch: (text: string) => void };

  const { label, search, searchDelay, searchOnEnter, onsearch }: Props =
    $props();
  // Ties the label to its field, unique per table on the page
  const id = $props.id();
  // The defaults are applied here, after the table validated the settings, so a null stays a fault
  const box = new SearchText(
    () => search ?? "",
    () => ({ delay: searchDelay ?? 400, onEnter: searchOnEnter ?? false }),
    (text) => onsearch(text),
  );
</script>

<!-- A plain element, no role and no class: it holds the label and the field, and stands in the toolbar's place in the
     document order (FILT-45) -->
<div>
  <label for={id}>{label}</label>
  <input
    {id}
    type="search"
    autocomplete="off"
    value={box.text}
    oninput={(event) => box.input(event.currentTarget.value)}
    onkeydown={(event) => {
      if (event.key === "Enter") box.apply();
    }}
  />
</div>
