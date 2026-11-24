import { DEV } from "esm-env";

// The code of each fault of the table: RND-05's table, then SORT-15's
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
  | "sortableInvalid"
  | "sortHandlerMissing"
  | "sortInvalid"
  | "sortColumnUnknown"
  | "sortColumnNotSortable"
  | "sortDirectionNotAllowed"
  | "sortColumnDuplicate";

// The line of RND-17. The texts are for the developer: English only, no entry of `messages`, and none holds a value
// from the input (RND-09). They sit behind DEV, so a production bundle drops them and keeps the code.
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
  };
  return `SvelteDT: ${code}: ${texts[code]}`;
}
