import type { DataTableProps } from "./types.ts";

// The fixed texts of the alert: none holds a value taken from the input (RND-09)
const messages = {
  captionEmpty: "Table caption must not be empty.",
  regionLabelEmpty: "Table region label must not be empty.",
  noColumns: "Table has no columns.",
  columnIdEmpty: "A column id is empty.",
  columnIdDuplicate: "Two columns share an id.",
  columnLabelEmpty: "A column label is empty.",
  columnLabelDuplicate: "Two columns share a label.",
  columnContentMissing: "A column has no value and no cell.",
  rowIdEmpty: "A row id is empty.",
  rowIdDuplicate: "Two rows share an id.",
  rowIdUnreadable: "A row id could not be read.",
};

function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

// A text that is not a string counts as empty: callers the type does not reach can pass one (RND-05)
const isEmpty = (text: unknown): boolean =>
  typeof text !== "string" || text.trim() === "";

// The message of the first fault, in the order of RND-05's table, or null when the input is valid
export function validateTable<Row>(
  input: Pick<
    DataTableProps<Row>,
    "rows" | "columns" | "getRowId" | "caption" | "regionLabel"
  >,
): string | null {
  const { rows, columns, getRowId, caption, regionLabel } = input;
  if (isEmpty(caption)) return messages.captionEmpty;
  if (isEmpty(regionLabel)) return messages.regionLabelEmpty;
  if (columns.length === 0) return messages.noColumns;
  if (columns.some((column) => isEmpty(column.id)))
    return messages.columnIdEmpty;
  const duplicateId = firstDuplicate(columns.map((column) => column.id));
  if (duplicateId !== undefined) return messages.columnIdDuplicate;
  if (columns.some((column) => isEmpty(column.label)))
    return messages.columnLabelEmpty;
  // Every label is a string here: isEmpty above refused the rest
  const duplicateLabel = firstDuplicate(
    columns.map((column) => column.label.trim()),
  );
  if (duplicateLabel !== undefined) return messages.columnLabelDuplicate;
  if (columns.some((column) => !column.value && !column.cell))
    return messages.columnContentMissing;
  // An unreadable row id is reported last: an empty or shared id in another row comes first in RND-05's table
  const rowIds: string[] = [];
  let unreadable = false;
  for (const row of rows) {
    try {
      const id: unknown = getRowId(row);
      if (typeof id === "string") rowIds.push(id);
      else unreadable = true;
    } catch {
      unreadable = true;
    }
  }
  if (rowIds.some(isEmpty)) return messages.rowIdEmpty;
  const duplicateRowId = firstDuplicate(rowIds);
  if (duplicateRowId !== undefined) return messages.rowIdDuplicate;
  return unreadable ? messages.rowIdUnreadable : null;
}
