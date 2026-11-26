// The statements of the filter dialog and its fields (spec/table.md section 11), against site/filter-dialog.html. The
// dialog is a popover, and an empty popover has no box, so a test counts the dialog by its role and name and never asks
// whether it is visible.
import { expect, test, type Page } from "@playwright/test";

type DialogWindow = Window & {
  __calls: { onfilter: unknown[] };
  __table: { set(props: object): void };
};

const START = new Date("2026-01-01T00:00:00Z");

// The `onfilter` argument of a column's text field, as the page recorded it
const text = (id: string, value: string) => ({
  id,
  state: { kind: "text", text: value },
});

// Opens the dialog of "Filter Name" on the page, `address` setting `searchDelay` and the like, with the clock paused at
// the start: page time moves only by `at`, so "400 ms" is exact. `filters` is what the application has applied. Returns
// the field "Filter Name text", `at(ms)` that moves the clock to `ms` after the first key (keys take no time), and
// `calls()` that reads every `onfilter` argument so far
async function openName(
  page: Page,
  address = "/filter-dialog.html",
  filters = {},
) {
  await page.clock.install({ time: START });
  await page.clock.pauseAt(new Date(START.getTime() + 1000));
  await page.goto(address);
  await page.evaluate(
    (next) =>
      (window as unknown as DialogWindow).__table.set({ filters: next }),
    filters,
  );
  await page.getByRole("button", { name: "Filter Name", exact: true }).click();
  const field = page
    .getByRole("dialog", { name: "Name filter", exact: true })
    .getByLabel("Filter Name text");
  await expect(
    field,
    "could not check: Name's dialog holds no field",
  ).toHaveCount(1);
  let elapsed = 0;
  const at = async (ms: number) => {
    await page.clock.runFor(ms - elapsed);
    elapsed = ms;
  };
  const calls = () =>
    page.evaluate(() => (window as unknown as DialogWindow).__calls.onfilter);
  expect(await calls(), "could not check: a call before the first key").toEqual(
    [],
  );
  return { field, at, calls };
}

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

// @spec("FILT-01", "1ad86d58")
test.describe("FILT-01, a text filter emits once typing pauses", () => {
  test("type beta; at 399 ms none", async ({ page }) => {
    const { field, at, calls } = await openName(page);
    await field.pressSequentially("beta");
    await at(399);
    expect(await calls()).toEqual([]);
  });

  test("type beta; at 400 ms one call", async ({ page }) => {
    const { field, at, calls } = await openName(page);
    await field.pressSequentially("beta");
    await at(400);
    expect(await calls()).toEqual([text("name", "beta")]);
  });

  test("type be, at 300 ms ta; at 699 ms none, at 700 ms one", async ({
    page,
  }) => {
    const { field, at, calls } = await openName(page);
    await field.pressSequentially("be");
    await at(300);
    await field.pressSequentially("ta");
    await at(699);
    expect(await calls()).toEqual([]);
    await at(700);
    expect(await calls()).toEqual([text("name", "beta")]);
  });

  test("searchDelay 1000: none at 999 ms, one at 1000 ms", async ({ page }) => {
    const { field, at, calls } = await openName(
      page,
      "/filter-dialog.html?delay=1000",
    );
    await field.pressSequentially("beta");
    await at(999);
    expect(await calls()).toEqual([]);
    await at(1000);
    expect(await calls()).toEqual([text("name", "beta")]);
  });

  test("searchDelay 0: one call at each key", async ({ page }) => {
    const { field, calls } = await openName(
      page,
      "/filter-dialog.html?delay=0",
    );
    const seen: unknown[] = [];
    for (const [index, key] of [..."beta"].entries()) {
      await field.pressSequentially(key);
      seen.push(text("name", "beta".slice(0, index + 1)));
      expect(await calls()).toEqual(seen);
    }
  });

  test("the text already applied: type x, Backspace; at 400 ms none", async ({
    page,
  }) => {
    const { field, at, calls } = await openName(page, undefined, {
      name: { kind: "text", text: "beta" },
    });
    await expect(
      field,
      "could not check: the field lacks the applied text",
    ).toHaveValue("beta");
    await field.pressSequentially("x");
    await field.press("Backspace");
    await at(400);
    expect(await calls()).toEqual([]);
  });
});

// @spec("FILT-27", "5eb3ec59")
test.describe("FILT-27, Enter in a text filter's field emits at once", () => {
  test("type beta; at 100 ms Enter: one call, still one at 600 ms", async ({
    page,
  }) => {
    const { field, at, calls } = await openName(page);
    await field.pressSequentially("beta");
    await at(100);
    expect(await calls()).toEqual([]);
    await field.press("Enter");
    expect(await calls()).toEqual([text("name", "beta")]);
    await at(600);
    expect(await calls()).toEqual([text("name", "beta")]);
  });

  test("the text already applied: Enter emits none", async ({ page }) => {
    const { field, calls } = await openName(page, undefined, {
      name: { kind: "text", text: "beta" },
    });
    await expect(
      field,
      "could not check: the field lacks the applied text",
    ).toHaveValue("beta");
    await field.press("Enter");
    expect(await calls()).toEqual([]);
  });
});
