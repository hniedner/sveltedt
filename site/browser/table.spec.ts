// The statements of the wide table's keyboard and focus that need an engine (spec/table.md: A11Y-12), against
// site/table.html: its tables overflow only because every column is at least 120 px wide (site/src/table.css). The
// proof that the effect writing the region's tabindex is needed comes from Chromium row 5 (a cell link) and WebKit
// rows 2-5: with the writes deleted those fail there, and Firefox passes natively.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { open } from "./csp.ts";
import { tabKey, visibleNow } from "./reads.ts";

type TableWindow = Window & { __table: { set(props: object): void } };

const region = (page: Page) =>
  page.getByRole("region", { name: "Orders table" });
const exportButton = (page: Page) =>
  page.getByRole("button", { name: "Export", exact: true });

// Where focus is, as the spec's examples name it: the region, or the text of the link or button that has it
const focused = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement;
    if (element === null || element === document.body) return "the body";
    return element.getAttribute("role") === "region"
      ? "the region"
      : (element.textContent ?? "").trim();
  });

// Two frames later: a resize observer's callback has run and its attribute is on the element
const settled = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );

// Opens the page at the viewport's width; the table has to be as the examples say before anything is read
async function start(page: Page, width: number, query = ""): Promise<void> {
  await page.setViewportSize({ width, height: 720 });
  await open(page, `/table.html${query}`);
  await expect(region(page)).toBeVisible();
  await expect(
    page.locator("th").first(),
    "could not check: no headers",
  ).toBeVisible();
  const narrowest = await page
    .locator("th")
    .evaluateAll((cells) =>
      Math.min(...cells.map((cell) => cell.getBoundingClientRect().width)),
    );
  expect(
    narrowest,
    "could not check: a header is under 120 px",
  ).toBeGreaterThanOrEqual(120);
}

// Whether the table is wider than the region, which the example needs to be so (or not)
async function expectOverflow(page: Page, wanted: boolean): Promise<void> {
  const wider = await region(page).evaluate(
    (element) => element.scrollWidth > element.clientWidth,
  );
  expect(
    wider,
    `could not check: the table ${wanted ? "fits" : "overflows"}`,
  ).toBe(wanted);
}

// A11Y-12's "yes" rows need a scroll container, not a clipped box: the statement says "a scroll container whose content
// overflows", and the effect reads the widths only
async function expectScroller(page: Page): Promise<void> {
  const overflowX = await region(page).evaluate(
    (element) => getComputedStyle(element).overflowX,
  );
  expect(
    ["auto", "scroll"],
    `could not check: the region's overflow-x is ${overflowX}`,
  ).toContain(overflowX);
}

// One Tab from "Export", the focusable element just before the table; returns where focus is then
async function tabFromExport(page: Page, browserName: string): Promise<string> {
  await exportButton(page).focus();
  await expect(
    exportButton(page),
    "could not check: Export holds no focus",
  ).toBeFocused();
  await page.keyboard.press(tabKey(browserName));
  return focused(page);
}

// The region's element now, to prove later that it is the same one and nothing was remounted
const keep = (page: Page) => region(page).elementHandle();
async function expectSame(page: Page, kept: Awaited<ReturnType<typeof keep>>) {
  const same = await kept?.evaluate(
    (element) =>
      element.isConnected &&
      element === document.querySelector('[role="region"]'),
  );
  expect(same, "could not check: the table was remounted").toBe(true);
}

// The region is a stop: the Tab polls, since the observer's update is not raced
const expectStop = (page: Page, browserName: string) =>
  expect.poll(() => tabFromExport(page, browserName)).toBe("the region");

// The region is no stop: read once, after the frames in which the observer could have set it
async function expectNoStop(page: Page, browserName: string): Promise<void> {
  await settled(page);
  expect(await tabFromExport(page, browserName)).toBe("After the table");
}

