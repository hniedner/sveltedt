// The fault tables of the validators (RND-05, SORT-15, FILT-32, PAGE-16): each lists its rows in the order of its
// spec table, and the first row whose test holds names the fault.
// A row of a fault table: the fault, and the test that finds it
type Check<Fault> = readonly [Fault, () => boolean];

// The fault of the first row whose test holds, in the table's order, or null when none does
export const firstFault = <Fault>(
  table: readonly Check<Fault>[],
): Fault | null => table.find(([, holds]) => holds())?.[0] ?? null;

export const hasDuplicate = (values: readonly unknown[]): boolean =>
  new Set(values).size !== values.length;

// A text that is not a string counts as empty: callers the type does not reach can pass one (RND-05, PAGE-16)
export const isEmpty = (text: unknown): boolean =>
  typeof text !== "string" || text.trim() === "";
