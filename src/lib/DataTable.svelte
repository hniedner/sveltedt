<script lang="ts" generics="Row">
  import type { DataTableProps } from "./types.ts";

  const { caption, regionLabel }: DataTableProps<Row> = $props();
</script>

<div role="region" aria-label={regionLabel}>
  <table>
    <caption>{caption}</caption>
  </table>
</div>