// @spec("A11Y-12", "00a0cf42")
test.describe("A11Y-12, the region is in the Tab order exactly while its content overflows", () => {
  test("3 short columns in 1280 px: no", async ({ page, browserName }) => {
    await start(page, 1280);
    await expectOverflow(page, false);
    await expectNoStop(page, browserName);
  });

  test("30 columns in 600 px: yes", async ({ page, browserName }) => {
    await start(page, 600, "?cols=30");
    await expectOverflow(page, true);
    await expectScroller(page);
    await expectStop(page, browserName);
  });

  test("the 30 columns, then 4000 px without a remount: no", async ({
    page,
    browserName,
  }) => {
    await start(page, 600, "?cols=30");
    await expectOverflow(page, true);
    await expectScroller(page);
    await expectStop(page, browserName);
    const kept = await keep(page);
    await page.setViewportSize({ width: 4000, height: 720 });
    await expectSame(page, kept);
    await expectOverflow(page, false);
    await expectNoStop(page, browserName);
  });

  test("3 columns in 600 px, then rerendered with 30: yes", async ({
    page,
    browserName,
  }) => {
    await start(page, 600);
    await expectOverflow(page, false);
    await expectNoStop(page, browserName);
    const kept = await keep(page);
    await page.evaluate(() =>
      (window as unknown as TableWindow).__table.set({ cols: 30 }),
    );
    await expectSame(page, kept);
    await expectOverflow(page, true);
    await expectScroller(page);
    await expectStop(page, browserName);
  });

  test("30 columns with a cell link: Tab from Export lands on the region, the next Tab on Open Beta", async ({
    page,
    browserName,
  }) => {
    await start(page, 600, "?cols=30&link");
    await expectOverflow(page, true);
    await expectScroller(page);
    await expectStop(page, browserName);
    await page.keyboard.press(tabKey(browserName));
    expect(await focused(page)).toBe("Open Beta");
  });
});

const left = (page: Page) =>
  region(page).evaluate((element) => element.scrollLeft);

// The region's scroll position once it has stopped moving (a smooth scroll is still on its way), NaN while it moves
const settledLeft = async (page: Page): Promise<number> => {
  const before = await left(page);
  await settled(page);
  return (await left(page)) === before ? before : NaN;
};

// WebKit drops arrow presses that follow one another at once. A poll for the position the key must reach repeats the
// press until it has had its effect, and the poll's own intervals space the presses: no fixed wait
const pressUntil =
  (page: Page, key: string, reached: (position: number) => boolean) =>
  async (): Promise<boolean> => {
    const position = await left(page);
    if (!reached(position)) await page.keyboard.press(key);
    return reached(position);
  };

// @spec("A11Y-08", "c33a1c9f")
test("A11Y-08: the arrow keys scroll the focused region sideways", async ({
  page,
  browserName,
}) => {
  await start(page, 600, "?cols=30");
  await expectOverflow(page, true);
  await expectStop(page, browserName);
  expect(await left(page), "could not check: the region starts scrolled").toBe(
    0,
  );
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await expect
    .poll(pressUntil(page, "ArrowRight", (position) => position > 0))
    .toBe(true);
  let right = NaN;
  await expect
    .poll(async () => {
      right = await settledLeft(page);
      return right > 0;
    })
    .toBe(true);
  await expect
    .poll(pressUntil(page, "ArrowLeft", (position) => position < right))
    .toBe(true);
});

