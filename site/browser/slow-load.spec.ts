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
// 5 s on: "Still loading" and "Cancel" are in, and the boxes are still `first`
async function stillLoadingHolds(
  page: Page,
  first: Awaited<ReturnType<typeof boxes>>,
): Promise<void> {
  await page.clock.runFor(5000);
  await expect(page.getByRole("status")).toContainText("Still loading");
  await expect(named(page, "Cancel")).toBeVisible();
  expect(await boxes(page)).toEqual(first);
}
const indicator = (page: Page) => page.locator("[data-sdt-progress]");

// For each element whose own text holds `words` and whose box is wider and higher than 1 px, not clipped to less: whether
// it lies inside the table. Not clipped to less: no `clip-path` or `clip` on it or an ancestor, and its box cut by the
// box of each ancestor with an overflow rule is still wider and higher than 1 px (any clip only lowers the count)
const visibleCopies = (page: Page, words: string) =>
  page.evaluate((text) => {
    const seen = (el: Element): boolean => {
      let { left, right, top, bottom } = el.getBoundingClientRect();
      for (let at: Element | null = el; at; at = at.parentElement) {
        const style = getComputedStyle(at);
        if (style.clipPath !== "none" || style.clip !== "auto") return false;
        if (at !== el && style.overflow !== "visible") {
          const box = at.getBoundingClientRect();
          left = Math.max(left, box.left);
          right = Math.min(right, box.right);
          top = Math.max(top, box.top);
          bottom = Math.min(bottom, box.bottom);
        }
      }
      return right - left > 1 && bottom - top > 1;
    };
    const own = (el: Element): string =>
      Array.from(el.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join("");
    return Array.from(document.body.querySelectorAll("*"))
      .filter((el) => own(el).includes(text) && seen(el))
      .map((el) => el.closest("table") !== null);
  }, words);

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

// The page mounted `ready` with 25 rows, nothing loading, and drawn so
async function openReady(page: Page): Promise<void> {
  await open(page, "/slow.html?status=ready");
  await set(page, { rows: rows25 });
  await drawn(page, "ready");
  await expect(table(page)).toHaveAttribute("aria-busy", "false");
}
// Sets `busy` and checks the table says so
async function setBusy(page: Page, busy: boolean): Promise<void> {
  await set(page, { busy });
  await expect(table(page)).toHaveAttribute("aria-busy", String(busy));
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

// @spec("STATE-15", "8c82c7f5")
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
    await stillLoadingHolds(page, first);
  });

  test("moves nothing from the first busy until the answer: mounted with status 'ready' and 25 rows, busy from 100 ms to 7100 ms", async ({
    page,
  }) => {
    await openReady(page);
    await page.clock.runFor(100);
    await setBusy(page, true);
    await expect(indicator(page)).toHaveCount(0);
    const first = await boxes(page);
    await page.clock.runFor(1000);
    await expect(indicator(page)).toHaveCount(1);
    expect(await boxes(page)).toEqual(first);
    await stillLoadingHolds(page, first);
    await page.clock.runFor(1000);
    await setBusy(page, false);
    await expect(indicator(page)).toHaveCount(0);
    await expect(page.getByRole("status")).not.toContainText("Still loading");
    await expect(named(page, "Cancel")).toHaveCount(0);
    expect(await boxes(page)).toEqual(first);
  });

  test("moves the region down by the failed notice's height: mounted with status 'loading', status 'failed' from 6000 ms", async ({
    page,
  }) => {
    await open(page);
    await page.clock.runFor(6000);
    await expect(named(page, "Cancel")).toBeVisible();
    const first = await boxes(page);
    await set(page, { status: "failed" });
    await drawn(page, "failed");
    await expect(indicator(page)).toHaveCount(0);
    await expect(named(page, "Cancel")).toHaveCount(0);
    const notice = await page
      .getByRole("alert")
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(notice).toBeGreaterThan(0);
    const after = await boxes(page);
    expect(after.region[1] - first.region[1]).toBeCloseTo(notice, 1);
  });
});

// @spec("STATE-29", "1e92145d")
test.describe("STATE-29", () => {
  test("keeps no empty line above the region until the first load: status 'ready' with 25 rows, never loading or busy", async ({
    page,
  }) => {
    await openReady(page);
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
    // The wrapper of the status region is the status line; its box and the region's top are read together
    const line = () =>
      page.getByRole("status").evaluate((status) => {
        const wrapper = status.parentElement;
        const region = document.querySelector('[role="region"]');
        if (!wrapper || !region) throw new Error("no status line or region");
        return {
          top: region.getBoundingClientRect().top,
          height: wrapper.getBoundingClientRect().height,
          font: parseFloat(getComputedStyle(wrapper).fontSize),
        };
      });
    const before = await line();
    // The control: the same measure sees the reserved line once a load starts
    await setBusy(page, true);
    expect(await gap()).toBeGreaterThan(0);
    // The one move: by the height of the line (its 2.5em minimum), and no more
    const first = await line();
    expect(first.height).toBeCloseTo(2.5 * first.font, 1);
    expect(first.top - before.top).toBeGreaterThan(0);
    expect(first.top - before.top).toBeCloseTo(first.height - before.height, 1);
    // Not again: the indicator, the text, the end of the load and a second load leave the region where it is
    await page.clock.runFor(6000);
    await setBusy(page, false);
    expect((await line()).top).toBe(first.top);
    await setBusy(page, true);
    expect((await line()).top).toBe(first.top);
  });
});

