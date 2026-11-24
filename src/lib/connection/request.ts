import type {
  ConnectionColumn,
  ConnectionQuery,
  ConnectionRequest,
} from "./types.ts";

// The name the server knows a column by: none given is the empty text
const nameOf = (column: ConnectionColumn): string => column.name ?? "";

// The index of the first map entry serving `id`, -1 when none does; an entry without an `id` is served by none
export const servedIndex = (
  columns: readonly ConnectionColumn[],
  id: string | undefined,
): number => (id === undefined ? -1 : columns.findIndex((c) => c.id === id));

const noSearch = { value: "", regex: false } as const;

// The request for one query as the plain object: the paging and search keys, the column entries, then one order entry
// per sort entry (spec/connection.md, section 1)
export function buildRequest(
  columns: readonly ConnectionColumn[],
  query: ConnectionQuery,
  draw: number,
): ConnectionRequest {
  return {
    draw,
    start: query.offset ?? 0,
    length: query.limit,
    search: noSearch,
    columns: columns.map((column) => ({
      data: column.data,
      name: nameOf(column),
      searchable: column.searchable ?? true,
      orderable: column.orderable ?? true,
      search: noSearch,
    })),
    order: (query.sort ?? []).map((entry) => {
      const column = servedIndex(columns, entry.id);
      return {
        column,
        dir: entry.direction,
        name: nameOf(columns[column]),
      };
    }),
  };
}

// The bracketed pairs of a request: every object and list key below the top is written as `[key]`
export function toParams(request: ConnectionRequest): URLSearchParams {
  const params = new URLSearchParams();
  const walk = (value: unknown, key: string): void => {
    if (typeof value === "object" && value !== null)
      for (const [k, v] of Object.entries(value))
        walk(v, key === "" ? k : `${key}[${k}]`);
    else params.set(key, String(value));
  };
  walk(request, "");
  return params;
}
