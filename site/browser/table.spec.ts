// The statements of the wide table's keyboard and focus that need an engine (spec/table.md: A11Y-12), against
// site/table.html: its tables overflow only because every column is at least 120 px wide (site/src/table.css).
import { expect, test, type Page } from "@playwright/test";
import { open } from "./csp.ts";
import { tabKey } from "./reads.ts";

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
  await expect.poll(() => settledLeft(page)).toBeGreaterThan(0);
  const right = await settledLeft(page);
  await expect
    .poll(pressUntil(page, "ArrowLeft", (position) => position < right))
    .toBe(true);
});
