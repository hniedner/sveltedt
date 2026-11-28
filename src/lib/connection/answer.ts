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
// The Error of a refused answer. The message is fixed words, never text from the answer; `code` is the answer's
// `error_code` when it is a string, else `null`.
const failure = (message: string, code: unknown): Error =>
  Object.assign(new Error(message), {
    code: typeof code === "string" ? code : null,
  });
const mismatch = (reason: string, code: unknown = null): Error =>
  failure(`${MISMATCH}: ${reason}.`, code);

function read<Row>(body: unknown, sent: number): Answer<Row> | Error {
  if (typeof body !== "object" || body === null)
    return mismatch("it is not an object");
  const { data, draw, error, error_code, recordsFiltered, recordsTotal } =
    body as {
      data?: unknown;
      draw?: unknown;
      error?: unknown;
      error_code?: unknown;
      recordsFiltered?: unknown;
      recordsTotal?: unknown;
    };
  if (error) return failure("The answer reports an error.", error_code);
  if (!Array.isArray(data)) return mismatch("data is not a list", error_code);
  return counted(
    data as readonly Row[],
    { draw, recordsFiltered, recordsTotal },
    sent,
    error_code,
  );
}

// The answer, or the mismatch when a count is not a count or a `draw` that is given is not the one `sent`
function counted<Row>(
  rows: readonly Row[],
  counts: { draw: unknown; recordsFiltered: unknown; recordsTotal: unknown },
  sent: number,
  code: unknown,
): Answer<Row> | Error {
  const { draw, recordsFiltered, recordsTotal } = counts;
  const total = readCount(recordsFiltered);
  if (total === undefined)
    return mismatch("recordsFiltered is not a count", code);
  const unfilteredTotal = readCount(recordsTotal);
  if (unfilteredTotal === undefined)
    return mismatch("recordsTotal is not a count", code);
  if (draw !== undefined && readCount(draw) !== sent)
    return mismatch("draw is not the one sent", code);
  return { rows, total, unfilteredTotal };
}

// An answer body read as given: its `data` is the rows, the list itself, each count is read by `readCount`, and a
// `draw` that is given must read to `sent`, the draw of the request answered. An `Error` when the answer's `error` is
// truthy, when a check fails, naming the first one, or when a property of the body throws when read.
export function readAnswer<Row>(
  body: unknown,
  sent: number,
): Answer<Row> | Error {
  try {
    return read(body, sent);
  } catch {
    return mismatch("it cannot be read");
  }
}
