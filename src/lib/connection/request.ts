import type { DataTableFilterState } from "../types.ts";
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

// A new empty search for each use: in the JSON form the application holds the request, and an edit must reach no other
const noSearch = () => ({ value: "", regex: false });

// One selected value with each of `/ . * + ? | ( ) [ ] { } \ $ ^ -` behind a backslash: the set of DataTables' own
// escapeRegex (CONN-10)
const escaped = (value: string): string =>
  value.replace(/[/.*+?|()[\]{}\\$^-]/g, "\\$&");

// The column search a filter sends: a text as given (CONN-09); a selection as an anchored alternation of its escaped
// values, in the order selected, with regex true (CONN-10); an empty search ("", false) for no filter and for an empty
// selection
function searchOf(filter: DataTableFilterState | undefined) {
  if (filter === undefined) return noSearch();
  if (filter.kind === "text") return { value: filter.text, regex: false };
  if (filter.selected.length === 0) return noSearch();
  return {
    value: `^(${filter.selected.map(escaped).join("|")})$`,
    regex: true,
  };
}

// The request for one query as the plain object: the paging and search keys, the column entries, then one order entry
// per sort entry (spec/connection.md, section 1)
export function buildRequest(
  columns: readonly ConnectionColumn[],
  query: Required<ConnectionQuery>,
  draw: number,
): ConnectionRequest {
  return {
    draw,
    start: query.offset,
    length: query.limit,
    search: { value: query.search, regex: false },
    columns: columns.map((column, i) => ({
      data: column.data,
      name: nameOf(column),
      searchable: column.searchable ?? true,
      orderable: column.orderable ?? true,
      // The first filter whose column id this entry serves; looked up among the filters' own keys, so an id such as
      // `constructor` reads nothing inherited
      search: searchOf(
        Object.entries(query.filters).find(
          ([id]) => servedIndex(columns, id) === i,
        )?.[1],
      ),
    })),
    order: query.sort.map((entry) => {
      const column = servedIndex(columns, entry.id);
      return {
        column,
        dir: entry.direction,
        name: nameOf(columns[column]),
      };
    }),
  };
}

// The key of the entry `k` of the value at `key`: `k` itself at the top, else `[k]`, or `.k` when `dot` (dotted, and the
// value is no list: a list index is always `[i]`)
const below = (key: string, k: string, dot: boolean): string =>
  key === "" ? k : dot ? `${key}.${k}` : `${key}[${k}]`;

// The pairs of a request, bracketed or dotted: a list index is always written as `[i]`, an object key below the top as
// `[key]` or `.key`
export function toParams(
  request: ConnectionRequest,
  dotted: boolean,
): URLSearchParams {
  const params = new URLSearchParams();
  const walk = (value: unknown, key: string): void => {
    // Stryker disable next-line ConditionalExpression: equivalent, no value of a request is null
    if (typeof value === "object" && value !== null) {
      const dot = dotted && !Array.isArray(value);
      for (const [k, v] of Object.entries(value)) walk(v, below(key, k, dot));
    } else params.set(key, String(value));
  };
  walk(request, "");
  return params;
}
