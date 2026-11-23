// Planted for the mutation step: the test checks `sign` for one input only, so every mutant of its condition
// survives; `twice` is checked and its mutants die. A run that shows neither is not a run the step can trust.
export const sign = (n: number): number => (n < 0 ? 1 : 1);
export const twice = (n: number): number => n * 2;
