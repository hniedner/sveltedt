import type { ConnectionColumn, ConnectionQuery } from "./types.ts";

// The name the server knows a column by: none given is the empty text
const nameOf = (column: ConnectionColumn): string => column.name ?? "";

// The index of the first map entry serving `id`, -1 when none does; an entry without an `id` is served by none
export const servedIndex = (
  columns: readonly ConnectionColumn[],
  id: string | undefined,
): number => (id === undefined ? -1 : columns.findIndex((c) => c.id === id));

// The bracketed request for one query: the paging, search and column keys, then one order entry per sort entry
// (spec/connection.md, section 1)
export function buildRequest(
  columns: readonly ConnectionColumn[],
  query: ConnectionQuery,
  draw: number,
): URLSearchParams {
  const request = new URLSearchParams();
  request.set("draw", String(draw));
  request.set("start", String(query.offset ?? 0));
  request.set("length", String(query.limit));
  request.set("search[value]", "");
  request.set("search[regex]", "false");
  columns.forEach((column, i) => {
    request.set(`columns[${i}][data]`, column.data);
    request.set(`columns[${i}][name]`, nameOf(column));
    request.set(`columns[${i}][searchable]`, String(column.searchable ?? true));
    request.set(`columns[${i}][orderable]`, String(column.orderable ?? true));
    request.set(`columns[${i}][search][value]`, "");
    request.set(`columns[${i}][search][regex]`, "false");
  });
  (query.sort ?? []).forEach((entry, i) => {
    const column = servedIndex(columns, entry.id);
    request.set(`order[${i}][column]`, String(column));
    request.set(`order[${i}][dir]`, entry.direction);
    request.set(`order[${i}][name]`, nameOf(columns[column]));
  });
  return request;
}
