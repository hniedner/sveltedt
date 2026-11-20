import type { DataTableMessages } from "./types.ts";

// The English default of every fixed word the table shows or announces (RND-06, SORT-17). The alert texts hold no
// value taken from the input (RND-09).
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
  statusUnknown: "Table status is not known.",
  rowsNotList: "Table has no list of rows.",
  rowIdEmpty: "A row id is empty.",
  rowIdDuplicate: "Two rows share an id.",
  rowIdUnreadable: "A row id could not be read.",
  sortBy: (label) => `Sort by ${label}`,
  sortRank: (rank) => String(rank),
  sortDescription: ({ direction, rank }) => {
    const hint =
      "Shift+click, Shift+Enter or Shift+Space adds this column to the sort.";
    if (direction === null) return hint;
    const words = direction === "asc" ? "ascending" : "descending";
    return `sorted ${words}${rank === null ? "" : `, priority ${rank}`}. ${hint}`;
  },
  sortableInvalid: "A column's sort directions are invalid.",
  sortHandlerMissing: "A sortable column has no sort handler.",
  sortInvalid: "The sort is not valid.",
  sortColumnUnknown: "The sort names an unknown column.",
  sortColumnNotSortable: "The sort names a column that cannot be sorted.",
  sortDirectionNotAllowed: "The sort uses a direction a column does not allow.",
  sortColumnDuplicate: "The sort names a column twice.",
};

// Numbers group the English way whatever the runtime's locale
const number = new Intl.NumberFormat("en-US");

// The pager's English words
export const pagerWords = {
  firstPage: "First page",
  previousPage: "Previous page",
  nextPage: "Next page",
  lastPage: "Last page",
  pageLabel: (page: number) => `Page ${number.format(page)}`,
  pageNumber: (page: number) => number.format(page),
};
