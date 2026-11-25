import type { Snippet } from "svelte";

// A column shows its `cell` snippet when it has one, else the text `value({ row })` returns; it has at least one of
// the two (RND-05 refuses a column with neither, for callers the type does not reach).
export type DataTableColumn<Row> = {
  readonly id: string;
  readonly label: string;
  // The directions a press steps through, in this order, at least one; absent: the column is not sortable
  readonly sortable?: readonly [SortDirection, ...SortDirection[]];
  // The filter the column offers; absent or null: none (FILT-32)
  readonly filter?: DataTableFilter | null;
} & (
  | {
      readonly value: (context: { readonly row: Row }) => string;
      readonly cell?: Snippet<
        [{ readonly row: Row; readonly column: DataTableColumn<Row> }]
      >;
    }
  | {
      readonly value?: (context: { readonly row: Row }) => string;
      readonly cell: Snippet<
        [{ readonly row: Row; readonly column: DataTableColumn<Row> }]
      >;
    }
);

export type SortDirection = "asc" | "desc";

// One option of a categorical filter; neither value nor label is empty (FILT-32)
export interface DataTableFilterOption {
  readonly value: string;
  readonly label: string;
}

// A text filter, or a categorical one that may offer one more option for "no value" (FILT-53)
export type DataTableFilter =
  | { readonly kind: "text" }
  | {
      readonly kind: "categorical";
      readonly options: readonly DataTableFilterOption[];
      readonly emptyOption?: boolean;
    };

// The applied filter of one column; `selected` holds option values, `''` for the option of FILT-53
export type DataTableFilterState =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "categorical"; readonly selected: readonly string[] };

// One entry of the order, the lead first
export interface DataTableSortEntry {
  readonly id: string;
  readonly direction: SortDirection;
}

// Every fixed word of the table (RND-06, SORT-17): the state messages, the live count, the sort words and the alert
// texts of RND-05 and SORT-15
export interface DataTableMessages {
  readonly loading: string;
  readonly failed: string;
  readonly empty: string;
  readonly stopped: string;
  readonly stillLoading: string;
  readonly cancel: string;
  readonly retry: string;
  readonly rowCount: (count: number) => string;
  // The one text of the alert for invalid input (RND-05)
  readonly invalidInput: string;
  readonly sortableHint: string;
  // The label of a categorical filter's option for "no value" (FILT-47)
  readonly emptyOption: string;
  // The name of a column's filter button (FILT-29)
  readonly filterButton: (label: string) => string;
  // The visible words of a text filter's badge (FILT-08)
  readonly badgeText: (
    filter: Readonly<{ label: string; text: string }>,
  ) => string;
  // The visible words of a categorical filter's badge; `options` are the selected options' labels (FILT-22)
  readonly badgeOptions: (
    filter: Readonly<{ label: string; options: readonly string[] }>,
  ) => string;
  // The name of a badge's button: "Clear filter" and the badge's words (FILT-08)
  readonly clearFilter: (words: string) => string;
  // The button that clears every applied filter (FILT-10)
  readonly clearFilters: string;
  // The button that asks the application to restore the order and the filters (FILT-30)
  readonly reset: string;
  // The visible label and the name of the global search field (FILT-40)
  readonly searchLabel: string;
  // The search field's hint under `searchOnEnter` (FILT-43)
  readonly pressEnter: string;
  // The search field's refusal of a control character in its text (FILT-48)
  readonly textHiddenCharacter: string;
  // The search field's refusal of a text longer than `maxLength` (FILT-48)
  readonly textTooLong: (maxLength: number) => string;
  readonly sortRank: (rank: number) => string;
  // `rank` is the column's place while two or more columns are sorted, else null (SORT-06)
  readonly sortDescription: (
    state: Readonly<{ direction: SortDirection | null; rank: number | null }>,
  ) => string;
}

// Where the rows stand: on their way (`loading`), shown (`ready`), not arrived (`failed`) or the load ended by the
// user before an answer (`stopped`)
export type DataTableStatus = "loading" | "ready" | "failed" | "stopped";

