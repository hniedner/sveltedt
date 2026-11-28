import { untrack } from "svelte";

// A selection's values in one order, so two selections compare by their values, in whatever order `filters` lists
// them (FILT-61; FILT-32 fixes no order)
const key = (selection: readonly string[]): string =>
  JSON.stringify([...selection].sort());

// What a categorical filter's dialog shows and works from (FILT-61, FILT-62): the selection its last press emitted while
// `filters` has not answered it, else the applied one. Built by the part that shows the dialog, once, while it
// initialises
export class Picks {
  // The selections presses emitted that `filters` has not answered, oldest first; empty while the dialog waits for none
  // Stryker disable next-line ArrayDeclaration: the effect's first run, with the dialog closed, empties it before any read
  #sent = $state.raw<readonly (readonly string[])[]>([]);
  readonly #applied: () => readonly string[];

  constructor(applied: () => readonly string[], open: () => boolean) {
    this.#applied = applied;
    let before: string | undefined;
    $effect.pre(() => {
      const now = key(applied());
      const shown = open();
      untrack(() => {
        // Closing the dialog ends the wait (FILT-61)
        if (!shown) this.#sent = [];
        // A change of the applied selection to an earlier waiting press's answers that press only; any other change
        // ends the wait; an equal selection given again is no change (FILT-61)
        else if (now !== before) {
          const at = this.#sent
            .slice(0, -1)
            .findIndex((each) => key(each) === now);
          this.#sent = at < 0 ? [] : this.#sent.toSpliced(at, 1);
        }
        before = now;
      });
    });
  }

  get selected(): readonly string[] {
    return this.#sent.at(-1) ?? this.#applied();
  }

  // A press: the dialog shows and works from its selection until `filters` answers it or the dialog closes
  press(next: readonly string[]): void {
    this.#sent = [...this.#sent, next];
  }
}
