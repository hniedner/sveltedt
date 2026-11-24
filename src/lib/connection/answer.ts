import { isCount } from "../pager.js";

// The rows and the two counts of an answer (spec/connection.md, section 2)
export interface Answer<Row> {
  readonly rows: readonly Row[];
  readonly total: number;
  readonly unfilteredTotal: number;
}

// A count given as a number or as its decimal text (digits only), read as a number; `undefined` for anything else
function readCount(value: unknown): number | undefined {
  const count =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return isCount(count) ? (count as number) : undefined;
}

// An answer body read as given: its `data` is the rows, the list itself, each count is read by `readCount`, and a
// `draw` that is given must read to `sent`, the draw of the request answered. `undefined` when any check fails.
export function readAnswer<Row>(
  body: unknown,
  sent: number,
): Answer<Row> | undefined {
  const { data, draw, recordsFiltered, recordsTotal } = Object(body) as {
    data?: unknown;
    draw?: unknown;
    recordsFiltered?: unknown;
    recordsTotal?: unknown;
  };
  const total = readCount(recordsFiltered);
  const unfilteredTotal = readCount(recordsTotal);
  if (
    !Array.isArray(data) ||
    total === undefined ||
    unfilteredTotal === undefined ||
    (draw !== undefined && readCount(draw) !== sent)
  )
    return undefined;
  return { rows: data as readonly Row[], total, unfilteredTotal };
}
