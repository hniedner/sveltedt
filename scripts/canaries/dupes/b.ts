// Planted clone: the dupes step fails could-not-check unless jscpd reports this function in a.ts and b.ts.
export function total(items: { price: number; count: number }[]): number {
  let sum = 0;
  for (const item of items) {
    if (item.price > 0 && item.count > 0) {
      sum += item.price * item.count;
    }
  }
  return Math.round(sum * 100) / 100;
}
