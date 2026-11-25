// What the real-browser specs of the keyboard share: the key that moves focus on, A11Y-16's read, and the axe run.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

// The key that moves focus to the next stop. WebKit on macOS skips buttons on Tab under the system's default keyboard
// setting, and its keyboard users press Option+Tab (microsoft/playwright issue 41808); every other engine and platform
// tabs to buttons, and Alt+Tab would not move focus in Firefox.
export const tabKey = (browserName: string): string =>
  browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";

// A11Y-16's visible: rendered and not hidden by display, visibility, opacity or hidden, at any scroll position. The
// text is what a reader gets; the elements are named by their place in the tree.
export const visibleNow = (page: Page) =>
  page.evaluate(() => {
    const place = (el: Element): string => {
      const parent = el.parentElement;
      return parent === null
        ? el.tagName
        : `${place(parent)}>${el.tagName}${[...parent.children].indexOf(el)}`;
    };
    const shown = [...document.body.querySelectorAll("*")].filter((el) =>
      el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
    );
    return { text: document.body.innerText, elements: shown.map(place) };
  });

// Runs axe on the page. Pass: no serious or critical violation, and a node inside the table's root was analysed.
// Finding: the violations, printed with their rule ids. Could not check: nothing inside the table's root was analysed.
// Incomplete items are attached for the maintainer's manual contrast review and never count as a pass
export async function axeClean(page: Page, testInfo: TestInfo) {
  const results = await new AxeBuilder({ page }).analyze();
  await testInfo.attach("axe-incomplete", {
    body: JSON.stringify(results.incomplete, null, 2),
    contentType: "application/json",
  });
  const analysed = [...results.passes, ...results.incomplete].flatMap((rule) =>
    rule.nodes.map((node) => String(node.target[0])),
  );
  const inside = await page.evaluate(
    (targets) =>
      targets.some((t) => document.querySelector(t)?.closest(".sdt")),
    analysed,
  );
  expect(inside, "could not check: axe analysed nothing inside .sdt").toBe(
    true,
  );
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} (${v.impact})`),
  ).toEqual([]);
  return results;
}
