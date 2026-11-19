import type { DataTableMessages } from "./types.ts";

// The English default of every fixed word the table shows or announces (RND-06, SORT-17). The alert texts hold no value taken
// from the input (RND-09).
export const defaultMessages: DataTableMessages = {
  loading: "Loading data…",
  failed: "The data could not be loaded.",
  empty: "No data.",
  rowCount: (count) => `${count} ${count === 1 ? "row" : "rows"} displayed`,
  captionEmpty: "Table caption must not be empty.",
  regionLabelEmpty: "Table region label must not be empty.",
  noColumns: "Table has no columns.",
  columnIdEmpty: "A column id is empty.",
  columnIdDuplicate: "Two columns share an id.",
  columnLabelEmpty: "A column label is empty.",
  columnLabelDuplicate: "Two columns share a label.",
  columnContentMissing: "A column has no value and no cell.",
  rowsNotList: "Table has no list of rows.",
  rowIdEmpty: "A row id is empty.",
  rowIdDuplicate: "Two rows share an id.",
  rowIdUnreadable: "A row id could not be read.",
  sortBy: (label) => `Sort by ${label}`,
};
