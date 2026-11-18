// Planted violations: the lint step fails could-not-check unless ESLint raises every rule and ban message
// LINT_CANARY_RULES (scripts/check-repo.ts) lists for this extension, a rune module's own config.
export const a: any = 1;
// @ts-ignore
export const off: number = "one";
export function inject(el: HTMLElement, html: string): void {
  el.innerHTML = html;
}
