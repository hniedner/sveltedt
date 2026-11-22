import type { DataTableMessages, PaginationMessages } from "./types.ts";

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

// The pager's English words, the information line's included (PAGE-37, PAGE-38), and the alert texts of PAGE-16
export const defaultPagerMessages: PaginationMessages = {
  firstPage: "First page",
  previousPage: "Previous page",
  nextPage: "Next page",
  lastPage: "Last page",
  pageLabel: (page) => `Page ${number.format(page)}`,
  pageNumber: (page) => number.format(page),
  sizeLabel: "rows per page",
  sizeOption: (size) => number.format(size),
  info: ({ first, last, total }) =>
    `Showing ${number.format(first)} to ${number.format(last)} of ${number.format(total)} ${total === 1 ? "row" : "rows"}`,
  infoFiltered: (total) =>
    `(filtered from ${number.format(total)} total ${total === 1 ? "row" : "rows"})`,
  totalInvalid: "The row total is not a valid number.",
  offsetInvalid: "The page offset is not a valid number.",
  limitInvalid: "The page size is not a valid number.",
  labelEmpty: "Pager label must not be empty.",
  sizesInvalid: "The page sizes are not valid.",
  limitNotInSizes: "The page size is not one of the offered sizes.",
  pageHandlerMissing: "The pager has no page handler.",
  sizeHandlerMissing: "The page-size select has no handler.",
  unfilteredTotalInvalid: "The unfiltered row total is not a valid number.",
};

// The defaults with each given entry that is of its default's type and not a blank text; an undefined, null,
// wrongly typed or blank entry keeps the default (RND-06, PAGE-19)
export function mergeMessages<Words extends object>(
  defaults: Words,
  given: Partial<Words> | undefined,
): Words {
  return {
    ...defaults,
    ...Object.fromEntries(
      Object.entries(given ?? {}).filter(
        ([key, word]) =>
          typeof word === typeof defaults[key as keyof Words] &&
          !(typeof word === "string" && word.trim() === ""),
      ),
    ),
  };
}
