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

const MISMATCH = "The answer does not match the request";
// The Error of a refused answer: fixed words naming the check that failed, never a value from the answer
const failure = (reason: string): Error => new Error(`${MISMATCH}: ${reason}.`);

function read<Row>(body: unknown, sent: number): Answer<Row> | Error {
  if (typeof body !== "object" || body === null)
    return failure("it is not an object");
  const { data, draw, recordsFiltered, recordsTotal } = body as {
    data?: unknown;
    draw?: unknown;
    recordsFiltered?: unknown;
    recordsTotal?: unknown;
  };
  if (!Array.isArray(data)) return failure("data is not a list");
  const total = readCount(recordsFiltered);
  if (total === undefined) return failure("recordsFiltered is not a count");
  const unfilteredTotal = readCount(recordsTotal);
  if (unfilteredTotal === undefined)
    return failure("recordsTotal is not a count");
  if (draw !== undefined && readCount(draw) !== sent)
    return failure("draw is not the one sent");
  return { rows: data as readonly Row[], total, unfilteredTotal };
}

// An answer body read as given: its `data` is the rows, the list itself, each count is read by `readCount`, and a
// `draw` that is given must read to `sent`, the draw of the request answered. An `Error` when a check fails, naming
// the first one, or when a property of the body throws when read.
export function readAnswer<Row>(
  body: unknown,
  sent: number,
): Answer<Row> | Error {
  try {
    return read(body, sent);
  } catch {
    return failure("it cannot be read");
  }
}
