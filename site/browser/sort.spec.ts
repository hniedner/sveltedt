// The sort statements that need an engine's own key handling (spec/table.md section 7), against site/sort.html.
import { expect, test, type Page } from "@playwright/test";
import { axeClean, tabKey, visibleNow } from "./reads.ts";

type Order = { id: string; direction: "asc" | "desc" }[];
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
        return { id, direction: direction === "desc" ? "desc" : "asc" };
      });
const set = (page: Page, props: object) =>
  page.evaluate(
    (next) => (window as unknown as SortWindow).__table.set(next),
    props,
  );
const sorts = (page: Page) =>
  page.evaluate(() => (window as unknown as SortWindow).__sorts);
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const newRows = Array.from({ length: 25 }, (_, index) => {
  const n = String(index + 1).padStart(2, "0");
  return { id: `n${n}`, code: `N${n}`, name: `New ${n}`, region: "North" };
});

async function start(page: Page, order: string): Promise<void> {
  await page.goto("/sort.html");
  await set(page, { sort: parse(order) });
  await expect(button(page, "Name")).toBeVisible();
}

// A frame later, so a second emit of the same press would have arrived
const frame = (page: Page) =>
  page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));

async function focus(page: Page, name: string): Promise<void> {
  await button(page, name).focus();
  await expect(button(page, name)).toBeFocused();
}

async function press(page: Page, name: string, key: string): Promise<void> {
  await focus(page, name);
  await page.keyboard.press(key);
  await frame(page);
}

// Exactly the given emits: the first matching read, then a frame, then a plain read again
async function emitted(page: Page, orders: string[]): Promise<void> {
  const expected = orders.map(parse);
  await expect.poll(() => sorts(page)).toEqual(expected);
  await frame(page);
  expect(await sorts(page)).toEqual(expected);
}

// Tab on from where focus is (the region may come first) until the button has it
async function tabTo(
  page: Page,
  name: string,
  browserName: string,
): Promise<void> {
  const tab = tabKey(browserName);
  for (let i = 0; i < 4; i++) {
    if (await button(page, name).evaluate((b) => b === document.activeElement))
      break;
    await page.keyboard.press(tab);
  }
  await expect(button(page, name)).toBeFocused();
}

// @spec("SORT-02", "71005ae9")
test.describe("SORT-02, Shift+Enter and Shift+Space rows", () => {
  const rows = [
    ["code asc", "code asc, name asc"],
    ["code asc, name asc", "code asc, name desc"],
    ["code asc, name desc", "code asc"],
    ["name asc, code asc", "name desc, code asc"],
    ["name desc, code asc", "code asc"],
    ["", "name asc"],
  ] as const;
  for (const [before, after] of rows)
    for (const key of ["Shift+Enter", "Shift+Space"])
      test(`${key} on Name with [${before}] emits once [${after}]`, async ({
        page,
      }) => {
        await start(page, before);
        await press(page, "Name", key);
        await emitted(page, [after]);
      });
  // The Shift of a key press is spent by its click: a scripted click after it (assistive technology) has no Shift
  test("a scripted click after a Shift+Enter emits as a press without Shift", async ({
    page,
  }) => {
    await start(page, "code asc");
    await press(page, "Name", "Shift+Enter");
    await button(page, "Name").evaluate((b: HTMLElement) => b.click());
    await emitted(page, ["code asc, name asc", "name asc"]);
  });

  // The order [code asc] below tells a press with Shift ([code asc, name asc]) from one without ([name asc])
  test("Shift+Space, focus moved away by script, keys up, then a scripted click emits without Shift", async ({
    page,
  }) => {
    await start(page, "code asc");
    await focus(page, "Name");
    await page.keyboard.down("Shift");
    await page.keyboard.down("Space");
    await focus(page, "Code");
    await page.keyboard.up("Space");
    await page.keyboard.up("Shift");
    await button(page, "Name").evaluate((b: HTMLElement) => b.click());
    await emitted(page, ["name asc"]);
  });

  // From the order [code asc]: Name focused, Shift and Space down, then Shift up while Space is still down
  async function shiftUpWhileSpaceDown(page: Page): Promise<void> {
    await start(page, "code asc");
    await focus(page, "Name");
    await page.keyboard.down("Shift");
    await page.keyboard.down("Space");
    await page.keyboard.up("Shift");
  }

  // Firefox also clicks on Space's keyup after the mouse click; Chromium and WebKit do not (measured, five runs in
  // each engine). That second click has no Shift either.
  test("Shift released while Space is held, then a mouse click on Name, emits without Shift", async ({
    page,
    browserName,
  }) => {
    await shiftUpWhileSpaceDown(page);
    await button(page, "Name").click();
    await page.keyboard.up("Space");
    await emitted(
      page,
      browserName === "firefox" ? ["name asc", "name asc"] : ["name asc"],
    );
  });

  test("Shift held at the Space keydown decides, also when Shift is released before Space comes up", async ({
    page,
  }) => {
    await shiftUpWhileSpaceDown(page);
    await page.keyboard.up("Space");
    await emitted(page, ["code asc, name asc"]);
  });

  // The mirror: Chromium and WebKit give Space's click the Shift held at its keyup, Firefox does not
  test("Shift pressed after the Space keydown and held at its keyup emits without Shift", async ({
    page,
  }) => {
    await start(page, "code asc");
    await focus(page, "Name");
    await page.keyboard.down("Space");
    await page.keyboard.down("Shift");
    await page.keyboard.up("Space");
    await page.keyboard.up("Shift");
    await emitted(page, ["name asc"]);
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
      await emitted(page, ["name asc"]);
    });
});

