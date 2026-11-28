import { firstFault, hasDuplicate, isEmpty } from "./checks.js";
import type { TableFault } from "./faults.ts";
import type { DataTableProps } from "./types.ts";

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
  // The sort faults come after every fault of RND-05's table (SORT-15), the filter faults after those (FILT-32)
  return (
    firstFault<TableFault>([
      ["captionEmpty", () => isEmpty(caption)],
      ["regionLabelEmpty", () => isEmpty(regionLabel)],
      ["noColumns", () => !isList(columns) || columns.length === 0],
      // A column that is not an object has no id (RND-05)
      [
        "columnIdEmpty",
        () =>
          columns.some((column) =>
            isEmpty((column as Partial<typeof column> | null)?.id),
          ),
      ],
      [
        "columnIdDuplicate",
        () => hasDuplicate(columns.map((column) => column.id)),
      ],
      [
        "columnLabelEmpty",
        () => columns.some((column) => isEmpty(column.label)),
      ],
      // Every label is a string here: isEmpty above refused the rest
      [
        "columnLabelDuplicate",
        () => hasDuplicate(columns.map((column) => column.label.trim())),
      ],
      // A cell snippet is a function too
      [
        "columnContentMissing",
        () =>
          columns.some(
            (column) =>
              typeof column.value !== "function" &&
              typeof column.cell !== "function",
          ),
      ],
      ["statusUnknown", () => !STATUSES.includes(status)],
      // Only with status ready are rows that are not a list a fault; with loading, failed or stopped they are not
      // (STATE-08, STATE-22), and a sort fault still counts
      ["rowsNotList", () => !isList(rows) && status === "ready"],
    ]) ??
    rowFault(rows, getRowId) ??
    sortFault(input.columns, input.sort, input.onsort) ??
    filterFault(input) ??
    searchFault(input)
  );
}

// A row's id in its text form, so the number 1 and the string "1" are one id; null when it cannot be read
function readId<Row>(
  getRowId: (context: { readonly row: Row }) => unknown,
  row: Row,
): string | null {
  try {
    const id: unknown = getRowId({ row });
    return typeof id === "string" || Number.isFinite(id) ? String(id) : null;
  } catch {
    return null;
  }
}

// An unreadable row id is reported last: an empty or shared id in another row comes first in RND-05's table. Rows
// that are not a list have no ids to check.
function rowFault<Row>(
  rows: readonly Row[],
  getRowId: (context: { readonly row: Row }) => unknown,
): TableFault | null {
  if (!isList(rows)) return null;
  const ids = Array.from(rows, (row) => readId(getRowId, row));
  const read = ids.filter((id) => id !== null);
  return firstFault<TableFault>([
    ["rowIdEmpty", () => read.some(isEmpty)],
    ["rowIdDuplicate", () => hasDuplicate(read)],
    ["rowIdUnreadable", () => read.length < ids.length],
  ]);
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
  const order = sort ?? [];
  const columnOf = (id: string) => columns.find((column) => column.id === id);
  return firstFault<TableFault>([
    [
      "sortableInvalid",
      () => sortables.some((column) => invalid(column.sortable)),
    ],
    [
      "sortHandlerMissing",
      () => sortables.length > 0 && typeof onsort !== "function",
    ],
    [
      "sortInvalid",
      () =>
        sort != null &&
        (!isList(sort) || !(sort as unknown[]).every(isSortEntry)),
    ],
    ["sortColumnUnknown", () => order.some((entry) => !columnOf(entry.id))],
    // Stryker disable OptionalChaining: the row above leaves every entry a known column, the next row a sortable one
    [
      "sortColumnNotSortable",
      () => order.some((entry) => !columnOf(entry.id)?.sortable),
    ],
    [
      "sortDirectionNotAllowed",
      () =>
        order.some(
          (entry) => !columnOf(entry.id)?.sortable?.includes(entry.direction),
        ),
    ],
    // Stryker restore OptionalChaining
    ["sortColumnDuplicate", () => hasDuplicate(order.map((entry) => entry.id))],
  ]);
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
  const { kind, emptyOption, options } = filter as Record<string, unknown>;
  if (kind === "text") return emptyOption === true;
  const given = options as { value: unknown; label: unknown }[];
  return [
    // Neither a text nor a categorical filter
    () => kind !== "categorical",
    // No options, or not a list
    () => !isList(options) || given.length === 0,
    // An option that is no object, or has an empty value or label
    () =>
      given.some(
        (option) =>
          !isObject(option) ||
          isEmpty(option["value"]) ||
          isEmpty(option["label"]),
      ),
    // An emptyOption that is neither a boolean nor left out
    () => emptyOption != null && typeof emptyOption !== "boolean",
    // Two options with one value
    () => hasDuplicate(given.map((option) => option.value)),
    // Two options with one label, the option of FILT-53 included; every label is a string here (the option row above)
    () => {
      const labels = (given as { label: string }[]).map((option) =>
        option.label.trim(),
      );
      return hasDuplicate(
        emptyOption === true ? [...labels, emptyLabel.trim()] : labels,
      );
    },
  ].some((holds) => holds());
}

// A categorical entry's selection as its filter allows: a list of its option values, none twice
const selectionFault = (selected: unknown, allowed: string[]): boolean =>
  !isList(selected) ||
  (selected as string[]).some((value) => !allowed.includes(value)) ||
  hasDuplicate(selected as string[]);

// An applied entry as its column's filter allows (FILT-32, filterStateInvalid)
function entryFault(entry: unknown, filter: unknown): boolean {
  if (!isObject(entry) || !isObject(filter) || entry["kind"] !== filter["kind"])
    return true;
  return entry["kind"] === "text"
    ? typeof entry["text"] !== "string"
    : selectionFault(entry["selected"], optionValues(filter));
}

// The filter faults of FILT-32's table, the first row that applies; a filter given as null is no filter, as left out
function filterFault(input: FilterInput): TableFault | null {
  const { columns, filters, emptyOption } = input;
  const filtered = columns.filter(
    (column) => (column.filter ?? undefined) !== undefined,
  );
  return firstFault<TableFault>([
    [
      "filterInvalid",
      () =>
        filtered.some((column) => filterShapeFault(column.filter, emptyOption)),
    ],
    [
      "filterHandlerMissing",
      () =>
        filtered.length > 0 &&
        [input.onfilter, input.onclearfilter, input.onclearfilters].some(
          (handler) => typeof handler !== "function",
        ),
    ],
    // `filters` given and not an object
    ["filterStateInvalid", () => filters != null && !isObject(filters)],
    // An entry that is not as its column's filter allows
    [
      "filterStateInvalid",
      () =>
        isObject(filters) &&
        Object.entries(filters).some(([id, entry]) =>
          entryFault(entry, columns.find((column) => column.id === id)?.filter),
        ),
    ],
  ]);
}

// A whole number of at least `min`; Number.isInteger refuses everything that is no number, NaN and Infinity included
const wholeFrom = (value: unknown, min: number): boolean =>
  Number.isInteger(value) && (value as number) >= min;

// The search, its delay and its length limit; the application sets the last two, so null is a fault for them
function searchFault(input: FilterInput): TableFault | null {
  const { search, searchDelay, maxLength } = input;
  return firstFault<TableFault>([
    ["searchInvalid", () => search != null && typeof search !== "string"],
    [
      "searchDelayInvalid",
      () => searchDelay !== undefined && !wholeFrom(searchDelay, 0),
    ],
    [
      "maxLengthInvalid",
      () => maxLength !== undefined && !wholeFrom(maxLength, 1),
    ],
  ]);
}
