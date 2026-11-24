<script lang="ts">
  // The probe of the connection helper's tests (the Layer line of spec/connection.md): it calls createConnection in its
  // script, as an application's component does, so the helper's onMount runs during this component's initialisation.
  import { createConnection } from "../src/lib/connection/index.ts";
  import type { ConnectionOptions } from "../src/lib/connection/index.ts";

  const { options }: { options: ConnectionOptions } = $props();
  createConnection(options);
</script>
