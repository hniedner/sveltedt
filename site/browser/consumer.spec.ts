// The consumer project's statements in a real browser (spec/package.md CON-06 and CON-08), in each engine of
// playwright.config.ts: its production server on 4174 and its development server on 4175, both from one copy that
// the packed package is installed into (scripts/consumer-serve.ts).
import { expect, test, type Page } from "@playwright/test";

const PROD = "http://127.0.0.1:4174";
const DEV = "http://127.0.0.1:4175";
// SvelteKit's route announcer is rendered by the client only: its element is the sign that the page is hydrated
const hydrated = (page: Page) =>
  page.waitForSelector("#svelte-announcer", {
    state: "attached",
    timeout: 20_000,
  });

// @spec("CON-06", "8f20c907")
test("CON-06: the production list page hydrates in place: its table is the one the parser built", async ({
  page,
}) => {
  // The first table the parser inserts, held before any script of the page runs
  await page.addInitScript(() => {
    const seen = window as unknown as { __first?: Element };
    const watch = new MutationObserver(() => {
      seen.__first ??= document.querySelector("table") ?? undefined;
      if (seen.__first) watch.disconnect();
    });
    watch.observe(document, { childList: true, subtree: true });
  });
  await page.goto(`${PROD}/`);
  await hydrated(page);
  const same = await page.evaluate(() => {
    const first = (window as unknown as { __first?: Element }).__first;
    return first !== undefined && first === document.querySelector("table");
  });
  expect(same).toBe(true);
});

// The hydration warnings the page's scripts wrote to the console, from the start until the page is hydrated
async function warnings(page: Page, path: string): Promise<string[]> {
  const written: string[] = [];
  page.on("console", (message) => written.push(message.text()));
  await page.goto(`${DEV}${path}`);
  await hydrated(page);
  return written.filter((text) => text.includes("[svelte] hydration_"));
}

// @spec("CON-08", "025361dc")
test.describe("CON-08", () => {
  test("the real list page raises no hydration warning", async ({ page }) => {
    expect(await warnings(page, "/")).toEqual([]);
  });
  test("a planted img whose src differs between server and browser raises hydration_attribute_changed", async ({
    page,
  }) => {
    const found = await warnings(page, "/mismatch");
    expect(
      found.some((text) => text.includes("hydration_attribute_changed")),
    ).toBe(true);
  });
});
