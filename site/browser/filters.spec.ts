// The filter statements that need an engine's own accessible-name computation (spec/table.md section 11), against
// site/filters.html, which has a text filter on Link and on Region.
import { expect, test } from "@playwright/test";

// @spec("FILT-56", "99fe3fb0")
test.describe("FILT-56, a header cell is named by its label alone", () => {
  for (const [column, name, buttons] of [
    ["Link, with a text filter", "Link", ["Filter Link"]],
    [
      "Region, sortable, with a text filter",
      "Region",
      ["Region", "Filter Region"],
    ],
    ["Name, sortable", "Name", ["Name"]],
  ] as const)
    test(column, async ({ page }) => {
      await page.goto("/filters.html");
      const cell = page.getByRole("columnheader", { name, exact: true });
      await expect(cell).toHaveCount(1);
      // The buttons the row says are in that cell, so the name is the label's and not an empty cell's
      for (const button of buttons)
        await expect(
          cell.getByRole("button", { name: button, exact: true }),
        ).toHaveCount(1);
    });
});
