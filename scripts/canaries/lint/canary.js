// Planted violations: the lint step fails could-not-check unless ESLint raises every rule and ban message
// LINT_CANARY_RULES (scripts/check-repo.ts) lists for this extension; plants that share a message count once.
export const a = eval("1");
export const b = setTimeout("a()", 1);
// The only no-new-func violation, behind an inline disable: it is raised only while inline configuration is ignored.
// eslint-disable-next-line no-new-func
export const c = new Function("return 1");
export const d = undefinedName;
export function e(x) {
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
export function inject(el, html) {
  el.innerHTML = html;
}
