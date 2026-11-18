<script lang="ts">
  // Planted: a wrong type (TS2322) and an implicit any (TS7006, an error only when strict).
  const count: number = "one";
  const echo = (x) => x;
</script>

<p>{count}{echo(1)}</p>
