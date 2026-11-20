// The sort statements that need an engine's own key handling (spec/table.md section 7), against site/sort.html.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

type Order = { id: string; desc: boolean }[];
type SortWindow = Window & {
  __sorts: Order[];
  __table: { set(props: object): void };
};

// "code asc, name desc" as the order the table takes
const parse = (text: string): Order =>
  text === ""
    ? []
    : text.split(", ").map((entry) => {
        const [id = "", direction] = entry.split(" ");
        return { id, desc: direction === "desc" };
      });
const set = (page: Page, props: object) =>
  page.evaluate(
    (next) => (window as unknown as SortWindow).__table.set(next),
    props,
  );
const sorts = (page: Page) =>
  page.evaluate(() => (window as unknown as SortWindow).__sorts);
const button = (page: Page, name: string) =>
  page.getByRole("button", { name: `Sort by ${name}`, exact: true });
const newRows = Array.from({ length: 25 }, (_, index) => {
  const n = String(index + 1).padStart(2, "0");
  return { id: `n${n}`, code: `N${n}`, name: `New ${n}`, region: "North" };
});

async function start(page: Page, order: string): Promise<void> {
  await page.goto("/sort.html");
  await set(page, { sort: parse(order) });
  await expect(button(page, "Name")).toBeVisible();
}

// Focuses the button and presses the key; the frame after lets a second emit of the same press arrive
async function press(page: Page, name: string, key: string): Promise<void> {
  await button(page, name).focus();
  await expect(button(page, name)).toBeFocused();
  await page.keyboard.press(key);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
}

// A11Y-16's visible: rendered and not hidden by display, visibility, opacity or hidden, at any scroll position. The
// text is what a reader gets; the elements are named by their place in the tree.
const visibleNow = (page: Page) =>
  page.evaluate(() => {
    const place = (el: Element): string => {
      const parent = el.parentElement;
      return parent === null
        ? el.tagName
        : `${place(parent)}>${el.tagName}${[...parent.children].indexOf(el)}`;
    };
    const shown = [...document.body.querySelectorAll("*")].filter((el) =>
      el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
    );
    return { text: document.body.innerText, elements: shown.map(place) };
  });

// @spec("SORT-02", "ba27def1")
test.describe("SORT-02, Shift+Enter and Shift+Space rows", () => {
  const rows = [
    ["code asc", "name asc", "code asc, name asc"],
    ["code asc, name asc", "name asc", "code asc, name desc"],
    ["code asc, name desc", "name asc", "code asc"],
    ["name asc, code asc", "name asc", "name desc, code asc"],
    ["name desc, code asc", "name asc", "code asc"],
    ["", "name asc", "name asc"],
  ] as const;
  for (const [before, , after] of rows)
    for (const key of ["Shift+Enter", "Shift+Space"])
      test(`${key} on Name with [${before}] emits once [${after}]`, async ({
        page,
      }) => {
        await start(page, before);
        await press(page, "Name", key);
        await expect.poll(() => sorts(page)).toEqual([parse(after)]);
      });
  // The Shift of a key press is spent by its click: a scripted click after it (assistive technology) has no Shift
  test("a scripted click after a Shift+Enter emits as a press without Shift", async ({
    page,
  }) => {
    await start(page, "code asc");
    await press(page, "Name", "Shift+Enter");
    await button(page, "Name").evaluate((b: HTMLElement) => b.click());
    await expect
      .poll(() => sorts(page))
      .toEqual([parse("code asc, name asc"), parse("name asc")]);
  });
});

// @spec("SORT-03", "8c10d2f7")
test.describe("SORT-03, Enter and Space rows", () => {
  for (const key of ["Enter", "Space"])
    test(`${key} on the focused Name button emits exactly one onsort`, async ({
      page,
    }) => {
      await start(page, "");
      await press(page, "Name", key);
      await expect.poll(() => sorts(page)).toEqual([parse("name asc")]);
    });
});

// @spec("SORT-11", "c4315f2b")
test.describe("SORT-11, focus stays after Enter", () => {
  const ordered = { sort: parse("name asc"), rows: newRows };
  const steps: Record<string, object[]> = {
    "busy, then the new order and rows": [
      { busy: true },
      { ...ordered, busy: false },
    ],
    "loading, then the new order and rows": [
      { status: "loading" },
      { ...ordered, status: "ready" },
    ],
    "loading, then failed": [{ status: "loading" }, { status: "failed" }],
    "the new order, then the rows": [{ sort: ordered.sort }, { rows: newRows }],
  };
  for (const [name, taken] of Object.entries(steps))
    test(name, async ({ page }) => {
      await start(page, "");
      await press(page, "Name", "Enter");
      await expect.poll(() => sorts(page)).toHaveLength(1);
      for (const step of taken) {
        await set(page, step);
        await expect(button(page, "Name")).toBeFocused();
        await expect(page.locator("table")).toHaveCount(1);
      }
    });
});

// @spec("SORT-18", "2f828448")
test("SORT-18: hovering or focusing a sort button makes nothing appear", async ({
  page,
}) => {
  await start(page, "code asc, name desc");
  const before = await visibleNow(page);
  expect(before.elements.length).toBeGreaterThan(0);
  for (const name of ["Code", "Name", "Region"]) {
    await button(page, name).hover();
    expect(await visibleNow(page)).toEqual(before);
    await button(page, name).focus();
    await expect(button(page, name)).toBeFocused();
    expect(await visibleNow(page)).toEqual(before);
  }
});

// @spec("SORT-20", "cdbb30a2")
test.describe("SORT-20, axe on the sort controls", () => {
  for (const order of ["", "code asc, name desc"])
    test(`three sortable columns, order [${order}]`, async ({
      page,
    }, testInfo) => {
      await start(page, order);
      const results = await new AxeBuilder({ page }).analyze();
      // Incomplete items are for the maintainer's manual review and never count as a pass
      await testInfo.attach("axe-incomplete", {
        body: JSON.stringify(results.incomplete, null, 2),
        contentType: "application/json",
      });
      expect(
        results.violations.filter(
          (v) => v.impact === "serious" || v.impact === "critical",
        ),
      ).toEqual([]);
    });
});
