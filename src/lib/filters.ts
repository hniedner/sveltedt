import type {
  DataTableColumn,
  DataTableMessages,
  DataTableProps,
} from "./types.ts";

// One badge of an applied filter: the column's id and the badge's visible words (FILT-08)
export interface Badge {
  id: string;
  text: string;
}

// The badges of the applied filters, in column order whatever the key order of `filters` (FILT-31). A text filter
// applies while its text is not blank; the input is valid here (FILT-32).
export function badges<Row>(
  columns: readonly DataTableColumn<Row>[],
  filters: DataTableProps<Row>["filters"],
  words: Pick<DataTableMessages, "badgeText">,
): Badge[] {
  const found: Badge[] = [];
  for (const column of columns) {
    const state = filters?.[column.id];
    if (state?.kind === "text" && state.text.trim() !== "")
      found.push({
        id: column.id,
        text: words.badgeText({ label: column.label, text: state.text }),
      });
  }
  return found;
}
