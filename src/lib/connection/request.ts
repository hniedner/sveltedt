import type { ConnectionColumn, ConnectionQuery } from "./types.ts";

// The bracketed request of one query (CONN-01); each later statement adds its keys
export function buildRequest(
  columns: readonly ConnectionColumn[],
  query: ConnectionQuery,
  draw: number,
): URLSearchParams {
  const request = new URLSearchParams();
  request.set("draw", String(draw));
  request.set("start", String(query.offset ?? 0));
  request.set("length", String(query.limit));
  (query.sort ?? []).forEach((entry, i) => {
    const column = columns.findIndex((c) => c.id === entry.id);
    request.set(`order[${i}][column]`, String(column));
    request.set(`order[${i}][dir]`, entry.direction);
  });
  return request;
}
