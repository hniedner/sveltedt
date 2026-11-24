import { onMount } from "svelte";
import { buildRequest } from "./request.ts";
import type { ConnectionOptions } from "./types.ts";

// Call it in a component's script: onMount must run while that component initialises, and Svelte does not run it on
// the server (svelte.dev/docs/svelte/lifecycle-hooks)
export function createConnection(options: ConnectionOptions): void {
  onMount(() => {
    void options.send(
      buildRequest(options.columns, options.query, 1),
      new AbortController().signal,
    );
  });
}
