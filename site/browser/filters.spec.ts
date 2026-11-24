// The filter statements that need an engine's own accessible-name computation (spec/table.md section 11), against
// site/filters.html, which has a text filter on Link and on Region.
import { expect, test } from "@playwright/test";

// @spec("FILT-56", "99fe3fb0")
test.describe("FILT-56, a header cell is named by its label alone", () => {
  for (const [column, name] of [
    ["Link, with a text filter", "Link"],
    ["Region, sortable, with a text filter", "Region"],
    ["Name, sortable", "Name"],
  ] as const)
    test(column, async ({ page }) => {
      await page.goto("/filters.html");
      await expect(
        page.getByRole("columnheader", { name, exact: true }),
      ).toHaveCount(1);
    });
});
