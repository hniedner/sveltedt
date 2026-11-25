// The slow-load statements that need an engine (spec/table.md section 3: A11Y-28, A11Y-30), against site/slow.html. The clock is
// Playwright's, paused before the page loads: page time moves only by runFor, so "6000 ms" is exact.
import { expect, test, type Locator, type Page } from "@playwright/test";

type SlowWindow = Window & {
  __calls: { cancel: number; retry: number };
  __table: { set(props: object): void };
};

const START = new Date("2026-01-01T00:00:00Z");
const rows25 = Array.from({ length: 25 }, (_, index) => {
  const n = String(index + 1).padStart(2, "0");
  return { id: `r${n}`, name: `Item ${n}` };
});

// The page mounted `loading` (or in the status its address names), the clock paused at its start: nothing is due
// until a test runs time
async function open(page: Page, address = "/slow.html"): Promise<void> {
  await page.clock.install({ time: START });
  await page.clock.pauseAt(new Date(START.getTime() + 1000));
  await page.goto(address);
  await expect(page.getByRole("table", { name: "Orders" })).toBeVisible();
}
const set = (page: Page, props: object) =>
  page.evaluate(
    (next) => (window as unknown as SlowWindow).__table.set(next),
    props,
  );
const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as SlowWindow).__calls);
const table = (page: Page) => page.getByRole("table", { name: "Orders" });
const named = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

// The window's and the region's scroll positions. The region scrolls only once it has an overflow rule (A11Y-12, #22):
// until then its two values stay 0 and only the window's can differ
const scrolls = (page: Page) =>
  page.evaluate(() => {
    const region = document.querySelector('[role="region"]');
    if (!region) throw new Error("no region on the page");
    return {
      x: window.scrollX,
      y: window.scrollY,
      left: region.scrollLeft,
      top: region.scrollTop,
    };
  });

// Focuses without scrolling, as the statements say, and checks the button holds the focus
async function focusIt(button: Locator): Promise<void> {
  await button.evaluate((el) =>
    (el as HTMLElement).focus({ preventScroll: true }),
  );
  await expect(button).toBeFocused();
}

// Scrolls the window until the whole table lies above the viewport, and checks it does
async function scrollPast(page: Page): Promise<void> {
  await page.evaluate(() => {
    const box = document.querySelector("table")?.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + (box?.bottom ?? 0) + 10);
  });
  const bottom = await table(page).evaluate(
    (el) => el.getBoundingClientRect().bottom,
  );
  expect(bottom).toBeLessThan(0);
}

// The x, y, width and height of the region and of the paragraph after the table
const boxes = async (page: Page) => {
  const read = (locator: Locator) =>
    locator.evaluate((el) => {
      const { x, y, width, height } = el.getBoundingClientRect();
      return [x, y, width, height];
    });
  return {
    region: await read(page.getByRole("region", { name: "Orders table" })),
    after: await read(page.getByText("After the table.")),
  };
};
const indicator = (page: Page) => page.locator("[data-sdt-progress]");

// The state a row names, drawn
async function drawn(page: Page, state: string): Promise<void> {
  switch (state) {
    case "loading":
      await expect(page.getByRole("status")).toContainText("Loading data…");
      break;
    case "ready":
      await expect(
        page.getByRole("cell", { name: "Item 25", exact: true }),
      ).toBeVisible();
      break;
    case "stopped":
      await expect(table(page).getByText("Loading stopped")).toBeVisible();
      break;
    case "failed":
      await expect(page.getByRole("alert")).toHaveText(
        "The data could not be loaded.",
      );
      break;
    default:
      throw new Error(`no such state: ${state}`);
  }
}

// @spec("A11Y-28", "1f207c4c")
test.describe("A11Y-28", () => {
  const consumer: [string, string, object][] = [
    ["status 'ready' with 25 rows", "ready", { status: "ready", rows: rows25 }],
    ["status 'stopped'", "stopped", { status: "stopped" }],
    ["status 'failed'", "failed", { status: "failed" }],
  ];
  for (const [title, state, props] of consumer)
    test(`moves focus to the table without scrolling when a focused Cancel goes: the consumer passes ${title}`, async ({
      page,
    }) => {
      await open(page);
      await page.clock.runFor(6000);
      const cancel = named(page, "Cancel");
      await expect(cancel).toBeVisible();
      await focusIt(cancel);
      await scrollPast(page);
      const before = await scrolls(page);
      await set(page, props);
      await drawn(page, state);
      await expect(cancel).toHaveCount(0);
      await expect(table(page)).toBeFocused();
      expect(await scrolls(page)).toEqual(before);
    });
});

