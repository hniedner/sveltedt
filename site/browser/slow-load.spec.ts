// The slow-load statements that need an engine (spec/table.md section 5), against site/slow.html. The clock is
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

// The page mounted `loading`, the clock paused at its start: nothing is due until a test runs time
async function open(page: Page): Promise<void> {
  await page.clock.install({ time: START });
  await page.clock.pauseAt(new Date(START.getTime() + 1000));
  await page.goto("/slow.html");
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

// The window's and the region's scroll positions
const scrolls = (page: Page) =>
  page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
    left: document.querySelector('[role="region"]')?.scrollLeft,
    top: document.querySelector('[role="region"]')?.scrollTop,
  }));

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

// The state a row names, drawn
async function drawn(page: Page, state: string): Promise<void> {
  if (state === "loading")
    await expect(page.getByRole("status")).toContainText("Loading data…");
  if (state === "ready")
    await expect(
      page.getByRole("cell", { name: "Item 25", exact: true }),
    ).toBeVisible();
  if (state === "stopped")
    await expect(table(page).getByText("Loading stopped")).toBeVisible();
  if (state === "failed")
    await expect(page.getByRole("alert")).toHaveText(
      "The data could not be loaded.",
    );
}

// @spec("A11Y-28", "724c142b")
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

// @spec("A11Y-30", "98aa4c29")
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
