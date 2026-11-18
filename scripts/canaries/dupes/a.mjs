// Planted clone: the dupes step fails could-not-check unless jscpd reports this function in a.mjs and b.mjs.
export function total(items) {
  let sum = 0;
  for (const item of items) {
    if (item.price > 0 && item.count > 0) {
      sum += item.price * item.count;
    }
  }
  return Math.round(sum * 100) / 100;
}
