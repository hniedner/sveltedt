import type { DataTableMessages, DataTableProps } from "./types.ts";

// The message keys of the alert (RND-05, SORT-15)
type Fault = Exclude<
  keyof DataTableMessages,
  | "loading"
  | "failed"
  | "empty"
  | "rowCount"
  | "sortableHint"
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

// undefined never reaches here: DataTable.svelte defaults status to 'ready' first; null does, and is refused (RND-05)
const STATUSES: readonly unknown[] = ["loading", "ready", "failed"];

// An entry of the order as its type says: an object with a string id and a direction, asc or desc (SORT-15)
const isSortEntry = (entry: unknown): boolean =>
  typeof entry === "object" &&
  entry !== null &&
  typeof (entry as { id?: unknown }).id === "string" &&
  ((entry as { direction?: unknown }).direction === "asc" ||
    (entry as { direction?: unknown }).direction === "desc");

// No type guard on purpose: Array.isArray would widen a readonly array to any[]
const isList = (value: unknown): boolean => Array.isArray(value);

// The message key of the first fault, in the order of RND-05's table, or null when the input is valid. A key, not
// the text: a caller's empty message must not make a fault look like none.
export function validateTable<Row>(
  input: Pick<
    DataTableProps<Row>,
    | "rows"
    | "columns"
    | "getRowId"
    | "caption"
    | "regionLabel"
    | "status"
    | "sort"
    | "onsort"
  >,
): Fault | null {
  const { rows, columns, getRowId, caption, regionLabel, status } = input;
  if (isEmpty(caption)) return "captionEmpty";
  if (isEmpty(regionLabel)) return "regionLabelEmpty";
  if (!isList(columns) || columns.length === 0) return "noColumns";
  // A column that is not an object has no id (RND-05)
  if (
    columns.some((column) =>
      isEmpty((column as Partial<typeof column> | null)?.id),
    )
  )
    return "columnIdEmpty";
  const duplicateId = firstDuplicate(columns.map((column) => column.id));
  if (duplicateId !== undefined) return "columnIdDuplicate";
  if (columns.some((column) => isEmpty(column.label)))
    return "columnLabelEmpty";
  // Every label is a string here: isEmpty above refused the rest
  const duplicateLabel = firstDuplicate(
    columns.map((column) => column.label.trim()),
  );
  if (duplicateLabel !== undefined) return "columnLabelDuplicate";
  // A cell snippet is a function too
  if (
    columns.some(
      (column) =>
        typeof column.value !== "function" && typeof column.cell !== "function",
    )
  )
    return "columnContentMissing";
  if (!STATUSES.includes(status)) return "statusUnknown";
  // With status loading or failed, rows that are not a list are no row fault (STATE-08); a sort fault still counts
  if (!isList(rows)) {
    if (status !== "loading" && status !== "failed") return "rowsNotList";
  } else {
    const fault = rowFault(rows, getRowId);
    if (fault) return fault;
  }
  // The sort faults come after every fault of RND-05's table (SORT-15)
  return sortFault(input.columns, input.sort, input.onsort);
}

// An unreadable row id is reported last: an empty or shared id in another row comes first in RND-05's table
function rowFault<Row>(
  rows: readonly Row[],
  getRowId: (row: Row) => unknown,
): Fault | null {
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

// The first row of SORT-15's table that applies; each row is checked across all columns or entries before the next
function sortFault<Row>(
  columns: DataTableProps<Row>["columns"],
  sort: DataTableProps<Row>["sort"],
  onsort: DataTableProps<Row>["onsort"],
): Fault | null {
  const invalid = (sortable: unknown): boolean =>
    !isList(sortable) ||
    (sortable as unknown[]).length === 0 ||
    (sortable as unknown[]).some((d) => d !== "asc" && d !== "desc") ||
    // A direction named twice would make a press repeat it, and the column would never leave the order
    new Set(sortable as unknown[]).size !== (sortable as unknown[]).length;
  // A sortable given as null is not sortable, as left out (SORT-15)
  const sortables = columns.filter(
    (column) => (column.sortable ?? undefined) !== undefined,
  );
  if (sortables.some((column) => invalid(column.sortable)))
    return "sortableInvalid";
  if (sortables.length > 0 && typeof onsort !== "function")
    return "sortHandlerMissing";
  if (
    sort !== undefined &&
    sort !== null &&
    (!isList(sort) || !(sort as unknown[]).every(isSortEntry))
  )
    return "sortInvalid";
  const order = sort ?? [];
  const columnOf = (id: string) => columns.find((column) => column.id === id);
  if (order.some((entry) => !columnOf(entry.id))) return "sortColumnUnknown";
  if (order.some((entry) => !columnOf(entry.id)?.sortable))
    return "sortColumnNotSortable";
  if (
    order.some(
      (entry) => !columnOf(entry.id)?.sortable?.includes(entry.direction),
    )
  )
    return "sortDirectionNotAllowed";
  return firstDuplicate(order.map((entry) => entry.id)) === undefined
    ? null
    : "sortColumnDuplicate";
}
