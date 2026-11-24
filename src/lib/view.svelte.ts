import { untrack } from "svelte";

// The slow-load state of PRD-B2, one per table: `shown` is the progress indicator being in the component, `held` its
// 500 ms minimum still running, `still` the still-loading text being shown. Read as `view.still`, never destructured,
// so the reads stay reactive
export class TableView {
  shown = $state(false);
  // Stryker disable next-line BooleanLiteral: equivalent, a wrongly true start only skips a reset of shown and still, which are false then
  held = $state(false);
  still = $state(false);

  // Built only while a component initialises (its effects need that context), at the place the table's script gives
  // it. `pending` is read in the first effect, so a change of it reruns that one; `ending` is the table's focus
  // hand-off
  constructor(pending: () => boolean, ending: () => void) {
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
  }
}
