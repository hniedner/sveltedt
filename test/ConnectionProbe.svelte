<script lang="ts">
  // The probe of the connection helper's tests (see Conventions, Layer, in spec/connection.md): it calls createConnection in its
  // script, as an application's component does, so the helper's onMount runs during this component's initialisation.
  import { untrack } from "svelte";
  import { createConnection } from "../src/lib/connection/index.ts";
  import type { ConnectionOptions } from "../src/lib/connection/index.ts";

  const { options }: { options: ConnectionOptions } = $props();
  // The helper reads its options once, at mount, on purpose: the probe never changes them
  untrack(() => createConnection(options));
</script>
