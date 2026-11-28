import { SORT_FILTER_FAULTS } from "./faults.js";
import type { TableFault } from "./faults.ts";
import type {
  DataTableColumn,
  DataTableFilter,
  DataTableFilterState,
  DataTableMessages,
  DataTableProps,
} from "./types.ts";

type CategoricalFilter = Extract<DataTableFilter, { kind: "categorical" }>;

// The options a categorical filter offers: its given ones, then with `emptyOption` one more for no value, last, whose
// value is '' (FILT-53)
export function offered(
  filter: CategoricalFilter,
  emptyLabel: string,
): { value: string; label: string }[] {
  return filter.emptyOption
    ? [...filter.options, { value: "", label: emptyLabel }]
    : [...filter.options];
}

// One badge of an applied filter: the column's id and the badge's visible words (FILT-08)
export interface Badge {
  id: string;
  text: string;
}

// The badges of the applied filters, in column order whatever the key order of `filters` (FILT-31). A text filter
// applies while its text is not blank, a categorical one while something is selected; the input is valid here
// (FILT-32). A categorical badge names the selected options by label in the options' order, the empty option last
// (FILT-22).
export function badges<Row>(
  columns: readonly DataTableColumn<Row>[],
  filters: DataTableProps<Row>["filters"],
  words: BadgeWords,
): Badge[] {
  const found: Badge[] = [];
  for (const column of columns) {
    const badge = badgeText(column, filters?.[column.id], words);
    if (badge !== null) found.push(badge);
  }
  return found;
}

type BadgeWords = Pick<
  DataTableMessages,
  "badgeText" | "badgeOptions" | "emptyOption"
>;

// A column's badge, or null while its state applies nothing
function badgeText<Row>(
  column: DataTableColumn<Row>,
  state: DataTableFilterState | undefined,
  words: BadgeWords,
): Badge | null {
  if (state === undefined) return null;
  if (state.kind === "text")
    return state.text.trim() === ""
      ? null
      : {
          id: column.id,
          text: words.badgeText({ label: column.label, text: state.text }),
        };
  if (state.selected.length === 0) return null;
  // An applied categorical state sits on a column whose filter is categorical (FILT-32 refuses the rest)
  const options = offered(column.filter as CategoricalFilter, words.emptyOption)
    .filter((option) => state.selected.includes(option.value))
    .map((option) => option.label);
  return {
    id: column.id,
    text: words.badgeOptions({ label: column.label, options }),
  };
}

// The values a categorical filter selects after a press on `pressed`: its options' values in the options' order, each
// kept while `isSelected` holds it, the pressed one flipped (FILT-04)
export function toggled(
  options: readonly { value: string }[],
  isSelected: (value: string) => boolean,
  pressed: string,
): string[] {
  return options
    .map((option) => option.value)
    .filter((value) =>
      value === pressed ? !isSelected(value) : isSelected(value),
    );
}

// "Reset table" shows while `onreset` is given and a column is sortable or has a filter. The alert state keeps it for
// a fault of SORT-15 or FILT-32, where the columns have passed RND-05's checks (their own sort or filter settings may
// be the fault): it is the application's way back from a server answer the table cannot show (FILT-30).
export function resetShown<Row>(
  fault: TableFault | null,
  columns: readonly DataTableColumn<Row>[],
  onreset: DataTableProps<Row>["onreset"],
): boolean {
  const keepsReset: readonly string[] = SORT_FILTER_FAULTS;
  return (
    typeof onreset === "function" &&
    (fault === null || keepsReset.includes(fault)) &&
    columns.some((column) => column.sortable || column.filter)
  );
}
