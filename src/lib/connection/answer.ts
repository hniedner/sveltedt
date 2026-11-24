// The rows and the two counts of an answer (spec/connection.md, section 2)
export interface Answer<Row> {
  readonly rows: readonly Row[];
  readonly total: number;
  readonly unfilteredTotal: number;
}

// An answer body read as given: its `data` is the rows, the list itself, and each count is read as a number, a count
// given as its decimal text included
export function readAnswer<Row>(body: unknown): Answer<Row> {
  const { data, recordsFiltered, recordsTotal } = body as {
    data: readonly Row[];
    recordsFiltered: unknown;
    recordsTotal: unknown;
  };
  return {
    rows: data,
    total: Number(recordsFiltered),
    unfilteredTotal: Number(recordsTotal),
  };
}
