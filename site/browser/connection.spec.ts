// The connection page against the site's own server (spec/site.md, section 8), in each engine of playwright.config.ts:
// the page loads its rows through the helper of `@hniedner/sveltedt/connection`.
import { expect, test, type Page } from "@playwright/test";
import { listOf, open } from "./csp.ts";

const FIRST_PAGE = [
  "Order 07",
  "Order 03",
  "Order 15",
  "Order 01",
  "Order 20",
  "Order 11",
  "Order 05",
  "Order 18",
  "Order 09",
  "Order 13",
];
const SECOND_PAGE = [
  "Order 02",
  "Order 17",
  "Order 06",
  "Order 14",
  "Order 10",
  "Order 19",
  "Order 04",
  "Order 12",
  "Order 16",
  "Order 08",
];
// The page's route requests, collected from now on: call it before the page is opened, so no request is missed
function routeRequests(page: Page): URL[] {
  const requests: URL[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/orders") requests.push(url);
  });
  return requests;
}
const rowsOf = (page: Page) =>
  page.getByRole("table", { name: "Orders" }).locator("tbody").getByRole("row");

// @spec("CPAGE-01", "0bc0843b")
test("CPAGE-01: the connection page shows the first page, loaded with one route request", async ({
  page,
}) => {
  const requests = routeRequests(page);
  await open(page, "/connection.html");
  await expect(rowsOf(page)).toHaveText(FIRST_PAGE);
  expect(requests).toHaveLength(1);
  const query = requests[0]?.searchParams;
  expect([
    query?.get("draw"),
    query?.get("start"),
    query?.get("length"),
  ]).toEqual(["1", "0", "10"]);
});

// @spec("CPAGE-02", "8b758a09")
test("CPAGE-02: pressing a page of the pager loads that page with one more route request", async ({
  page,
}) => {
  const requests = routeRequests(page);
  await open(page, "/connection.html");
  const next = page.getByRole("button", { name: "Page 2" });
  await expect(next).toBeVisible();
  const pager = page.getByRole("navigation", { name: "Orders pages" });
  await expect(pager).toContainText("Showing 1 to 10 of 20 rows");
  await expect(rowsOf(page)).toHaveText(FIRST_PAGE);
  expect(requests).toHaveLength(1);
  await next.click();
  await expect(rowsOf(page)).toHaveText(SECOND_PAGE);
  await expect(pager).toContainText("Showing 11 to 20 of 20 rows");
  expect(requests).toHaveLength(2);
  const query = requests[1]?.searchParams;
  expect([
    query?.get("draw"),
    query?.get("start"),
    query?.get("length"),
  ]).toEqual(["2", "10", "10"]);
});

// @spec("CPAGE-03", "b7453b1f")
test("CPAGE-03: the connection page raises no violation once its first page of rows is shown", async ({
  page,
}) => {
  await open(page, "/connection.html");
  await expect(rowsOf(page)).toHaveCount(10);
  const list = await listOf(page);
  expect(list, `violations: ${JSON.stringify(list)}`).toEqual([]);
});

// @spec("CPAGE-04", "67c26a72")
test("CPAGE-04: pressing the Order header loads the first page in that order with one more route request", async ({
  page,
}) => {
  const requests = routeRequests(page);
  await open(page, "/connection.html");
  await expect(rowsOf(page)).toHaveText(FIRST_PAGE);
  await page.getByRole("button", { name: "Page 2" }).click();
  await expect(rowsOf(page)).toHaveText(SECOND_PAGE);
  expect(requests).toHaveLength(2);
  await page.getByRole("button", { name: "Order", exact: true }).click();
  const pager = page.getByRole("navigation", { name: "Orders pages" });
  await expect(pager).toContainText("Showing 1 to 10 of 20 rows");
  await expect(rowsOf(page)).toHaveText(
    Array.from(
      { length: 10 },
      (_, index) => `Order ${String(index + 1).padStart(2, "0")}`,
    ),
  );
  expect(requests).toHaveLength(3);
  const query = requests[2]?.searchParams;
  expect([
    query?.get("draw"),
    query?.get("start"),
    query?.get("length"),
    query?.get("order[0][column]"),
    query?.get("order[0][dir]"),
  ]).toEqual(["3", "0", "10", "1", "asc"]);
});

// @spec("CPAGE-05", "5809732e")
test("CPAGE-05: choosing a size loads the page of that size that holds the first row shown", async ({
  page,
}) => {
  const requests = routeRequests(page);
  await open(page, "/connection.html");
  await expect(rowsOf(page)).toHaveText(FIRST_PAGE);
  const size = page.getByRole("combobox", { name: "rows per page" });
  await size.selectOption("5");
  await expect(rowsOf(page)).toHaveCount(5);
  expect(requests).toHaveLength(2);
  expect([
    requests[1]?.searchParams.get("start"),
    requests[1]?.searchParams.get("length"),
  ]).toEqual(["0", "5"]);
  await page.getByRole("button", { name: "Page 4" }).click();
  await expect(rowsOf(page).first()).toHaveText("Order 19");
  expect(requests).toHaveLength(3);
  expect([
    requests[2]?.searchParams.get("start"),
    requests[2]?.searchParams.get("length"),
  ]).toEqual(["15", "5"]);
  await size.selectOption("10");
  await expect(rowsOf(page)).toHaveText(SECOND_PAGE);
  await expect(
    page.getByRole("navigation", { name: "Orders pages" }),
  ).toContainText("Showing 11 to 20 of 20 rows");
  expect(requests).toHaveLength(4);
  const query = requests[3]?.searchParams;
  expect([
    query?.get("draw"),
    query?.get("start"),
    query?.get("length"),
  ]).toEqual(["4", "10", "10"]);
});
