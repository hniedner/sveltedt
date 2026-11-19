<script lang="ts">
  // FOOT-02's and SORT-24's control: it must handle every event type the table's own elements handle (click, on the
  // sort buttons), so mounting it shows the listeners Svelte itself adds to the document for them. When
  // DataTable.svelte gains an event handler, add one of the same type here.
</script>

<button type="button" onclick={() => undefined}>Control</button>
