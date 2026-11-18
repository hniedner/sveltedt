<script lang="ts" generics="Row">
  import type { DataTableProps } from "./types.ts";

  const { caption }: DataTableProps<Row> = $props();
</script>

<table>
  <caption>{caption}</caption>
</table>
