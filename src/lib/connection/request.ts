import type { ConnectionColumn, ConnectionQuery } from "./types.ts";

// The name the server knows a column by: none given is the empty text
const nameOf = (column: ConnectionColumn): string => column.name ?? "";

// The bracketed request of one query (CONN-02, CONN-04, CONN-08)
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
    request.set(`columns[${i}][searchable]`, "true");
    request.set(`columns[${i}][orderable]`, "true");
    request.set(`columns[${i}][search][value]`, "");
    request.set(`columns[${i}][search][regex]`, "false");
  });
  (query.sort ?? []).forEach((entry, i) => {
    const column = columns.findIndex((c) => c.id === entry.id);
    request.set(`order[${i}][column]`, String(column));
    request.set(`order[${i}][dir]`, entry.direction);
    request.set(`order[${i}][name]`, nameOf(columns[column]));
  });
  return request;
}
