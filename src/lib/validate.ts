import type { TableFault } from "./faults.ts";
import type { DataTableProps } from "./types.ts";

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
const STATUSES: readonly unknown[] = ["loading", "ready", "failed", "stopped"];

// An entry of the order as its type says: an object with a string id and a direction, asc or desc (SORT-15)
const isSortEntry = (entry: unknown): boolean =>
  typeof entry === "object" &&
  entry !== null &&
  typeof (entry as { id?: unknown }).id === "string" &&
  ((entry as { direction?: unknown }).direction === "asc" ||
    (entry as { direction?: unknown }).direction === "desc");

// No type guard on purpose: Array.isArray would widen a readonly array to any[]
const isList = (value: unknown): boolean => Array.isArray(value);

// The code of the first fault, in the order of RND-05's table, SORT-15's and then FILT-32's, or null when the input is valid
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
    | "filters"
    | "onfilter"
    | "onclearfilter"
    | "onclearfilters"
    | "search"
    | "searchDelay"
    | "maxLength"
  > & { emptyOption: string },
): TableFault | null {
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
  // Only with status ready are rows that are not a list a fault; with loading, failed or stopped they are not
  // (STATE-08, STATE-22), and a sort fault still counts
  if (!isList(rows)) {
    if (status === "ready") return "rowsNotList";
  } else {
    const fault = rowFault(rows, getRowId);
    if (fault) return fault;
  }
  // The sort faults come after every fault of RND-05's table (SORT-15), the filter faults after those (FILT-32)
  return (
    sortFault(input.columns, input.sort, input.onsort) ??
    filterFault(input) ??
    searchFault(input)
  );
}

// An unreadable row id is reported last: an empty or shared id in another row comes first in RND-05's table
function rowFault<Row>(
  rows: readonly Row[],
  getRowId: (context: { readonly row: Row }) => unknown,
): TableFault | null {
  const rowIds: string[] = [];
  let unreadable = false;
  for (const row of rows) {
    try {
      const id: unknown = getRowId({ row });
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
): TableFault | null {
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
  // Stryker disable OptionalChaining: the two checks above leave every entry a known, sortable column
  if (
    order.some(
      (entry) => !columnOf(entry.id)?.sortable?.includes(entry.direction),
    )
  )
    return "sortDirectionNotAllowed";
  // Stryker restore OptionalChaining
  return firstDuplicate(order.map((entry) => entry.id)) === undefined
    ? null
    : "sortColumnDuplicate";
}

// The props the filter checks read, as unknown: callers the types do not reach can pass anything
interface FilterInput {
  columns: readonly { id: string; filter?: unknown }[];
  filters?: unknown;
  onfilter?: unknown;
  onclearfilter?: unknown;
  onclearfilters?: unknown;
  search?: unknown;
  searchDelay?: unknown;
  maxLength?: unknown;
  // The shown label of the option of FILT-53; it takes part in the duplicate-label check
  emptyOption: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// The values a categorical filter accepts as selected: its options' values, and '' with the option of FILT-53
function optionValues(filter: Record<string, unknown>): string[] {
  const values = (filter["options"] as { value: string }[]).map(
    (option) => option.value,
  );
  return filter["emptyOption"] === true ? [...values, ""] : values;
}

// One filter as its type says (the filterInvalid rows of FILT-32); the label of FILT-53's option counts for the duplicate check
function filterShapeFault(filter: unknown, emptyLabel: string): boolean {
  // Not null here; a filter that is no object has no kind, and is refused with the kinds that are none of the two
  const { kind, emptyOption } = filter as Record<string, unknown>;
  if (kind === "text") return emptyOption === true;
  if (kind !== "categorical") return true;
  const options = (filter as Record<string, unknown>)["options"];
  if (!isList(options) || (options as unknown[]).length === 0) return true;
  const given = options as unknown[];
  if (
    given.some(
      (option) =>
        !isObject(option) ||
        isEmpty(option["value"]) ||
        isEmpty(option["label"]),
    )
  )
    return true;
  if (emptyOption != null && typeof emptyOption !== "boolean") return true;
  const labels = (given as { label: string }[]).map((option) =>
    option.label.trim(),
  );
  if (emptyOption === true) labels.push(emptyLabel.trim());
  return (
    firstDuplicate(optionValues({ options: given })) !== undefined ||
    firstDuplicate(labels) !== undefined
  );
}

// An applied entry as its column's filter allows (FILT-32, filterStateInvalid)
function entryFault(entry: unknown, filter: unknown): boolean {
  if (!isObject(entry) || !isObject(filter) || entry["kind"] !== filter["kind"])
    return true;
  if (entry["kind"] === "text") return typeof entry["text"] !== "string";
  const selected = entry["selected"];
  if (!isList(selected)) return true;
  const allowed = optionValues(filter);
  return (
    (selected as string[]).some((value) => !allowed.includes(value)) ||
    firstDuplicate(selected as string[]) !== undefined
  );
}

// The filter faults of FILT-32's table, the first row that applies; a filter given as null is no filter, as left out
function filterFault(input: FilterInput): TableFault | null {
  const { columns, filters, emptyOption } = input;
  const filtered = columns.filter(
    (column) => (column.filter ?? undefined) !== undefined,
  );
  if (filtered.some((column) => filterShapeFault(column.filter, emptyOption)))
    return "filterInvalid";
  if (
    filtered.length > 0 &&
    [input.onfilter, input.onclearfilter, input.onclearfilters].some(
      (handler) => typeof handler !== "function",
    )
  )
    return "filterHandlerMissing";
  if (filters === undefined || filters === null) return null;
  if (!isObject(filters)) return "filterStateInvalid";
  const bad = Object.entries(filters).some(([id, entry]) =>
    entryFault(entry, columns.find((column) => column.id === id)?.filter),
  );
  return bad ? "filterStateInvalid" : null;
}

// A whole number of at least `min`; Number.isInteger refuses everything that is no number, NaN and Infinity included
const wholeFrom = (value: unknown, min: number): boolean =>
  Number.isInteger(value) && (value as number) >= min;

// The search, its delay and its length limit; the application sets the last two, so null is a fault for them
function searchFault(input: FilterInput): TableFault | null {
  const { search, searchDelay, maxLength } = input;
  if (search !== undefined && search !== null && typeof search !== "string")
    return "searchInvalid";
  if (searchDelay !== undefined && !wholeFrom(searchDelay, 0))
    return "searchDelayInvalid";
  if (maxLength !== undefined && !wholeFrom(maxLength, 1))
    return "maxLengthInvalid";
  return null;
}