// The region's outline as the browser computes it. The statement also accepts a box shadow; no engine's own ring is one,
// so a rule that moves the indicator to a shadow extends this read
const ring = (page: Page) =>
  region(page).evaluate((element) => {
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

// @spec("A11Y-07", "17996113")
test("A11Y-07: the region shows a visible focus indicator when focused by keyboard", async ({
  page,
  browserName,
}) => {
  await start(page, 600, "?cols=30");
  await expectOverflow(page, true);
  await expectScroller(page);
  const unfocused = await ring(page);
  await expectStop(page, browserName);
  expect(
    await region(page).evaluate((element) => element.matches(":focus-visible")),
    "could not check: the region does not match :focus-visible",
  ).toBe(true);
  const ringFocused = await ring(page);
  expect(ringFocused.style).not.toBe("none");
  expect(ringFocused.width).toBeGreaterThanOrEqual(1);
  expect(alphaOf(ringFocused.color)).toBeGreaterThan(0);
  expect(ringFocused).not.toEqual(unfocused);
});

// @spec("A11Y-13", "ee07066b")
test("A11Y-13: the caption is hidden visually and still names the table", async ({
  page,
}) => {
  await start(page, 1280);
  const caption = page.locator("caption");
  await expect(caption, "could not check: no caption on the page").toHaveCount(
    1,
  );
  const box = await caption.boundingBox();
  expect(box, "could not check: the caption has no box").not.toBeNull();
  expect(box?.width).toBeLessThanOrEqual(1);
  expect(box?.height).toBeLessThanOrEqual(1);
  await expect(
    page.getByRole("table", { name: "Orders", exact: true }),
  ).toBeVisible();
});

// The 25 rows' names as the page gives them: Beta and Gamma first (site/src/TablePage.svelte)
const names = Array.from({ length: 25 }, (_, index) =>
  index < 2
    ? ["Beta", "Gamma"][index]
    : `Item ${String(index + 1).padStart(2, "0")}`,
);

// A11Y-16: after each step the visible text and elements equal those before it. The page is the 30 by 25 table with a
// link per row at 600 px; every hover is checked to have happened, every focus to be on the element named
async function startVisible(page: Page) {
  await start(page, 600, "?cols=30&link");
  await expect(page.locator("tbody tr")).toHaveCount(25);
  const before = await visibleNow(page);
  expect(
    before.elements.length,
    "could not check: nothing is visible",
  ).toBeGreaterThan(0);
  return before;
}

// @spec("A11Y-16", "1044412e")
test.describe("A11Y-16, hovering or focusing makes nothing appear", () => {
  async function hoverAll(page: Page, cells: Locator): Promise<void> {
    const before = await startVisible(page);
    const count = await cells.count();
    expect(count, "could not check: 30 cells are not there").toBe(30);
    for (let index = 0; index < count; index++) {
      await cells.nth(index).hover();
      expect(
        await cells.nth(index).evaluate((cell) => cell.matches(":hover")),
        `could not check: cell ${index + 1} is not hovered`,
      ).toBe(true);
      expect(
        await visibleNow(page),
        `after hovering cell ${index + 1}`,
      ).toEqual(before);
    }
  }

  test("every header cell", async ({ page }) => {
    await hoverAll(page, page.locator("thead th"));
  });

  for (const [index, name] of names.entries())
    test(`every cell of the row ${name}`, async ({ page }) => {
      await hoverAll(page, page.locator("tbody tr").nth(index).locator("td"));
    });

  test("the region and each link", async ({ page, browserName }) => {
    const before = await startVisible(page);
    await expectStop(page, browserName);
    expect(await visibleNow(page), "after focusing the region").toEqual(before);
    for (const name of names) {
      await page.keyboard.press(tabKey(browserName));
      expect(
        await focused(page),
        "could not check: the link has no focus",
      ).toBe(`Open ${name}`);
      expect(await visibleNow(page), `after focusing Open ${name}`).toEqual(
        before,
      );
    }
  });
});

// @spec("A11Y-10", "0681da42")
test.describe("A11Y-10, the Tab order follows the reading order", () => {
  // The table fits, so the region is no stop (A11Y-12 proves where it sits when it is). Tab on from the start of the page,
  // which must have focus on the body
  async function order(
    page: Page,
    browserName: string,
    query: string,
  ): Promise<string[]> {
    await start(page, 1280, query);
    await expectOverflow(page, false);
    await settled(page);
    expect(
      await focused(page),
      "could not check: focus is not on the body",
    ).toBe("the body");
    const reached: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press(tabKey(browserName));
      reached.push(await focused(page));
    }
    return reached;
  }
  const links = ["Open Beta", "Edit Beta", "Open Gamma", "Edit Gamma"];

  test("Export, then the links of Beta and Gamma", async ({
    page,
    browserName,
  }) => {
    expect(await order(page, browserName, "?cols=2&rows=2&link&edit")).toEqual([
      "Export",
      ...links,
      "After the table",
    ]);
  });

  test("with a heading link: All orders first", async ({
    page,
    browserName,
  }) => {
    expect(
      await order(page, browserName, "?cols=2&rows=2&link&edit&heading"),
    ).toEqual(["All orders", "Export", ...links]);
  });
});
