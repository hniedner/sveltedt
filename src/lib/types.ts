import type { Snippet } from "svelte";

// A column shows its `cell` snippet when it has one, else the text `value(row)` returns.
export interface DataTableColumn<Row> {
  id: string;
  label: string;
  value?: (row: Row) => string;
  cell?: Snippet<[Row, string]>;
}

export interface DataTableProps<Row> {
  rows: readonly Row[];
  columns: readonly DataTableColumn<Row>[];
  getRowId: (row: Row) => string;
  caption: string;
  regionLabel: string;
}