// @spec("SORT-11", "3cda7850")
test.describe("SORT-11, focus stays after Enter", () => {
  const ordered = { sort: parse("name asc"), rows: newRows };
  // Each step with what must be on screen once the table has taken it, checked before focus
  const busy = (page: Page, value: string) =>
    expect(page.locator("table")).toHaveAttribute("aria-busy", value);
  const nameAscending = (page: Page) =>
    expect(page.locator('th[aria-sort="ascending"]')).toContainText("Name");
  const arrived = async (page: Page) => {
    await expect(page.getByRole("cell", { name: "New 01" })).toBeVisible();
    await nameAscending(page);
  };
  type Step = [object, (page: Page) => Promise<void>];
  const steps: Record<string, Step[]> = {
    "busy, then the new order and rows": [
      [{ busy: true }, (page) => busy(page, "true")],
      [
        { ...ordered, busy: false },
        async (page) => {
          await arrived(page);
          await busy(page, "false");
        },
      ],
    ],
    "loading, then the new order and rows": [
      [{ status: "loading" }, (page) => busy(page, "true")],
      [{ ...ordered, status: "ready" }, arrived],
    ],
    "loading, then failed": [
      [{ status: "loading" }, (page) => busy(page, "true")],
      [
        { status: "failed" },
        (page) => expect(page.getByRole("alert")).toBeVisible(),
      ],
    ],
    "the new order, then the rows": [
      [{ sort: ordered.sort }, nameAscending],
      [{ rows: newRows }, arrived],
    ],
  };
  for (const [name, taken] of Object.entries(steps))
    test(name, async ({ page }) => {
      await start(page, "");
      await press(page, "Name", "Enter");
      await expect.poll(() => sorts(page)).toHaveLength(1);
      for (const [step, took] of taken) {
        await set(page, step);
        await took(page);
        await expect(button(page, "Name")).toBeFocused();
        await expect(page.locator("table")).toHaveCount(1);
      }
    });
});

// @spec("SORT-18", "2f828448")
test("SORT-18: hovering or focusing a sort button makes nothing appear", async ({
  page,
  browserName,
}) => {
  await start(page, "code asc, name desc");
  const before = await visibleNow(page);
  expect(before.elements.length).toBeGreaterThan(0);
  for (const name of ["Code", "Name", "Region"]) {
    await button(page, name).hover();
    expect(await visibleNow(page)).toEqual(before);
    await tabTo(page, name, browserName);
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
      const results = await axeClean(page, testInfo);
      // Analysed, not skipped: button-name passed on the three sort buttons
      const named = results.passes.find((rule) => rule.id === "button-name");
      const html = named?.nodes.map((node) => node.html).join("");
      expect(html).toMatch(
        /Code\s*<\/button>.*Name\s*<\/button>.*Region\s*<\/button>/s,
      );
      // The name is the content: an aria-label on a sort button would show in the analysed HTML (SORT-09)
      expect(html).not.toContain("aria-label");
    });
});
