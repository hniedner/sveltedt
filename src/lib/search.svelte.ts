// Adapted from ontoprism, frontend/src/lib/components/data-table/DataTableFilterPopover.svelte (Apache License 2.0,
// the owner's own project): the pause timer with its cancel and teardown, and the apply step that compares the text
// with the applied one and emits.

// Unicode category Cc: U+0000-U+001F and U+007F-U+009F; U+0085 is one, although `trim` does not remove it
const CONTROL = /\p{Cc}/u;

// The state of the search field: the text as typed and the pause timer (PRD-B2). Built by the part that shows the
// field, once, while that part initialises
export class SearchText {
  // The field's text as typed; null: it shows the applied search, which is the one source of truth
  own = $state<string | null>(null);
  // Typed since the last emit; a plain field, so the effect below does not rerun on it (`own` does, via `own?.trim()`)
  #newer = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  readonly #applied: () => string;
  readonly #settings: () => {
    delay: number;
    onEnter: boolean;
    maxLength: number;
  };
  readonly #emit: (text: string) => void;

  constructor(
    applied: () => string,
    settings: () => { delay: number; onEnter: boolean; maxLength: number },
    emit: (text: string) => void,
  ) {
    this.#applied = applied;
    this.#settings = settings;
    this.#emit = emit;
    // A changed applied search replaces the field's text, unless newer typing holds it (FILT-44, FILT-49) or it is the
    // field's own text trimmed (FILT-58)
    $effect.pre(() => {
      const now = this.#applied();
      if (!this.#newer && now !== this.own?.trim()) this.own = null;
    });
    // A pause that is still running when the field goes emits nothing (FOOT-05)
    $effect(() => () => clearTimeout(this.#timer));
  }

  get text(): string {
    return this.own ?? this.#applied();
  }

  // The text as emitted: without its leading and trailing white space (FILT-57)
  get trimmed(): string {
    return this.text.trim();
  }

  // Refused (FILT-42): the trimmed text holds a control character, or is longer than `maxLength` in code points
  get refused(): boolean {
    const text = this.trimmed;
    return CONTROL.test(text) || [...text].length > this.#settings().maxLength;
  }

  // Every input event: the new text, then the pause. Under searchOnEnter only Enter applies (FILT-28); a delay of 0
  // applies at once (FILT-01)
  input(value: string): void {
    this.own = value;
    this.#newer = true;
    clearTimeout(this.#timer);
    const { delay, onEnter } = this.#settings();
    if (onEnter) return;
    if (delay === 0) this.apply();
    else this.#timer = setTimeout(() => this.apply(), delay);
  }

  // The pause ending or Enter: emits the trimmed text unless it is refused (FILT-42) or equals the applied one
  // (FILT-27, FILT-57); the pause then emits nothing more
  apply(): void {
    clearTimeout(this.#timer);
    if (this.refused) return;
    const text = this.trimmed;
    // Cleared before the equality return: a field that holds the applied text has taken it (FILT-44)
    this.#newer = false;
    if (text === this.#applied()) return;
    this.#emit(text);
  }
}
