// THEME-10 and THEME-11: the table looks the same whatever the application loaded first (spec/table.md section 6).
// Each host is its own page load: the package's stylesheet alone, or Bootstrap 5.3's compiled CSS first.
import { expect, test, type Page } from "@playwright/test";

type Values = Record<string, string>;

const SIDES = ["top", "right", "bottom", "left"];
// The four sides of one property family, each side given the same value
const sides = (name: string, value: string): Values =>
  Object.fromEntries(SIDES.map((side) => [name.replace("*", side), value]));
// The region's properties (THEME-10's first row), with the box of an element that has no padding and no border
const box = (display: string, position: string, boxSizing: string): Values => ({
  display,
  position,
  "box-sizing": boxSizing,
  ...sides("margin-*", "0px"),
  ...sides("padding-*", "0px"),
  ...sides("border-*-width", "0px"),
  ...sides("border-*-style", "none"),
});

const region = box("block", "relative", "border-box");
const table = {
  ...box("table", "static", "border-box"),
  "border-collapse": "collapse",
};
const caption: Values = {
  ...box("block", "absolute", "border-box"),
  ...sides("margin-*", "-1px"),
  "caption-side": "top",
  "text-align": "start",
  clip: "rect(0px, 0px, 0px, 0px)",
  "clip-path": "inset(50%)",
  overflow: "hidden",
  "white-space": "nowrap",
  width: "1px",
  height: "1px",
};
const row = box("table-row", "static", "border-box");
const cell = (divider: boolean): Values => ({
  ...box("table-cell", "static", "border-box"),
  "padding-top": "8px",
  "padding-right": "12px",
  "padding-bottom": "8px",
  "padding-left": "12px",
  "text-align": "start",
  ...(divider
    ? { "border-bottom-width": "1px", "border-bottom-style": "solid" }
    : {}),
});

// What a page measures: per element kind, the computed value of each named property, in document order; and whether the
// element's font-family, font-size and line-height equal its parent's
async function measure(page: Page, names: Record<string, string[]>) {
  return page.evaluate((wanted) => {
    const pick = (selector: string, within: Document | Element = document) => [
      ...within.querySelectorAll(selector),
    ];
    const kinds: Record<string, Element[]> = {
      region: pick('[role="region"]'),
      table: pick("table"),
      caption: pick("caption"),
      row: pick("tr"),
      cell: pick("th, td"),
    };
    const out: Record<string, { values: Values; font: boolean }[]> = {};
    for (const [kind, elements] of Object.entries(kinds))
      out[kind] = elements.map((element) => {
        const style = getComputedStyle(element);
        const parent = getComputedStyle(element.parentElement as Element);
        const values: Values = {};
        for (const name of wanted[kind] ?? [])
          values[name] = style.getPropertyValue(name);
        return {
          values,
          font: ["font-family", "font-size", "line-height"].every(
            (name) =>
              style.getPropertyValue(name) === parent.getPropertyValue(name),
          ),
        };
      });
    return out;
  }, names);
}

// The package's stylesheet is served as the file the package ships, unbundled, beside the application's file
const PACKAGE_SHEET = "/sdt/styles.css";
const APP_SHEET = "/host-app.css";
const HOSTS = [
  { name: "none", page: "none", before: [] as string[] },
  {
    name: "Bootstrap 5.3",
    page: "bootstrap",
    before: ["/vendor/bootstrap.min.css"],
  },
];

const sheetsOf = (page: Page) =>
  page.evaluate(() =>
    [...document.styleSheets].map(
      (sheet) => new URL(sheet.href ?? "").pathname,
    ),
  );

// The cells in document order: the header cells, then the cells of the data rows or the empty message's cell
const cellsOf = (rows: number): Values[] =>
  rows === 0
    ? [cell(false), cell(false), cell(false)]
    : [
        cell(false),
        cell(false),
        // Only the first data row's cells have the divider (the last row has none)
        cell(true),
        cell(true),
        cell(false),
        cell(false),
      ];

// @spec("THEME-10", "7738e132")
test.describe("THEME-10", () => {
  for (const host of HOSTS)
    for (const rows of [2, 0]) {
      test(`on the ${host.name} host with ${rows} rows: the stylesheets are in order and every named property has its value`, async ({
        page,
      }) => {
        await page.goto(`/host-${host.page}.html?rows=${rows}`);
        await expect(
          page.getByRole("table", { name: "Orders" }),
        ).toBeAttached();
        expect(await sheetsOf(page)).toEqual([...host.before, PACKAGE_SHEET]);
        const names = Object.fromEntries(
          Object.entries({ region, table, caption, row, cell: cell(true) }).map(
            ([kind, values]) => [kind, Object.keys(values)],
          ),
        );
        const found = await measure(page, names);
        expect(found.region?.map((r) => r.values)).toEqual([region]);
        expect(found.table?.map((r) => r.values)).toEqual([table]);
        expect(found.caption?.map((r) => r.values)).toEqual([caption]);
        expect(found.row?.map((r) => r.values)).toEqual(
          Array(rows === 0 ? 2 : 3).fill(row),
        );
        expect(found.cell?.map((r) => r.values)).toEqual(cellsOf(rows));
        for (const kind of Object.values(found))
          for (const element of kind) expect(element.font).toBe(true);
        const sizes = await page.evaluate(() =>
          [
            document.querySelector("caption"),
            document.querySelector('[aria-live="polite"]:not([role])'),
          ].map((element) => {
            const box = element?.getBoundingClientRect();
            return [box?.width, box?.height];
          }),
        );
        expect(sizes).toEqual([
          [1, 1],
          [1, 1],
        ]);
      });
    }
});

// @spec("THEME-11", "996aaba2")
test.describe("THEME-11", () => {
  for (const host of ["none", "bootstrap"]) {
    test(`on the ${host} host: an application rule of a class and an element overrides the cell padding`, async ({
      page,
    }) => {
      await page.goto(`/host-${host}-app.html?app`);
      await expect(page.getByRole("table", { name: "Orders" })).toBeAttached();
      expect(await sheetsOf(page)).toEqual([
        ...(host === "none" ? [] : ["/vendor/bootstrap.min.css"]),
        PACKAGE_SHEET,
        APP_SHEET,
      ]);
      const padding = (name: string) =>
        page
          .getByRole("region", { name })
          .getByRole("cell")
          .evaluateAll((cells) =>
            cells.map((cell) => {
              const style = getComputedStyle(cell);
              return ["top", "right", "bottom", "left"].map((side) =>
                style.getPropertyValue(`padding-${side}`),
              );
            }),
          );
      // Four body cells each: two rows of two columns
      expect(await padding("Orders table")).toEqual(
        Array(4).fill(["4px", "4px", "4px", "4px"]),
      );
      expect(await padding("Other table")).toEqual(
        Array(4).fill(["8px", "12px", "8px", "12px"]),
      );
    });
  }
});

// The list page takes the stylesheet through the package's export, as a consumer's application does, beside its own
// Tailwind: its cells have the stylesheet's padding
test("the list page's cells have the stylesheet's padding", async ({
  page,
}) => {
  await page.goto("/");
  const cell = page.getByRole("cell").first();
  await expect(cell).toBeAttached();
  expect(
    await cell.evaluate((element) => getComputedStyle(element).padding),
  ).toBe("8px 12px");
});
