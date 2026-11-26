// The statements of the filter dialog and its fields (spec/table.md section 11), against site/filter-dialog.html. The
// dialog is a popover, and an empty popover has no box, so a test counts the dialog by its role and name and never asks
// whether it is visible.
import { expect, test } from "@playwright/test";

// @spec("FILT-02", "70479fab")
test.describe("FILT-02, a press on a filter button opens one named dialog", () => {
  for (const [label, name] of [
    ["Name", "Name filter"],
    ["Status", "Status filter"],
  ] as const)
    test(`Filter ${label}`, async ({ page }) => {
      await page.goto("/filter-dialog.html");
      const dialog = page.getByRole("dialog", { name, exact: true });
      // Precondition: no dialog is open before the press, so a count of 1 after it is the press's doing
      await expect(
        dialog,
        "could not check: a dialog is open before the press",
      ).toHaveCount(0);
      await page.getByRole("button", { name: `Filter ${label}` }).click();
      await expect(dialog).toHaveCount(1);
      await expect(page.getByRole("dialog")).toHaveCount(1);
    });
});