// @spec("A11Y-30", "4eff370c")
test.describe("A11Y-30", () => {
  const consumer: [string, string, string, object][] = [
    ["stopped", "loading", "loading", { status: "loading" }],
    ["failed", "loading", "loading", { status: "loading" }],
    [
      "stopped",
      "ready with 25 rows",
      "ready",
      { status: "ready", rows: rows25 },
    ],
  ];
  for (const [before, title, state, props] of consumer)
    test(`moves focus to the table without scrolling when a focused Try again goes: status '${before}', the consumer passes ${title}`, async ({
      page,
    }) => {
      await open(page);
      await set(page, { status: before });
      await drawn(page, before);
      const retry = named(page, "Try again");
      await expect(retry).toBeVisible();
      await focusIt(retry);
      await scrollPast(page);
      await page.keyboard.press("Enter");
      expect((await calls(page)).retry).toBe(1);
      const scrolled = await scrolls(page);
      await set(page, props);
      await drawn(page, state);
      await expect(retry).toHaveCount(0);
      await expect(table(page)).toBeFocused();
      expect(await scrolls(page)).toEqual(scrolled);
    });
});

// @spec("STATE-15", "20ad00d6")
test.describe("STATE-15", () => {
  test("moves nothing when the indicator, the still-loading text and Cancel appear: mounted with status 'loading'", async ({
    page,
  }) => {
    await open(page);
    await page.clock.runFor(500);
    await expect(indicator(page)).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("Loading data…");
    const first = await boxes(page);
    await page.clock.runFor(500);
    await expect(indicator(page)).toHaveCount(1);
    expect(await boxes(page)).toEqual(first);
    await page.clock.runFor(5000);
    await expect(page.getByRole("status")).toContainText("Still loading");
    await expect(named(page, "Cancel")).toBeVisible();
    expect(await boxes(page)).toEqual(first);
  });

  test("moves nothing from the first busy until the answer: mounted with status 'ready' and 25 rows, busy from 100 ms to 7100 ms", async ({
    page,
  }) => {
    await open(page, "/slow.html?status=ready");
    await set(page, { rows: rows25 });
    await drawn(page, "ready");
    await expect(table(page)).toHaveAttribute("aria-busy", "false");
    await page.clock.runFor(100);
    await set(page, { busy: true });
    await expect(table(page)).toHaveAttribute("aria-busy", "true");
    await expect(indicator(page)).toHaveCount(0);
    const first = await boxes(page);
    await page.clock.runFor(1000);
    await expect(indicator(page)).toHaveCount(1);
    expect(await boxes(page)).toEqual(first);
    await page.clock.runFor(5000);
    await expect(page.getByRole("status")).toContainText("Still loading");
    await expect(named(page, "Cancel")).toBeVisible();
    expect(await boxes(page)).toEqual(first);
    await page.clock.runFor(1000);
    await set(page, { busy: false });
    await expect(table(page)).toHaveAttribute("aria-busy", "false");
    await expect(indicator(page)).toHaveCount(0);
    await expect(page.getByRole("status")).not.toContainText("Still loading");
    await expect(named(page, "Cancel")).toHaveCount(0);
    expect(await boxes(page)).toEqual(first);
  });
});

// @spec("STATE-29", "abeffc81")
test.describe("STATE-29", () => {
  test("keeps no empty line above the region until the first load: status 'ready' with 25 rows, never loading or busy", async ({
    page,
  }) => {
    await open(page, "/slow.html?status=ready");
    await set(page, { rows: rows25 });
    await drawn(page, "ready");
    await expect(table(page)).toHaveAttribute("aria-busy", "false");
    await expect(page.getByRole("status")).toHaveText("");
    const gap = () =>
      page.getByRole("status").evaluate((status) => {
        const region = document.querySelector('[role="region"]');
        if (!region) throw new Error("no region on the page");
        return (
          region.getBoundingClientRect().top -
          status.getBoundingClientRect().bottom
        );
      });
    expect(await gap()).toBe(0);
    // The control: the same measure sees the reserved line once a load starts
    await set(page, { busy: true });
    await expect(table(page)).toHaveAttribute("aria-busy", "true");
    expect(await gap()).toBeGreaterThan(0);
  });
});
