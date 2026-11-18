// Planted violations: the lint step fails could-not-check unless ESLint raises every rule and ban message
// LINT_CANARY_RULES (scripts/check-repo.ts) lists for this extension; plants that share a message count once.
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
// Above the browser floor (PRD-E1): IdleDetector is missing from Firefox and Safari.
export const idle = new IdleDetector();
// Refused by typescript-eslint's ban-ts-comment: a comment that switches type checking off for the next line.
// @ts-ignore
export const off: number = "one";
export function inject(el: HTMLElement, html: string): void {
  el.setAttribute("style", "color: red");
  document.head.append(document.createElement("style"));
  el.innerHTML = html;
  el.insertAdjacentHTML("beforeend", html);
  el.setAttribute("srcdoc", html);
  el.setHTMLUnsafe(html);
  document.createRange().createContextualFragment(html);
  document.write(html);
  new DOMParser().parseFromString(html, "text/html");
  Document.parseHTMLUnsafe(html);
  Object.assign(el, { innerHTML: html });
  el.setHTML(html);
  document.adoptedStyleSheets = [new CSSStyleSheet()];
  document.execCommand("insertHTML", false, html);
  Document.parseHTML(html);
  el["insertAdjacentHTML"]("beforeend", html);
  document.createElementNS("http://www.w3.org/2000/svg", "style");
  document.styleSheets[0]?.insertRule("p {}");
}
