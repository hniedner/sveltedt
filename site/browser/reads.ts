// What the real-browser specs share: the key that moves focus on, A11Y-16's read, the axe run, the focus ring's read
// and the wait for two frames.
import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

// The test page of the table (site/table.html and table-plain.html) lets a test change its props
export type TableWindow = Window & { __table: { set(props: object): void } };

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

// Runs axe on the page. Pass: no serious or critical violation, and a rule passed on a node inside .sdt (a mustPass
// rule too, when named). Finding: the violations, printed with their rule ids. Could not check: no such pass.
// Incomplete items are attached for manual review and never count as a pass. The guard is weak by design: the node
// inside .sdt may be a heading or the status node, not the table itself
export async function axeClean(
  page: Page,
  testInfo: TestInfo,
  mustPass?: string,
) {
  const results = await new AxeBuilder({ page }).analyze();
  await testInfo.attach("axe-incomplete", {
    body: JSON.stringify(results.incomplete, null, 2),
    contentType: "application/json",
  });
  // The passes of the rules asked for (all rules when none is named) that touch a node inside .sdt
  const passedInside = (id?: string) =>
    page.evaluate(
      (targets) =>
        targets.some((t) => document.querySelector(t)?.closest(".sdt")),
      results.passes
        .filter((rule) => id === undefined || rule.id === id)
        .flatMap((rule) => rule.nodes.map((node) => String(node.target[0]))),
    );
  expect(
    await passedInside(),
    "could not check: axe passed nothing inside .sdt",
  ).toBe(true);
  if (mustPass !== undefined)
    expect(
      await passedInside(mustPass),
      `could not check: ${mustPass} passed nothing inside .sdt`,
    ).toBe(true);
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} (${v.impact})`),
  ).toEqual([]);
  return results;
}

// The region's outline as the browser computes it. The statement also accepts a box shadow; no engine's own ring is
// one, so a rule that moves the indicator to a shadow extends this read
export const ring = (region: Locator) =>
  region.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      style: style.outlineStyle,
      width: parseFloat(style.outlineWidth),
      color: style.outlineColor,
    };
  });

// The alpha of a computed colour: rgb() and rgba() (comma or space separated), and color(<space> ...) with or without
// "/ alpha". A form it cannot read is a test to fix, never a pass
function alphaOf(color: string): number {
  const slash = /^(?:rgb|rgba|color)\([^/)]*\/\s*([\d.]+)(%?)\s*\)$/.exec(
    color,
  );
  if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1);
  if (/^(?:rgb|color)\([^/,)]*\)$/.test(color)) return 1;
  const comma =
    /^rgba?\(\s*[\d.]+,\s*[\d.]+,\s*[\d.]+(?:,\s*([\d.]+))?\s*\)$/.exec(color);
  if (comma) return comma[1] === undefined ? 1 : Number(comma[1]);
  throw new Error(`could not check: no alpha read from the colour ${color}`);
}

// A11Y-07's and THEME-06's read of the keyboard-focused region: it matches :focus-visible, and its ring is drawn, wide
// enough, not transparent and not the unfocused one
export async function expectRing(
  region: Locator,
  unfocused: Awaited<ReturnType<typeof ring>>,
): Promise<void> {
  expect(
    await region.evaluate((element) => element.matches(":focus-visible")),
    "could not check: the region does not match :focus-visible",
  ).toBe(true);
  const focused = await ring(region);
  expect(focused.style).not.toBe("none");
  expect(focused.width).toBeGreaterThanOrEqual(1);
  expect(alphaOf(focused.color)).toBeGreaterThan(0);
  expect(focused).not.toEqual(unfocused);
}

// Two frames later: pending effects, observers and paint have run (a resize observer's callback is one use)
export const settled = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
