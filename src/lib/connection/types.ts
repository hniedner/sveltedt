import type { DataTableSortEntry } from "../types.ts";

// One entry of the column map: entry `i` describes the backend's column `i` (spec/connection.md, the options)
export interface ConnectionColumn {
  readonly data: string;
  readonly name?: string;
  // The table column id the entry serves
  readonly id?: string;
}

// The query as far as the request reads it
export interface ConnectionQuery {
  readonly sort?: readonly DataTableSortEntry[];
  readonly offset?: number;
  readonly limit: number;
}

export interface ConnectionOptions {
  // The application's transport: the helper hands it the request and an abort signal
  readonly send: (
    request: URLSearchParams,
    signal: AbortSignal,
  ) => Promise<unknown>;
  readonly columns: readonly ConnectionColumn[];
  // The form of the request; the others come with their statements
  readonly form?: "bracketed";
  readonly query: ConnectionQuery;
}
