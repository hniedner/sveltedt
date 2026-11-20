<script lang="ts">
  import type { PaginationProps } from "./types.ts";

  const props: PaginationProps = $props();
</script>

<nav aria-label={props.label}></nav>
