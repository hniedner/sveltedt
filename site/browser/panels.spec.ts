// The panels page's statements (spec/site.md section 9), against site/panels.html: a button in the actions snippet
// that opens a panel in the panels snippet, reached and pressed by keyboard.
import { expect, test, type Page } from "@playwright/test";
import { tabKey } from "./reads.ts";

const toggle = (page: Page) =>
  page.getByRole("button", { name: "Advanced search" });
// The element the toggle's aria-controls names, read from the attribute so the test follows what the button says
async function panel(page: Page) {
  const id = await toggle(page).getAttribute("aria-controls");
  expect(id, "could not check: the toggle has no aria-controls").toBeTruthy();
  return page.locator(`[id="${id}"]`);
}
// The panel hidden: in the document, so aria-controls names an element, and not shown
async function expectHidden(page: Page): Promise<void> {
  await expect(await panel(page)).toBeAttached();
  await expect(await panel(page)).toBeHidden();
}
// Opens the page and moves focus to the toggle with one press of the key that moves to the next stop
async function tabToToggle(page: Page, browserName: string): Promise<void> {
  await page.goto("/panels.html");
  await expect(page.getByRole("region", { name: "Items table" })).toBeVisible();
  expect(
    await page.evaluate(() => document.activeElement === document.body),
    "could not check: focus is not on the body",
  ).toBe(true);
  await page.keyboard.press(tabKey(browserName));
  await expect(toggle(page)).toBeFocused();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await expectHidden(page);
}

// @spec("PANEL-01", "1ccfb03c")
test.describe("PANEL-01, Enter and Space on the toggle show and hide its panel", () => {
  for (const key of ["Enter", "Space"])
    test(`${key} shows the panel, then hides it`, async ({
      page,
      browserName,
    }) => {
      await tabToToggle(page, browserName);
      await page.keyboard.press(key);
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
      await expect(await panel(page)).toBeVisible();
      await expect(toggle(page)).toBeFocused();
      await page.keyboard.press(key);
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
      await expectHidden(page);
      await expect(toggle(page)).toBeFocused();
    });
});
