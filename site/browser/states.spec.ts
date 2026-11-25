// The statements that hold in every state of the table (spec/table.md: A11Y-06), against site/table.html. The states
// are the rows of A11Y-06's table; the real clock runs, so "loading" is read before or after the progress indicator and
// the still-loading text, which A11Y-25 owns.
import { expect, test, type Page } from "@playwright/test";
import { open } from "./csp.ts";
import { axeClean, tabKey } from "./reads.ts";

const exportButton = (page: Page) =>
  page.getByRole("button", { name: "Export", exact: true });

interface State {
  name: string;
  query: string;
  width?: number;
  // Waits for what the state shows, so the state is drawn before anything is read
  drawn(page: Page, browserName: string): Promise<void>;
}

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
    drawn: (page, browserName) =>
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
        .toBe("region"),
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

// Opens the page in the state and checks that it is drawn and that the window and the region are at scroll 0. The
// window is tall enough for 25 rows: a shorter one makes the browser scroll the window to the region it focuses
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

// The names of the package stylesheet's tokens, read from the loaded sheet, and the elements of .sdt that compute one
async function tokensDefined(
  page: Page,
): Promise<{ names: number; set: string[] }> {
  return page.evaluate(() => {
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
}

// @spec("THEME-03", "79091611")
test.describe("THEME-03, the same with no --sdt-* property defined", () => {
  for (const state of states)
    test(state.name, async ({ page, browserName }, testInfo) => {
      await show(page, browserName, "/table-plain.html", state);
      const tokens = await tokensDefined(page);
      expect(
        tokens.names,
        "could not check: no token name read",
      ).toBeGreaterThan(0);
      expect(tokens.set, "a token has a value").toEqual([]);
      const results = await axeClean(page, testInfo);
      const ran = [...results.passes, ...results.incomplete].map((r) => r.id);
      expect(ran, "could not check: color-contrast did not run").toContain(
        "color-contrast",
      );
    });
});
