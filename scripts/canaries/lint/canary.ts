// Planted violations: the lint step fails could-not-check unless ESLint reports every one of them in a .ts file.
export const a: any = eval("1");
export const b = setTimeout("a()", 1);
export const c = new Function("return 1");
export async function d(): Promise<void> {
  Promise.resolve(1);
}
export function e(x: number): number {
  if (x === 0) return 0;
  if (x === 1) return 1;
  if (x === 2) return 2;
  if (x === 3) return 3;
  if (x === 4) return 4;
  if (x === 5) return 5;
  if (x === 6) return 6;
  if (x === 7) return 7;
  if (x === 8) return 8;
  if (x === 9) return 9;
  if (x === 10) return 10;
  if (x === 11) return 11;
  if (x === 12) return 12;
  if (x === 13) return 13;
  if (x === 14) return 14;
  if (x === 15) return 15;
  if (x === 16) return 16;
  if (x === 17) return 17;
  if (x === 18) return 18;
  if (x === 19) return 19;
  if (x === 20) return 20;
  return -1;
}
// Above the browser floor (PRD-E1): IdleDetector is in no floor browser.
export const idle = new IdleDetector();
