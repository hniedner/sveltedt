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
  // Above the browser floor (PRD-E1): IdleDetector is missing from Firefox and Safari.
  const idle = new IdleDetector();
  const inject = (html: string) => {
    el?.setAttribute("STYLE", "color: red");
    if (el) el.innerHTML = html;
  };
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
<svelte:element this="p" STYLE="color: red"
  >style attribute on svelte:element</svelte:element
>
<p bind:this={el}>bind:this is allowed</p>
<svelte:head><title>{inject}</title></svelte:head>
{@html rest.html}
<link rel="stylesheet" href="injected.css" />
<div>
  <script>
    alert(1);
  </script>
</div>
<svelte:element this="style">p {"{}"}</svelte:element>
<svelte:element this={"script"}></svelte:element>
<iframe srcdoc="<p>raw</p>" title="srcdoc"></iframe>
<p>{String(idle)}</p>

<style>
  p {
    margin: 0;
  }
</style>
