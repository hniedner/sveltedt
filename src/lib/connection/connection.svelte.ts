import { onMount } from "svelte";
import type { DataTableSortEntry, DataTableStatus } from "../types.ts";
import { readAnswer } from "./answer.js";
import type { Answer } from "./answer.ts";
import { buildRequest, servedIndex, toParams } from "./request.js";
import type { Connection, ConnectionOptions } from "./types.js";

// Call it in a component's script: onMount must run while that component initialises, and Svelte does not run it on
// the server (svelte.dev/docs/svelte/lifecycle-hooks). It sends one request on mount and one more for each
// `pager.onpage`, `pager.onsize`, `table.onsort` and `reload()` (none when a sort is refused, CONN-16), and maps each
// answer. It reads `options` when it builds each request, except the query's `offset`, `limit` and `sort`: they are
// read once, at creation, and then held by the helper. Read `pager` from the returned object, never destructured from
// it: it is a getter, so a copy would hold the value it had when it was copied. `table` is a plain object, so
// `const { table } = connection` is fine; read `table.rows`, `table.status`, `table.busy` and `table.sort` from it,
// not destructured.
export function createConnection<Row = unknown>(
  options: ConnectionOptions,
): Connection<Row> {
  // The last answer mapped; none before the first
  let answer = $state.raw<Answer<Row>>();
  let status = $state<DataTableStatus>("loading");
  // True while a request runs with an answer on screen to keep
  let busy = $state(false);
  let offset = $state(options.query.offset ?? 0);
  let limit = $state(options.query.limit);
  let sort = $state.raw<readonly DataTableSortEntry[]>(
    options.query.sort ?? [],
  );
  // The draw of the last request sent, 0 before the first
  let draw = 0;
  // True, after one call of `onerror`, when an entry of `entries` names a column that no map entry serves
  function refused(entries: readonly DataTableSortEntry[]): boolean {
    const entry = entries.find((e) => servedIndex(options.columns, e.id) < 0);
    if (entry === undefined) return false;
    options.onerror(
      new Error(
        `No column map entry serves the sort's column id ${JSON.stringify(entry.id)}.`,
      ),
    );
    return true;
  }
  function load(): void {
    if (refused(sort)) {
      status = "failed";
      return;
    }
    const sent = ++draw;
    if (status === "ready") busy = true;
    else status = "loading";
    const request = buildRequest(
      options.columns,
      { ...options.query, sort, offset, limit },
      sent,
    );
    const signal = new AbortController().signal;
    void (
      options.form === "json"
        ? options.send({ request, signal })
        : options.send({
            request: toParams(request, options.form === "dotted"),
            signal,
          })
    ).then((body) => {
      busy = false;
      const read = readAnswer<Row>(body, sent);
      if (read === undefined) {
        status = "failed";
        options.onerror(new Error("The answer does not match the request."));
        return;
      }
      answer = read;
      status = "ready";
    });
  }
  function onpage(next: number): void {
    offset = next;
    load();
  }
  function onsort(next: DataTableSortEntry[]): void {
    if (refused(next)) return;
    sort = next;
    offset = 0;
    load();
  }
  function onsize(size: number): void {
    offset -= offset % size;
    limit = size;
    load();
  }
  onMount(load);
  return {
    table: {
      get rows() {
        return answer?.rows ?? [];
      },
      get status() {
        return status;
      },
      get busy() {
        return busy;
      },
      get sort() {
        return sort;
      },
      onsort,
    },
    get pager() {
      return (
        answer && {
          offset,
          limit,
          total: answer.total,
          unfilteredTotal: answer.unfilteredTotal,
          onpage,
          onsize,
        }
      );
    },
    reload: load,
  };
}
