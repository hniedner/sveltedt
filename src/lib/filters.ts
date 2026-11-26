import { SORT_FILTER_FAULTS } from "./faults.js";
import type { TableFault } from "./faults.ts";
import type {
  DataTableColumn,
  DataTableFilter,
  DataTableMessages,
  DataTableProps,
} from "./types.ts";

type CategoricalFilter = Extract<DataTableFilter, { kind: "categorical" }>;

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
  words: Pick<DataTableMessages, "badgeText" | "badgeOptions" | "emptyOption">,
): Badge[] {
  const found: Badge[] = [];
  for (const column of columns) {
    const state = filters?.[column.id];
    if (state?.kind === "text" && state.text.trim() !== "")
      found.push({
        id: column.id,
        text: words.badgeText({ label: column.label, text: state.text }),
      });
    else if (state?.kind === "categorical" && state.selected.length > 0) {
      // An applied categorical state sits on a column whose filter is categorical (FILT-32 refuses the rest)
      const { options: given } = column.filter as CategoricalFilter;
      const options = given
        .filter((option) => state.selected.includes(option.value))
        .map((option) => option.label);
      if (state.selected.includes("")) options.push(words.emptyOption);
      found.push({
        id: column.id,
        text: words.badgeOptions({ label: column.label, options }),
      });
    }
  }
  return found;
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
