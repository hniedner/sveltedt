import type {
  DataTableProps,
  DataTableSortEntry,
  PaginationProps,
  SortDirection,
} from "../types.ts";

// One entry of the column map (spec/connection.md, Conventions, The options): entry `i` describes the backend's column
// `i`, so the order of the list is the backend's order.
export interface ConnectionColumn {
  readonly data: string;
  // The name the server knows the column by, never a free label
  readonly name?: string;
  // The table column id the entry serves
  readonly id?: string;
  // Sent to the server as given, `true` when not given, as in DataTables; the helper does not enforce them (a sort on
  // an entry with `orderable: false` is still sent), and `searchable` matters once the filter intents exist
  readonly searchable?: boolean;
  readonly orderable?: boolean;
}

// The query (spec/connection.md, Conventions, The query). The helper reads `sort`, `offset` and `limit` once, at
// creation, and then holds the live query: read it back from `table.sort` and `pager`
export interface ConnectionQuery {
  readonly sort?: readonly DataTableSortEntry[];
  readonly offset?: number;
  readonly limit: number;
}

// The request as the plain object of the JSON form (`form: "json"`) a DataTables 2.x client builds, without its `fixed`
// lists (spec/connection.md, section 1, CONN-06); the other forms receive a `URLSearchParams`
export interface ConnectionRequest {
  readonly draw: number;
  readonly start: number;
  readonly length: number;
  readonly search: { readonly value: string; readonly regex: boolean };
  readonly columns: readonly {
    readonly data: string;
    readonly name: string;
    readonly searchable: boolean;
    readonly orderable: boolean;
    readonly search: { readonly value: string; readonly regex: boolean };
  }[];
  readonly order: readonly {
    readonly column: number;
    readonly dir: SortDirection;
    readonly name: string;
  }[];
}

interface ConnectionBaseOptions {
  readonly columns: readonly ConnectionColumn[];
  readonly query: ConnectionQuery;
  // Called once for each failure: an answer's failure (an answer that cannot be mapped, its message naming the check
  // that failed, or a truthy `error`), a `send` failure passed as it is (a rejection or a thrown value; a missing
  // promise is a `TypeError` the helper provokes), and a refused sort (a sort entry names a column that no map entry
  // serves). `table.status` is `'failed'` before the call, except for a refused `onsort`, which leaves it as it was.
  // An answer's failure carries `code`, a string or `null`; a rejection is your `send`'s own error: if your
  // transport's errors carry a string `code` (axios does), tell them apart in `send`.
  // A rejection's value is passed as it is and may hold the request's headers: do not forward it to telemetry
  // unredacted. `code` is the server's string, untrusted text: never render it as HTML.
  // Stated limits: `onerror` must not throw; a refused `reload()` while a request runs (reachable only by changing the
  // column map's entries meanwhile) sets `'failed'` and leaves `busy` and that request as they are, the request's own
  // end then applying; a `send` that throws synchronously, with an `onerror` that calls `reload()`, repeats without end
  readonly onerror: (error: unknown) => void;
}

// The options of the bracketed and the dotted form: `send` receives a `URLSearchParams`. Type a separately written
// `send` by its member, not by `ConnectionOptions["send"]`. Stated limit: a `form` the types do not allow (plain
// JavaScript) is sent bracketed.
export interface ConnectionParamsOptions extends ConnectionBaseOptions {
  // The application's transport: it resolves with the parsed answer body, not a `Response`; the helper calls it
  // with one object holding the request and an abort signal, which is aborted when a later request is sent or the
  // component unmounts while this one runs. A rejection, a synchronous throw or a missing promise is a failure,
  // passed to `onerror` as it is.
  readonly send: (context: {
    readonly request: URLSearchParams;
    readonly signal: AbortSignal;
  }) => Promise<unknown>;
  // The form of the request: the bracketed one when not given; the dotted one keeps list indexes in brackets and joins
  // object keys with a dot
  readonly form?: "bracketed" | "dotted";
}

// The options of the JSON form: `send` receives the plain object, which the application stringifies itself
export interface ConnectionJsonOptions extends ConnectionBaseOptions {
  readonly send: (context: {
    readonly request: ConnectionRequest;
    readonly signal: AbortSignal;
  }) => Promise<unknown>;
  readonly form: "json";
}

export type ConnectionOptions = ConnectionParamsOptions | ConnectionJsonOptions;

// What createConnection returns: the props of `DataTable` and, once an answer is mapped, of `Pagination`. `Row` is the
// application's claim about the rows of its answers, which the helper passes on unread.
export interface Connection<Row> {
  readonly table: Readonly<
    Required<Pick<DataTableProps<Row>, "rows" | "status" | "busy">>
  > & {
    // Written out, not picked: the prop's `null` is not a value the helper produces
    readonly sort: readonly DataTableSortEntry[];
    readonly onsort: NonNullable<DataTableProps<Row>["onsort"]>;
  };
  readonly pager:
    | Readonly<
        Required<
          Pick<
            PaginationProps,
            | "offset"
            | "limit"
            | "total"
            | "unfilteredTotal"
            | "onpage"
            | "onsize"
          >
        >
      >
    | undefined;
  // Sends the current query again, the page included
  readonly reload: () => void;
}
