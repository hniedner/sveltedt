import { onMount } from "svelte";
import type { DataTableStatus } from "../types.ts";
import { readAnswer } from "./answer.js";
import type { Answer } from "./answer.ts";
import { buildRequest } from "./request.js";
import type { Connection, ConnectionOptions } from "./types.js";

// Call it in a component's script: onMount must run while that component initialises, and Svelte does not run it on
// the server (svelte.dev/docs/svelte/lifecycle-hooks). It sends one request on mount, from the options as they are
// then, and maps its answer. Read `table` and `pager` from the returned object, never destructured from it: each is
// read from the helper's state when it is read.
export function createConnection<Row = unknown>(
  options: ConnectionOptions,
): Connection<Row> {
  // The last answer mapped; none before the first
  let answer = $state.raw<Answer<Row>>();
  let status = $state<DataTableStatus>("loading");
  onMount(() => {
    void options
      .send(
        buildRequest(options.columns, options.query, 1),
        new AbortController().signal,
      )
      .then((body) => {
        answer = readAnswer<Row>(body);
        status = "ready";
      });
  });
  return {
    table: {
      get rows() {
        return answer?.rows ?? [];
      },
      get status() {
        return status;
      },
      busy: false,
    },
    get pager() {
      return (
        answer && {
          total: answer.total,
          unfilteredTotal: answer.unfilteredTotal,
        }
      );
    },
  };
}
