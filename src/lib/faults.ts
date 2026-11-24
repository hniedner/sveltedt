import { DEV } from "esm-env";

// The codes of SORT-15 and FILT-32. When one of these is the fault, the columns have passed RND-05's checks (id, label,
// content); their own sort or filter settings may be the fault. So the controls that read the columns (FILT-30) can
// still show. A new SORT or FILT code goes in this array, not in the union below.
export const SORT_FILTER_FAULTS = [
  "sortableInvalid",
  "sortHandlerMissing",
  "sortInvalid",
  "sortColumnUnknown",
  "sortColumnNotSortable",
  "sortDirectionNotAllowed",
  "sortColumnDuplicate",
  "filterInvalid",
  "filterHandlerMissing",
  "filterStateInvalid",
  "searchInvalid",
  "searchDelayInvalid",
  "maxLengthInvalid",
] as const;

// The code of each fault of the table: RND-05's table, then SORT-15's, then FILT-32's
export type TableFault =
  | "captionEmpty"
  | "regionLabelEmpty"
  | "noColumns"
  | "columnIdEmpty"
  | "columnIdDuplicate"
  | "columnLabelEmpty"
  | "columnLabelDuplicate"
  | "columnContentMissing"
  | "statusUnknown"
  | "rowsNotList"
  | "rowIdEmpty"
  | "rowIdDuplicate"
  | "rowIdUnreadable"
  | (typeof SORT_FILTER_FAULTS)[number];

// The line of RND-17. The texts are for the developer: English only, no entry of `messages`, and none holds a value
// from the input (RND-09). They sit behind DEV, so a production bundle drops them and keeps the code (CON-14 is to
// prove it on the consumer's build; it is not yet tested).
export function faultLine(code: TableFault): string {
  if (!DEV) return `SvelteDT: ${code}`;
  const texts: Record<TableFault, string> = {
    captionEmpty: "Table caption must not be empty.",
    regionLabelEmpty: "Table region label must not be empty.",
    noColumns: "Table has no columns.",
    columnIdEmpty: "A column id is empty.",
    columnIdDuplicate: "Two columns share an id.",
    columnLabelEmpty: "A column label is empty.",
    columnLabelDuplicate: "Two columns share a label.",
    columnContentMissing: "A column has no value and no cell.",
    statusUnknown: "Table status is not known.",
    rowsNotList: "Table has no list of rows.",
    rowIdEmpty: "A row id is empty.",
    rowIdDuplicate: "Two rows share an id.",
    rowIdUnreadable: "A row id could not be read.",
    sortableInvalid: "A column's sort directions are invalid.",
    sortHandlerMissing: "A sortable column has no sort handler.",
    sortInvalid: "The sort is not valid.",
    sortColumnUnknown: "The sort names an unknown column.",
    sortColumnNotSortable: "The sort names a column that cannot be sorted.",
    sortDirectionNotAllowed:
      "The sort uses a direction a column does not allow.",
    sortColumnDuplicate: "The sort names a column twice.",
    filterInvalid: "A column filter is not valid.",
    filterHandlerMissing: "A filter has no handler.",
    filterStateInvalid: "An applied filter is not valid.",
    searchInvalid: "The applied search is not valid.",
    searchDelayInvalid: "The search delay is not a valid number.",
    maxLengthInvalid: "The text length limit is not a valid number.",
  };
  return `SvelteDT: ${code}: ${texts[code]}`;
}