export interface DataTableProps<Row> {
  rows: readonly Row[];
  columns: readonly DataTableColumn<Row>[];
  // A string or a finite number; 1 and "1" are the same id (RND-05)
  getRowId: (context: { readonly row: Row }) => string | number;
  caption: string;
  regionLabel: string;
  // Default "ready"
  status?: DataTableStatus;
  // A newer answer is on its way while the rows shown stay; default false
  busy?: boolean;
  // Replaces any of the English defaults; an entry that is not of its default's type is ignored (RND-06)
  messages?: Partial<DataTableMessages>;
  // The order the server applied, the lead first; the table shows it and never reorders the rows; null is no order
  sort?: readonly DataTableSortEntry[] | null;
  // Called with the whole next order on a sort press; required while any column is sortable (SORT-15)
  onsort?: (next: DataTableSortEntry[]) => void;
  // Called with no argument on a press of "Cancel", which shows after the status element while the still-loading
  // text shows, a busy refresh included; the table stops nothing itself and ignores what this returns (PRD-B23)
  oncancel?: () => void;
  // Called with no argument on a press of "Try again", which shows while stopped or failed and the input is valid,
  // never beside the invalid-input alert; the table ignores what this returns (PRD-B24)
  onretry?: () => void;
  // The filters the server applied, by column id; the table shows them and never filters the rows itself
  filters?: Readonly<Record<string, DataTableFilterState>> | null;
  // Called with the column and its next filter; with onclearfilter and onclearfilters required while any column has a filter (FILT-32)
  onfilter?: (
    change: Readonly<{ id: string; state: DataTableFilterState }>,
  ) => void;
  onclearfilter?: (change: Readonly<{ id: string }>) => void;
  onclearfilters?: () => void;
  // Called on a press of "Reset table"; the button shows while it is given, a column is sortable or filtered, and no
  // fault but one of SORT-15 or FILT-32 shows (FILT-30)
  onreset?: () => void;
  // The application's own criteria controls: between the badges and "Clear column filters", also while the alert
  // shows (FILT-31)
  criteria?: Snippet;
  // Called with the search text; the search field shows while it is given and no fault shows (FILT-40)
  onsearch?: (text: string) => void;
  // The applied global search; null is not given, as `sort` (FILT-32)
  search?: string | null;
  // Milliseconds of typing pause before a filter or the search emits; a whole number, 0 or more (FILT-32)
  searchDelay?: number;
  // The search field emits only on Enter, not after a pause; default false (FILT-41)
  searchOnEnter?: boolean;
  // The longest text a filter field accepts; a whole number, 1 or more (FILT-32)
  maxLength?: number;
  heading?: Snippet;
  actions?: Snippet;
  // The application's own panels: after the toolbar and before the status line, in every state (EXP-04)
  panels?: Snippet;
}

// Every fixed word of the pager (PAGE-19): the step names, the page and size words, the information line and the
// alert texts of PAGE-16
export interface PaginationMessages {
  readonly firstPage: string;
  readonly previousPage: string;
  readonly nextPage: string;
  readonly lastPage: string;
  readonly pageLabel: (page: number) => string;
  readonly pageNumber: (page: number) => string;
  readonly sizeLabel: string;
  readonly sizeOption: (size: number) => string;
  // `first` and `last` are 0 when the page holds no row (PAGE-37)
  readonly info: (
    range: Readonly<{ first: number; last: number; total: number }>,
  ) => string;
  readonly infoFiltered: (unfilteredTotal: number) => string;
  readonly totalInvalid: string;
  readonly offsetInvalid: string;
  readonly limitInvalid: string;
  readonly labelEmpty: string;
  readonly sizesInvalid: string;
  readonly limitNotInSizes: string;
  readonly pageHandlerMissing: string;
  readonly sizeHandlerMissing: string;
  readonly unfilteredTotalInvalid: string;
}

export interface PaginationProps {
  // Where the shown page starts, a row index
  offset: number;
  // The page size
  limit: number;
  // The row count the pages cover
  total: number;
  // Names the pager's nav landmark
  label: string;
  // The page sizes offered; none or empty: no page-size select
  sizes?: readonly number[];
  // Called with the offset of the page pressed
  onpage: (offset: number) => void;
  // Called with the size chosen; required while `sizes` is not empty (PAGE-16)
  onsize?: (size: number) => void;
  // The row count before filtering, as the server reports it; the information line names it when it differs from
  // `total` (PAGE-38); null (from a JSON answer) is taken as not given
  unfilteredTotal?: number;
  // Replaces any of the English defaults; an entry that is undefined, null, not of its default's type or a blank
  // text keeps the default (PAGE-19)
  messages?: Partial<PaginationMessages>;
}
