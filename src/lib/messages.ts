import type { DataTableMessages, PaginationMessages } from "./types.ts";

// Numbers group the English way whatever the runtime's locale (I18N-01)
const number = new Intl.NumberFormat("en-US");

// The English default of every fixed word the table shows or announces (RND-06, SORT-17). The alert texts hold no
// value taken from the input (RND-09).
export const defaultMessages: DataTableMessages = {
  loading: "Loading data…",
  failed: "The data could not be loaded.",
  empty: "No data.",
  stopped: "Loading stopped",
  stillLoading: "Still loading",
  cancel: "Cancel",
  retry: "Try again",
  rowCount: (count) =>
    `${number.format(count)} ${count === 1 ? "row" : "rows"} displayed`,
  invalidInput: "This table cannot be shown.",
  sortableHint: "Column names that are buttons sort the table.",
  emptyOption: "(empty)",
  filterButton: (label) => `Filter ${label}`,
  badgeText: ({ label, text }) => `${label}: contains “${text}”`,
  badgeOptions: ({ label, options }) => `${label}: ${options.join(", ")}`,
  clearFilter: (words) => `Clear filter ${words}`,
  clearFilters: "Clear column filters",
  reset: "Reset table",
  searchLabel: "Search",
  textHiddenCharacter:
    "The text contains a hidden character, often from pasted text. Clear the field and type the text again.",
  textTooLong: (maxLength) =>
    `Use at most ${number.format(maxLength)} characters.`,
  sortRank: (rank) => String(rank),
  sortDescription: ({ direction, rank }) => {
    const hint =
      "Shift+click, Shift+Enter or Shift+Space adds this column to the sort.";
    if (direction === null) return hint;
    const words = direction === "asc" ? "ascending" : "descending";
    return `sorted ${words}${rank === null ? "" : `, priority ${rank}`}. ${hint}`;
  },
};

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
