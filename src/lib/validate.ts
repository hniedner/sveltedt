import type { DataTableMessages, DataTableProps } from "./types.ts";

// The message keys of RND-05's alert
type Fault = Exclude<
  keyof DataTableMessages,
  | "loading"
  | "failed"
  | "empty"
  | "rowCount"
  | "sortBy"
  | "sortRank"
  | "sortDescription"
>;

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

// No type guard on purpose: Array.isArray would widen a readonly array to any[]
const isList = (value: unknown): boolean => Array.isArray(value);

// The message key of the first fault, in the order of RND-05's table, or null when the input is valid. A key, not
// the text: a caller's empty message must not make a fault look like none.
export function validateTable<Row>(
  input: Pick<
    DataTableProps<Row>,
    "rows" | "columns" | "getRowId" | "caption" | "regionLabel" | "status"
  >,
): Fault | null {
  const { rows, columns, getRowId, caption, regionLabel, status } = input;
  if (isEmpty(caption)) return "captionEmpty";
  if (isEmpty(regionLabel)) return "regionLabelEmpty";
  if (!isList(columns) || columns.length === 0) return "noColumns";
  if (columns.some((column) => isEmpty(column.id))) return "columnIdEmpty";
  const duplicateId = firstDuplicate(columns.map((column) => column.id));
  if (duplicateId !== undefined) return "columnIdDuplicate";
  if (columns.some((column) => isEmpty(column.label)))
    return "columnLabelEmpty";
  // Every label is a string here: isEmpty above refused the rest
  const duplicateLabel = firstDuplicate(
    columns.map((column) => column.label.trim()),
  );
  if (duplicateLabel !== undefined) return "columnLabelDuplicate";
  if (columns.some((column) => !column.value && !column.cell))
    return "columnContentMissing";
  // With status loading or failed, rows that are not a list are no fault (STATE-08)
  if (!isList(rows))
    return status === "loading" || status === "failed" ? null : "rowsNotList";
  // An unreadable row id is reported last: an empty or shared id in another row comes first in RND-05's table
  const rowIds: string[] = [];
  let unreadable = false;
  for (const row of rows) {
    try {
      const id: unknown = getRowId(row);
      // Compared by text form, so the number 1 and the string "1" are one id
      if (typeof id === "string" || Number.isFinite(id))
        rowIds.push(String(id));
      else unreadable = true;
    } catch {
      unreadable = true;
    }
  }
  if (rowIds.some(isEmpty)) return "rowIdEmpty";
  const duplicateRowId = firstDuplicate(rowIds);
  if (duplicateRowId !== undefined) return "rowIdDuplicate";
  return unreadable ? "rowIdUnreadable" : null;
}
