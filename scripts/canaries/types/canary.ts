// Planted type error: the types step fails could-not-check unless tsc reports it.
export const n: number = "one";
// Strictness: an implicit any is an error only under strict (noImplicitAny).
export function same(x) {
  return x;
}
