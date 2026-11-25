<script lang="ts">
  type Props = { label: string };

  const { label }: Props = $props();
  // Ties the label to its field, unique per table on the page
  const id = $props.id();
</script>

<!-- A plain element, no role and no class: it holds the label and the field, and stands in the toolbar's place in the
     document order (FILT-45) -->
<div>
  <label for={id}>{label}</label>
  <input {id} type="search" autocomplete="off" />
</div>
