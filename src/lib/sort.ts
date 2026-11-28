import type { DataTableSortEntry, SortDirection } from "./types.ts";

// The column's entry one press on, or null after its last direction: it then leaves the order
function step(
  id: string,
  sortable: readonly SortDirection[],
  entry: DataTableSortEntry | undefined,
): DataTableSortEntry | null {
  // A press steps through the directions in the order the column lists them (SORT-01)
  const next = entry
    ? sortable[sortable.indexOf(entry.direction) + 1]
    : sortable[0];
  return next ? { id, direction: next } : null;
}

// An entry as a list of at most one: none once the column leaves the order
const listed = (entry: DataTableSortEntry | null): DataTableSortEntry[] =>
  entry ? [entry] : [];

// The whole order after a press on a column's sort button: without Shift (SORT-01) a lead column steps on alone and
// any other column becomes the only one; with Shift (SORT-02) only that column steps on, joining at the end
export function nextOrder(
  order: readonly DataTableSortEntry[],
  id: string,
  sortable: readonly SortDirection[],
  add: boolean,
): DataTableSortEntry[] {
  const own = order.find((entry) => entry.id === id);
  if (!add)
    return listed(step(id, sortable, order[0]?.id === id ? own : undefined));
  const next = listed(step(id, sortable, own));
  return own
    ? order.flatMap((entry) => (entry.id !== id ? [entry] : next))
    : [...order, ...next];
}

// A column's direction and rank in the order; the rank only while two or more columns are sorted (SORT-05, SORT-06)
export function sortState(
  order: readonly DataTableSortEntry[],
  id: string,
): {
  direction: SortDirection | null;
  rank: number | null;
} {
  const place = order.findIndex((entry) => entry.id === id);
  const entry = order[place];
  if (!entry) return { direction: null, rank: null };
  return {
    direction: entry.direction,
    rank: order.length > 1 ? place + 1 : null,
  };
}
