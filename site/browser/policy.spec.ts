// The strict policy's statements in a real browser, against the site's build folder (site/dist) as its server sends
// it, in each engine of playwright.config.ts.
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const DIST = join(import.meta.dirname, "..", "dist");
const POLICY = "default-src 'self'; script-src 'self'; style-src 'self'";

// Every .html file of the build folder, as its path in the folder
const pages = readdirSync(DIST, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
  .map((entry) =>
    relative(DIST, join(entry.parentPath, entry.name)).split(sep).join("/"),
  )
  .sort();
// Without the list page the build is not the site: could not check (an error outside the tests)
if (!pages.includes("index.html"))
  throw new Error(`could not check: no index.html in ${DIST}`);

// The listener's list (spec conventions), or undefined when the page has none
const listOf = (page: Page) =>
  page.evaluate(() => (window as Window & { __csp?: unknown[] }).__csp);

// Opens a page and checks, in order, that its answer carries the strict policy and that the listener's list exists
async function open(page: Page, path: string): Promise<void> {
  const answer = await page.goto(path);
  expect(answer?.headers()["content-security-policy"]).toBe(POLICY);
  expect(await listOf(page)).toEqual(expect.any(Array));
}

test("POL-02: the canary page's list holds a violation once the page has loaded", async ({
  page,
}) => {
  await open(page, "/canary.html");
  // goto resolves once the page has loaded; the report may come in a later task, so the read is retried. The entry
  // must be the canary's own (a style-src directive), not any other violation the page might raise
  await expect
    .poll(async () =>
      ((await listOf(page)) as { directive?: string }[] | undefined)?.some(
        (v) => v.directive?.startsWith("style-src"),
      ),
    )
    .toBe(true);
});

test.describe("POL-04", () => {
  for (const file of pages.filter((p) => p !== "canary.html")) {
    test(`${file} raises no violation once loaded and its table shown`, async ({
      page,
    }) => {
      await open(page, file === "index.html" ? "/" : `/${file}`);
      if (file === "index.html")
        await expect(
          page.getByRole("table").locator("tbody").getByRole("row"),
        ).toHaveCount(20);
      else
        await expect(
          page.getByRole("region").or(page.getByRole("alert")).first(),
        ).toBeVisible();
      const list = await listOf(page);
      expect(list, `violations: ${JSON.stringify(list)}`).toEqual([]);
    });
  }
});
