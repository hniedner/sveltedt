// Adapted from ontoprism, frontend/src/lib/components/data-table/DataTableFilterPopover.svelte (Apache License 2.0,
// the owner's own project): the pause timer with its cancel and teardown, and the apply step that compares the text
// with the applied one and emits.

// The state of the search field: the text as typed and the pause timer (PRD-B2). Built by the part that shows the
// field, once, while that part initialises
export class SearchText {
  // The field's text as typed; null: it shows the applied search, which is the one source of truth
  own = $state<string | null>(null);
  #timer: ReturnType<typeof setTimeout> | undefined;
  readonly #applied: () => string;
  readonly #settings: () => { delay: number; onEnter: boolean };
  readonly #emit: (text: string) => void;

  constructor(
    applied: () => string,
    settings: () => { delay: number; onEnter: boolean },
    emit: (text: string) => void,
  ) {
    this.#applied = applied;
    this.#settings = settings;
    this.#emit = emit;
    // A pause that is still running when the field goes emits nothing (FOOT-05)
    $effect(() => () => clearTimeout(this.#timer));
  }

  get text(): string {
    return this.own ?? this.#applied();
  }

  // Every input event: the new text, then the pause. Under searchOnEnter only Enter applies (FILT-28); a delay of 0
  // applies at once (FILT-01)
  input(value: string): void {
    this.own = value;
    clearTimeout(this.#timer);
    const { delay, onEnter } = this.#settings();
    if (onEnter) return;
    if (delay === 0) this.apply();
    else this.#timer = setTimeout(() => this.apply(), delay);
  }

  // The pause ending or Enter: emits the text unless it equals the applied one (FILT-27); the pause then emits nothing
  // more
  apply(): void {
    clearTimeout(this.#timer);
    const text = this.text;
    if (text !== this.#applied()) this.#emit(text);
  }
}