// @spec("A11Y-32", "a688baf2")
test.describe("A11Y-32", () => {
  test("shows the still-loading text once: status 'loading' at 6000 ms", async ({
    page,
  }) => {
    await open(page);
    await page.clock.runFor(6000);
    await expect(page.locator("body")).toContainText("Still loading");
    expect(await visibleCopies(page, "Still loading")).toHaveLength(1);
  });

  test("shows the still-loading text once: status 'ready' with two rows, busy true at 6000 ms", async ({
    page,
  }) => {
    await open(page, "/slow.html?status=ready");
    await set(page, { rows: rows25.slice(0, 2), busy: true });
    await expect(table(page)).toHaveAttribute("aria-busy", "true");
    await page.clock.runFor(6000);
    await expect(page.locator("body")).toContainText("Still loading");
    expect(await visibleCopies(page, "Still loading")).toHaveLength(1);
  });

  test("shows the stopped message once, in the table: status 'stopped'", async ({
    page,
  }) => {
    await open(page);
    await set(page, { status: "stopped" });
    await drawn(page, "stopped");
    await expect(page.locator("body")).toContainText("Loading stopped");
    expect(await visibleCopies(page, "Loading stopped")).toEqual([true]);
  });
});

// Sets every animation of the indicator, found the first time and kept after, to `ms`, and reads at once (one task, so
// the page's time cannot move between): whether each is running and in its active phase, the indicator's `transform`,
// and how many of the indicator's animations run when asked afresh. Every call also checks that each kept animation
// still belongs to the indicator now on the page, so a swapped-out bar cannot pass. Playwright's clock does not fake the
// document timeline, so the animations are moved by `currentTime`, not by runFor
const seek = async (page: Page, ms: number) => {
  const read = await page.evaluate((time) => {
    const mine = window as unknown as { __animations?: Animation[] };
    const bar = () => document.querySelector("[data-sdt-progress]");
    mine.__animations ??= bar()?.getAnimations({ subtree: true }) ?? [];
    for (const animation of mine.__animations) animation.currentTime = time;
    return {
      stored: mine.__animations.length,
      attached: mine.__animations.every(
        (a) => (a.effect as KeyframeEffect | null)?.target === bar(),
      ),
      running: mine.__animations.map((a) => a.playState === "running"),
      active: mine.__animations.map(
        (a) => a.effect?.getComputedTiming().progress != null,
      ),
      transform: bar() ? getComputedStyle(bar() as Element).transform : "",
      fresh: (bar()?.getAnimations({ subtree: true }) ?? []).filter(
        (a) => a.playState === "running",
      ).length,
    };
  }, ms);
  expect(read.attached).toBe(true);
  return read;
};
const reduced = (page: Page) =>
  page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);

// @spec("STATE-13", "b6eb09ff")
test.describe("STATE-13", () => {
  test.use({ reducedMotion: "no-preference" });
  test("moves the indicator for 5 seconds after it appears and not after: status 'loading'", async ({
    page,
  }) => {
    await open(page);
    expect(await reduced(page)).toBe(false);
    await page.clock.runFor(1000);
    await expect(indicator(page)).toHaveCount(1);
    const start = await seek(page, 0);
    expect(start.stored).toBeGreaterThan(0);
    expect(start.running.every(Boolean)).toBe(true);
    expect(start.active.every(Boolean)).toBe(true);
    expect((await seek(page, 500)).transform).not.toBe(start.transform);
    await page.clock.runFor(4999);
    const last = await seek(page, 4999);
    expect(last.running.every(Boolean)).toBe(true);
    expect(last.active.every(Boolean)).toBe(true);
    await page.clock.runFor(1);
    await expect(page.getByRole("status")).toContainText("Still loading");
    await expect(indicator(page)).toHaveCount(1);
    const end = await seek(page, 5000);
    expect(end.running.some(Boolean)).toBe(false);
    expect(end.fresh).toBe(0);
  });
});

// @spec("STATE-14", "830fa296")
test.describe("STATE-14", () => {
  test.use({ reducedMotion: "reduce" });
  test("keeps the indicator still at 1000 ms and at 6000 ms: status 'loading'", async ({
    page,
  }) => {
    await open(page);
    expect(await reduced(page)).toBe(true);
    await page.clock.runFor(1000);
    await expect(indicator(page)).toHaveCount(1);
    // Still, not missing: the bar has a box, between "Export" and the region
    const place = await page.evaluate(() => {
      const box = (el: Element | null) => {
        if (!el) throw new Error("an element of the page is missing");
        return el.getBoundingClientRect();
      };
      const element = document.querySelector<HTMLElement>(
        "[data-sdt-progress]",
      );
      const bar = box(element);
      const buttons = Array.from(document.querySelectorAll("button"));
      const exported = buttons.find((b) => b.textContent.trim() === "Export");
      return {
        // The layout size, which a transform does not change
        width: element?.offsetWidth ?? 0,
        height: element?.offsetHeight ?? 0,
        top: bar.top,
        bottom: bar.bottom,
        exportBottom: box(exported ?? null).bottom,
        regionTop: box(document.querySelector('[role="region"]')).top,
      };
    });
    expect(place.width).toBeGreaterThan(1);
    expect(place.height).toBeGreaterThan(1);
    expect(place.top).toBeGreaterThanOrEqual(place.exportBottom);
    expect(place.bottom).toBeLessThanOrEqual(place.regionTop);
    expect((await seek(page, 0)).fresh).toBe(0);
    await page.clock.runFor(5000);
    await expect(page.getByRole("status")).toContainText("Still loading");
    await expect(indicator(page)).toHaveCount(1);
    expect((await seek(page, 5999)).fresh).toBe(0);
  });
});
