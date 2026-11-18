<script lang="ts">
  // Planted violations: the lint step fails could-not-check unless ESLint reports every one of them.
  let {
    rest,
    value = $bindable(),
  }: { rest: Record<string, string>; value: any } = $props();
  const act = (node: HTMLElement) => node;
  const attach = (node: HTMLElement) => node;
  const style = "color: red";
  let el: HTMLElement | undefined = $state();
  // Above the browser floor (PRD-E1): IdleDetector is in no floor browser.
  const idle = new IdleDetector();
</script>

<!-- eslint-disable -->
<p {...rest}>
  a spread attribute behind an HTML disable comment: still reported
</p>
<!-- eslint-enable -->
<p class:on={true}>class directive</p>
<p use:act>action</p>
<input bind:value />
<p style:color="red">style directive</p>
<p {@attach attach}>attach</p>
<p {style}>style shorthand</p>
<svelte:element this="p" style="color: red"
  >style attribute on svelte:element</svelte:element
>
<p bind:this={el}>bind:this is allowed</p>
{@html rest.html}
<p>{String(idle)}</p>
