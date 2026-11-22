<script lang="ts">
  // PAGE-32's control: it handles every event type the pager's own elements handle (click on its buttons, change on
  // its page-size select), so mounting it shows the listeners Svelte itself adds to the document for them. When
  // Pagination.svelte gains an event handler, add one of the same type here.
</script>

<button type="button" onclick={() => undefined}>Control</button>
<select onchange={() => undefined}><option>1</option></select>
