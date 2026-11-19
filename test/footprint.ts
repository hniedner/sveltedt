import type { DataTableProps } from "../src/lib/types.ts";

// The footprint tests' table (FOOT-01, FOOT-02). Each of the two lives in a test file of its own: every test file
// gets a fresh document, so its first mount is the first in that document, and nothing an earlier mount left
// behind can hide in what the test measures before it.

export interface FootprintRow {
  id: string;
  name: string;
}

// The props of a mount or rerender, in full, so no prop of an earlier state stays behind
export function footprintProps(
  props: Partial<DataTableProps<FootprintRow>> = {},
): DataTableProps<FootprintRow> {
  return {
    rows: [{ id: "r1", name: "Beta" }],
    columns: [{ id: "name", label: "Name", value: (row) => row.name }],
    getRowId: (row) => row.id,
    caption: "Orders",
    regionLabel: "Orders table",
    status: "ready",
    busy: false,
    ...props,
  };
}

// The rerenders after a mount with status ready and one row: loading, failed, ready with rows, busy, the alert
export const footprintStates: Partial<DataTableProps<FootprintRow>>[] = [
  { status: "loading" },
  { status: "failed" },
  {
    rows: [
      { id: "r1", name: "Beta" },
      { id: "r2", name: "Gamma" },
    ],
  },
  { busy: true },
  { columns: [] },
];
