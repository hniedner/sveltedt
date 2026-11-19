import type { Snippet } from "svelte";

// A column shows its `cell` snippet when it has one, else the text `value(row)` returns; it has at least one of
// the two (RND-05 refuses a column with neither, for callers the type does not reach).
export type DataTableColumn<Row> = {
  readonly id: string;
  readonly label: string;
  // The directions a press steps through, ascending before descending; absent: the column is not sortable
  readonly sortable?: readonly SortDirection[];
} & (
  | {
      readonly value: (row: Row) => string;
      readonly cell?: Snippet<[Row, string]>;
    }
  | {
      readonly value?: (row: Row) => string;
      readonly cell: Snippet<[Row, string]>;
    }
);

export type SortDirection = "asc" | "desc";

// One entry of the order, the lead first
export interface DataTableSortEntry {
  readonly id: string;
  readonly desc: boolean;
}

// Every fixed word of the table (RND-06, SORT-17): the state messages, the live count, the sort words and the alert
// texts of RND-05 and SORT-15
export interface DataTableMessages {
  readonly loading: string;
  readonly failed: string;
  readonly empty: string;
  readonly rowCount: (count: number) => string;
  readonly captionEmpty: string;
  readonly regionLabelEmpty: string;
  readonly noColumns: string;
  readonly columnIdEmpty: string;
  readonly columnIdDuplicate: string;
  readonly columnLabelEmpty: string;
  readonly columnLabelDuplicate: string;
  readonly columnContentMissing: string;
  readonly statusUnknown: string;
  readonly rowsNotList: string;
  readonly rowIdEmpty: string;
  readonly rowIdDuplicate: string;
  readonly rowIdUnreadable: string;
  readonly sortBy: (label: string) => string;
  readonly sortRank: (rank: number) => string;
  // `rank` is the column's place while two or more columns are sorted, else null (SORT-06)
  readonly sortDescription: (state: {
    direction: SortDirection | null;
    rank: number | null;
  }) => string;
  readonly sortableInvalid: string;
  readonly sortHandlerMissing: string;
  readonly sortInvalid: string;
  readonly sortColumnUnknown: string;
  readonly sortColumnNotSortable: string;
  readonly sortDirectionNotAllowed: string;
  readonly sortColumnDuplicate: string;
}

// Where the rows stand: on their way (`loading`), shown (`ready`) or not arrived (`failed`)
export type DataTableStatus = "loading" | "ready" | "failed";

export interface DataTableProps<Row> {
  rows: readonly Row[];
  columns: readonly DataTableColumn<Row>[];
  // A string or a finite number; 1 and "1" are the same id (RND-05)
  getRowId: (row: Row) => string | number;
  caption: string;
  regionLabel: string;
  // Default "ready"
  status?: DataTableStatus;
  // A newer answer is on its way while the rows shown stay; default false
  busy?: boolean;
  // Replaces any of the English defaults
  messages?: Partial<DataTableMessages>;
  // The order the server applied, the lead first; the table shows it and never reorders the rows
  sort?: readonly DataTableSortEntry[];
  // Called with the whole next order on a sort press; required while any column is sortable (SORT-15)
  onsort?: (next: DataTableSortEntry[]) => void;
  heading?: Snippet;
  actions?: Snippet;
}
