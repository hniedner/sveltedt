import { onMount } from "svelte";
import type { DataTableStatus } from "../types.ts";
import { readAnswer } from "./answer.js";
import type { Answer } from "./answer.ts";
import { buildRequest } from "./request.js";
import type { Connection, ConnectionOptions } from "./types.js";

// Call it in a component's script: onMount must run while that component initialises, and Svelte does not run it on
// the server (svelte.dev/docs/svelte/lifecycle-hooks). It sends one request on mount, from the options as they are
// then, and one more for each `pager.onpage`, and maps each answer. Read `table` and `pager` from the returned object,
// never destructured from it: each is read from the helper's state when it is read.
export function createConnection<Row = unknown>(
  options: ConnectionOptions,
): Connection<Row> {
  // The last answer mapped; none before the first
  let answer = $state.raw<Answer<Row>>();
  let status = $state<DataTableStatus>("loading");
  // True while a request runs with an answer on screen to keep
  let busy = $state(false);
  let offset = $state(options.query.offset ?? 0);
  // The draw of the last request sent, 0 before the first
  let draw = 0;
  function load(): void {
    const sent = ++draw;
    if (status === "ready") busy = true;
    else status = "loading";
    void options
      .send(
        buildRequest(options.columns, { ...options.query, offset }, sent),
        new AbortController().signal,
      )
      .then((body) => {
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
    },
    get pager() {
      return (
        answer && {
          offset,
          limit: options.query.limit,
          total: answer.total,
          unfilteredTotal: answer.unfilteredTotal,
          onpage,
        }
      );
    },
  };
}
