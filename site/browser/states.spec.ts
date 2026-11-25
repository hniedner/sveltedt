// The statements that hold in every state of the table (spec/table.md: A11Y-06), against site/table.html and
// site/table-plain.html. The states are the rows of A11Y-06's table; the real clock runs, so "loading" is read before
// or after the progress indicator and the still-loading text, which A11Y-25 owns.
import { expect, test, type Page } from "@playwright/test";
import { open } from "./csp.ts";
import { axeClean, expectRing, ring, settled, tabKey } from "./reads.ts";
import type { TableWindow } from "./reads.ts";

const exportButton = (page: Page) =>
  page.getByRole("button", { name: "Export", exact: true });

interface State {
  name: string;
  query: string;
  width?: number;
  // Waits for what the state shows, so the state is drawn before anything is read
  drawn(page: Page, browserName: string): Promise<void>;
}

// Tab from "Export" to the region, polled since the observer that makes it a stop runs after the first frame
const focusRegion = (page: Page, browserName: string) =>
  expect
    .poll(
      async () => {
        await exportButton(page).focus();
        await page.keyboard.press(tabKey(browserName));
        return page.evaluate(() =>
          document.activeElement?.getAttribute("role"),
        );
      },
      { message: "could not check: the region holds no focus" },
    )
    .toBe("region");

const states: State[] = [
  {
    name: "loading",
    query: "?status=loading",
    drawn: (page) => expect(page.getByRole("status")).toContainText("Loading"),
  },
  {
    name: "failed",
    query: "?status=failed",
    drawn: (page) => expect(page.getByRole("alert")).toContainText("could not"),
  },
  {
    name: "ready, no rows",
    query: "?rows=0",
    drawn: (page) => expect(page.getByText("No data.")).toBeVisible(),
  },
  {
    name: "ready, 25 rows with a link",
    query: "?link",
    drawn: (page) =>
      expect(page.getByRole("link", { name: "Open Item 25" })).toBeVisible(),
  },
  {
    name: "ready, 25 rows, busy",
    query: "?busy",
    drawn: (page) => expect(page.locator('[aria-busy="true"]')).toHaveCount(1),
  },
  {
    name: "30 columns, region focused",
    query: "?cols=30",
    width: 600,
    drawn: focusRegion,
  },
  {
    name: "the invalid-input alert, with a heading and actions",
    query: "?status=bogus&heading",
    drawn: async (page) => {
      await expect(page.getByRole("alert")).toContainText("cannot be shown");
      await expect(
        page.getByRole("link", { name: "All orders" }),
      ).toBeVisible();
      await expect(exportButton(page)).toBeVisible();
    },
  },
];

// Opens the page in the state and checks that it is drawn and that the window and the region, if the state draws one,
// are at scroll 0. The window is tall enough for 25 rows: a shorter one makes the browser scroll the window by 24 px to
// the region it focuses (measured in Chromium and WebKit)
async function show(
  page: Page,
  browserName: string,
  path: string,
  state: State,
): Promise<void> {
  await page.setViewportSize({ width: state.width ?? 1280, height: 1200 });
  await open(page, `${path}${state.query}`);
  await state.drawn(page, browserName);
  const at = await page.evaluate(() => [
    scrollX,
    scrollY,
    document.querySelector('[role="region"]')?.scrollLeft ?? 0,
  ]);
  expect(at, "could not check: not at scroll 0").toEqual([0, 0, 0]);
}

// @spec("A11Y-06", "347adde3")
test.describe("A11Y-06, axe finds no serious or critical violation in any state", () => {
  for (const state of states)
    test(state.name, async ({ page, browserName }, testInfo) => {
      await show(page, browserName, "/table.html", state);
      await axeClean(page, testInfo);
    });
});

// No token of the package stylesheet has a value on any element of .sdt: the names are read from the loaded sheet;
// could not check when it gave none
async function expectNoToken(page: Page): Promise<void> {
  const tokens = await page.evaluate(() => {
    const sheet = [...document.styleSheets].find((s) =>
      s.href?.endsWith("/sdt/styles.css"),
    );
    const text = [...(sheet?.cssRules ?? [])].map((r) => r.cssText).join("\n");
    const names = [...new Set(text.match(/--sdt-[\w-]+/g))];
    const set = names.flatMap((name) =>
      [...document.querySelectorAll(".sdt, .sdt *")]
        .filter((el) => getComputedStyle(el).getPropertyValue(name) !== "")
        .map((el) => `${name} on ${el.tagName}`),
    );
    return { names: names.length, set };
  });
  expect(tokens.names, "could not check: no token name read").toBeGreaterThan(
    0,
  );
  expect(tokens.set, "a token has a value").toEqual([]);
}

// @spec("THEME-03", "79091611")
test.describe("THEME-03, the same with no --sdt-* property defined", () => {
  for (const state of states)
    test(state.name, async ({ page, browserName }, testInfo) => {
      await show(page, browserName, "/table-plain.html", state);
      await expectNoToken(page);
      await axeClean(page, testInfo, "color-contrast");
    });
});

// @spec("THEME-06", "b49ae54b")
test("THEME-06: with no --sdt-* property defined the focused region shows a visible focus indicator", async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 600, height: 720 });
  await open(page, "/table-plain.html?cols=30");
  const region = page.getByRole("region", { name: "Orders table" });
  await expect(region).toBeVisible();
  await expectNoToken(page);
  const unfocused = await ring(region);
  await focusRegion(page, browserName);
  await expectRing(region, unfocused);
});

// @spec("FOOT-03", "9fae3ded")
test("FOOT-03: mounting, new rows, state changes and unmounting leave the window where it was", async ({
  page,
}) => {
  await open(page, "/table.html?long&rows=20&link");
  const where = () => page.evaluate(() => [scrollX, scrollY]);
  await page.evaluate(() => scrollTo(0, 1200));
  expect(await where(), "could not check: not at 1200").toEqual([0, 1200]);
  const tbl = page.getByRole("table");
  const busy = page.locator('[aria-busy="true"]');
  const first = page.getByRole("link", { name: "Open Beta" });
  // Each step with what shows it happened; every set gives the rows a new generation (g2 after the first step)
  const steps: [string, object, (gen: number) => Promise<void>][] = [
    ["mount", { mounted: true }, () => expect(tbl).toBeVisible()],
    [
      "new rows",
      { rows: 20 },
      (g) => expect(first).toHaveAttribute("href", `#g${g}-r01`),
    ],
    [
      "loading",
      { status: "loading" },
      () => expect(page.getByRole("status")).toContainText("Loading"),
    ],
    ["ready", { status: "ready" }, () => expect(busy).toHaveCount(0)],
    ["busy", { busy: true }, () => expect(busy).toHaveCount(1)],
    ["not busy", { busy: false }, () => expect(busy).toHaveCount(0)],
    ["unmount", { mounted: false }, () => expect(tbl).toHaveCount(0)],
  ];
  for (const [index, [step, props, took]] of steps.entries()) {
    await page.evaluate(
      (next) => (window as unknown as TableWindow).__table.set(next),
      props,
    );
    await took(index + 2).catch((cause: unknown) => {
      throw new Error(`could not check: ${step} did not happen`, { cause });
    });
    await settled(page);
    expect(await where(), `after ${step}`).toEqual([0, 1200]);
  }
});
