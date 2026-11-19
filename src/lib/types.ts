import type { Snippet } from "svelte";

// A column shows its `cell` snippet when it has one, else the text `value(row)` returns; it has at least one of
// the two (RND-05 refuses a column with neither, for callers the type does not reach).
export type DataTableColumn<Row> = {
  readonly id: string;
  readonly label: string;
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
  heading?: Snippet;
  actions?: Snippet;
}
