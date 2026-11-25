import { render, screen, within } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import SnippetsTable from "../../test/SnippetsTable.svelte";
import DataTable from "./DataTable.svelte";
import Pagination from "./Pagination.svelte";
import type { DataTableColumn, DataTableProps } from "./types.ts";

interface Item {
  id: string;
  name: string;
}

const column = (id: string): DataTableColumn<Item> => ({
  id,
  label: id,
  value: ({ row }) => row.name,
});
const rows = (count: number): Item[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `r${index}`,
    name: `Name ${index}`,
  }));
const base: DataTableProps<Item> = {
  rows: rows(3),
  columns: [column("a"), column("b")],
  getRowId: ({ row }) => row.id,
  caption: "Orders",
  regionLabel: "Orders table",
};

// The elements of the page that carry a class
const withClass = (name: string): Element[] => [
  ...document.querySelectorAll(`.${name}`),
];
const counts = (names: string[]): number[] =>
  names.map((name) => withClass(name).length);

const SEVEN = [
  "sdt",
  "sdt-table",
  "sdt-head-row",
  "sdt-th",
  "sdt-row",
  "sdt-cell",
  "sdt-pager",
];

// @spec("THEME-09", "f89d6c59")
describe("THEME-09", () => {
  const rowsOfTable = [
    ["status 'ready', 3 rows, 2 columns", {}, [1, 1, 1, 2, 3, 6, 0]],
    ["status 'ready', 0 rows, 2 columns", { rows: [] }, [1, 1, 1, 2, 0, 1, 0]],
    [
      "2 rows, a heading and an actions snippet",
      { rows: rows(2), withHeading: true, withActions: true },
      [1, 1, 1, 2, 2, 4, 0],
    ],
    [
      "columns [], a heading snippet",
      { columns: [], withHeading: true },
      [1, 0, 0, 0, 0, 0, 0],
    ],
  ] as const;

  it.each(rowsOfTable)("counts the classes for %s", (_, props, expected) => {
    render(SnippetsTable, { ...base, ...props });
    expect(counts(SEVEN)).toEqual(expected);
  });

  it("puts each class on the element the spec names", () => {
    render(SnippetsTable, { ...base, withHeading: true, withActions: true });
    const root = withClass("sdt")[0];
    expect(root?.contains(screen.getByRole("heading"))).toBe(true);
    expect(root?.contains(screen.getByRole("button", { name: "Export" }))).toBe(
      true,
    );
    expect(root?.contains(screen.getByRole("region"))).toBe(true);
    expect(withClass("sdt-table")[0]).toBe(screen.getByRole("table"));
    const headRow = screen.getAllByRole("row")[0];
    expect(withClass("sdt-head-row")[0]).toBe(headRow);
    expect(withClass("sdt-th")).toEqual(screen.getAllByRole("columnheader"));
    expect(withClass("sdt-cell")).toEqual(screen.getAllByRole("cell"));
    expect(withClass("sdt-row")).toEqual(
      screen.getAllByRole("row").filter((row) => row !== headRow),
    );
  });

  it("holds the alert of RND-13 inside the sdt element", () => {
    render(SnippetsTable, { ...base, columns: [] });
    expect(withClass("sdt")[0]?.contains(screen.getByRole("alert"))).toBe(true);
  });

  it("puts sdt-pager on the nav of a Pagination and nowhere else", () => {
    render(Pagination, {
      offset: 0,
      limit: 10,
      total: 25,
      label: "Pages of orders",
      onpage: () => undefined,
      onsize: () => undefined,
    });
    expect(withClass("sdt-pager")).toEqual([
      screen.getByRole("navigation", { name: "Pages of orders" }),
    ]);
    expect(counts(SEVEN.slice(0, 6))).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

// @spec("THEME-48", "bf7e32c1")
describe("THEME-48", () => {
  const FOUR = ["sdt-region", "sdt-caption", "sdt-sr-only", "sdt-empty"];

  it("puts the four classes on the region, the caption and the live count", () => {
    render(DataTable<Item>, { ...base, rows: rows(2) });
    expect(withClass("sdt-region")).toEqual([screen.getByRole("region")]);
    expect(withClass("sdt-caption")).toEqual([
      screen.getByRole("table").querySelector("caption"),
    ]);
    expect(withClass("sdt-sr-only")).toEqual([
      document.querySelector('[aria-live="polite"]:not([role])'),
    ]);
    expect(counts(FOUR)).toEqual([1, 1, 1, 0]);
  });

  it("puts sdt-empty on the cell of the empty message and on no other", () => {
    render(DataTable<Item>, { ...base, rows: [] });
    expect(withClass("sdt-empty")).toEqual([
      screen.getByRole("cell", { name: "No data." }),
    ]);
  });
});

// @spec("THEME-49", "c62d237e")
describe("THEME-49", () => {
  it("puts sdt-cell on the one cell that holds the stopped message", () => {
    render(SnippetsTable, { ...base, rows: rows(2), status: "stopped" });
    expect(counts(SEVEN)).toEqual([1, 1, 1, 2, 0, 1, 0]);
    expect(withClass("sdt-cell")).toEqual([
      within(screen.getByRole("table")).getByRole("cell", {
        name: "Loading stopped",
      }),
    ]);
  });
});
