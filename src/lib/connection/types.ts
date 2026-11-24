import type {
  DataTableProps,
  DataTableSortEntry,
  PaginationProps,
} from "../types.ts";

// One entry of the column map (spec/connection.md, Conventions, The options): entry `i` describes the backend's column
// `i`, so the order of the list is the backend's order.
export interface ConnectionColumn {
  readonly data: string;
  // The name the server knows the column by, never a free label
  readonly name?: string;
  // The table column id the entry serves
  readonly id?: string;
  // Whether the server may search or order by the column; `true` when not given, as in DataTables
  readonly searchable?: boolean;
  readonly orderable?: boolean;
}

// The query (spec/connection.md, Conventions, The query)
export interface ConnectionQuery {
  readonly sort?: readonly DataTableSortEntry[];
  readonly offset?: number;
  readonly limit: number;
}

export interface ConnectionOptions {
  // The application's transport: it resolves with the parsed answer body, not a `Response`; the helper calls it
  // with one object holding the request and an abort signal. A rejection of `send` is not handled by the helper,
  // and `send` must not throw synchronously either: the helper has no catch around the call, so a synchronous throw
  // escapes.
  readonly send: (context: {
    readonly request: URLSearchParams;
    readonly signal: AbortSignal;
  }) => Promise<unknown>;
  readonly columns: readonly ConnectionColumn[];
  // The form of the request: the bracketed one
  readonly form?: "bracketed";
  readonly query: ConnectionQuery;
  // Called once with an Error when an answer cannot be mapped; it does not hear a rejection of `send`
  readonly onerror: (error: unknown) => void;
}

// What createConnection returns: the props of `DataTable` and, once an answer is mapped, of `Pagination`. `Row` is the
// application's claim about the rows of its answers, which the helper passes on unread.
export interface Connection<Row> {
  readonly table: Readonly<
    Required<Pick<DataTableProps<Row>, "rows" | "status" | "busy">>
  >;
  readonly pager:
    | Readonly<
        Required<
          Pick<
            PaginationProps,
            "offset" | "limit" | "total" | "unfilteredTotal" | "onpage"
          >
        >
      >
    | undefined;
}
