import { onMount } from "svelte";
import { buildRequest } from "./request.ts";
import type { ConnectionOptions } from "./types.ts";

// Call it in a component's script: onMount then runs while that component initialises, and a server render sends nothing
export function createConnection(options: ConnectionOptions): void {
  onMount(() => {
    void options.send(
      buildRequest(options.columns, options.query, 1),
      new AbortController().signal,
    );
  });
}
