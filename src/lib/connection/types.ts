import type { DataTableSortEntry } from "../types.ts";

// One entry of the column map (spec/connection.md, Conventions, The options): entry `i` describes the backend's column
// `i`, so the order of the list is the backend's order. The flags `searchable` and `orderable` come with CONN-03.
export interface ConnectionColumn {
  readonly data: string;
  // The name the server knows the column by, never a free label
  readonly name?: string;
  // The table column id the entry serves
  readonly id?: string;
}

// The query (spec/connection.md, Conventions, The query), limited to the fields the statements so far read
export interface ConnectionQuery {
  readonly sort?: readonly DataTableSortEntry[];
  readonly offset?: number;
  readonly limit: number;
}

export interface ConnectionOptions {
  // The application's transport: it returns the parsed answer body, not a `Response`; the helper hands it the request
  // and an abort signal
  readonly send: (
    request: URLSearchParams,
    signal: AbortSignal,
  ) => Promise<unknown>;
  readonly columns: readonly ConnectionColumn[];
  // The form of the request (CONN-04)
  readonly form?: "bracketed";
  readonly query: ConnectionQuery;
}
