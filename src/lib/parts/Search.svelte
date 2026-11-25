<script lang="ts">
  import { SearchText } from "../search.svelte.js";
  import type { DataTableMessages, DataTableProps } from "../types.js";

  type Props = Pick<
    DataTableProps<unknown>,
    "search" | "searchDelay" | "searchOnEnter" | "maxLength"
  > & {
    label: string;
    words: Pick<
      DataTableMessages,
      "pressEnter" | "textHiddenCharacter" | "textTooLong"
    >;
    onsearch: (text: string) => void;
  };

  const {
    label,
    words,
    search,
    searchDelay,
    searchOnEnter,
    maxLength,
    onsearch,
  }: Props = $props();
  // Ties the label and the messages to the field, unique per part on the page
  const id = $props.id();
  const limit = $derived(maxLength ?? 255);
  // The defaults are applied here, after the table validated the settings, so a null stays a fault
  const box = new SearchText(
    () => search ?? "",
    () => ({
      delay: searchDelay ?? 400,
      onEnter: searchOnEnter ?? false,
      maxLength: limit,
    }),
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
    aria-invalid={box.hidden || box.tooLong ? "true" : undefined}
    aria-describedby={[
      searchOnEnter ? `${id}-hint` : null,
      box.hidden ? `${id}-hidden` : null,
      box.tooLong ? `${id}-long` : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined}
    oninput={(event) => box.input(event.currentTarget.value)}
    onkeydown={(event) => {
      if (event.key === "Enter") box.apply();
    }}
  />
  {#if searchOnEnter}<div id="{id}-hint">{words.pressEnter}</div>{/if}
  {#if box.hidden}<div role="alert" id="{id}-hidden">
      {words.textHiddenCharacter}
    </div>{/if}
  {#if box.tooLong}<div role="alert" id="{id}-long">
      {words.textTooLong(limit)}
    </div>{/if}
</div>
