import { untrack } from "svelte";

// The slow-load state of PRD-B2, one per table: `shown` is the progress indicator being in the component, `held` its
// 500 ms minimum still running, `still` the still-loading text being shown, `started` whether a load or refetch has
// started since mount. Read as `view.still`, never destructured, so the reads stay reactive. The class also keeps the
// region's Tab stop (A11Y-12), which only the browser reads, so it has no field
export class TableView {
  shown = $state(false);
  // Stryker disable next-line BooleanLiteral: equivalent, a wrongly true start only skips a reset of shown and still, which are false then
  held = $state(false);
  still = $state(false);
  // Set by the first load or refetch with valid input and never cleared: from then on the status line keeps its room
  // until unmount (STATE-15); before it, none (STATE-29). The table's markup also reads `pending`, because this field
  // is set by an effect, which does not run on the server, where a loading table must already have its room
  started = $state(false);

  // Built only while a component initialises (its effects need that context), at the place the table's script gives
  // it. `pending` is read in the first effect, so a change of it reruns that one; `ending` is the table's focus
  // hand-off; `region` is the element the Tab stop belongs to, null while there is none
  constructor(
    pending: () => boolean,
    ending: () => void,
    region: () => HTMLElement | null,
  ) {
    // 1 s of pending without a gap shows the indicator (STATE-09); a gap clears the delay. Once nothing is pending and
    // the minimum has passed, the indicator goes (STATE-10) and the still-loading text with it (STATE-12)
    $effect(() => {
      if (!pending()) {
        if (!this.held) {
          // A block that depends on state a plain $effect writes is removed in the same flush, before any pre-effect
          // runs (measured with Svelte 5.57.3, an effect-order detail that may change): so focus is kept here, in the
          // effect that writes `still`, before it is written. A11Y-28's browser rows fail without this call
          untrack(ending);
          this.shown = false;
          this.still = false;
        }
        return;
      }
      this.started = true;
      if (this.shown) return;
      const delay = setTimeout(() => {
        this.shown = true;
        this.held = true;
      }, 1000);
      return () => clearTimeout(delay);
    });
    // While the indicator is shown: its 500 ms minimum (STATE-10) and the still-loading text 5 s after it appeared
    // (STATE-12), both ended when it goes or the table unmounts (FOOT-05)
    $effect(() => {
      if (!this.shown) return;
      const minimum = setTimeout(() => (this.held = false), 500);
      const long = setTimeout(() => (this.still = true), 5000);
      return () => {
        clearTimeout(minimum);
        clearTimeout(long);
      };
    });
    // The region is a Tab stop exactly while its content is wider than it (A11Y-12, PRD section 5.1): sideways only,
    // as the region scrolls sideways only (overflow-y computes to auto beside overflow-x, so a height cap on the region
    // is not supported: it would scroll vertically without a stop). Watched on the region (the viewport's width) and on
    // the region's children, the table (its columns and rows). The attribute is written here, not in the markup, where
    // Svelte flags a dynamic tabindex on a region (a11y_no_noninteractive_tabindex). Without a ResizeObserver (an
    // adopter's jsdom test) there is no stop.
    $effect(() => {
      const box = region();
      if (!box || typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(() => {
        if (box.scrollWidth > box.clientWidth) box.tabIndex = 0;
        else box.removeAttribute("tabindex");
      });
      for (const element of [box, ...box.children]) observer.observe(element);
      return () => observer.disconnect();
    });
  }
}
