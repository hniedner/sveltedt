import { render, screen, within } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import CellSnippetTable from "../../test/CellSnippetTable.svelte";
import DataTable from "./DataTable.svelte";
import type { DataTableColumn, DataTableProps } from "./types.ts";

interface Item {
  id: string;
  name: string;
}

const idColumn: DataTableColumn<Item> = {
  id: "id",
  label: "Id",
  value: (row) => row.id,
};
const nameColumn: DataTableColumn<Item> = {
  id: "name",
  label: "Name",
  value: (row) => row.name,
};

const noteColumn: DataTableColumn<Item> = {
  id: "note",
  label: "Note",
  value: () => "",
};

// The text of the first cell of each body row, top to bottom
function firstCells(): string[] {
  return screen
    .getAllByRole("row")
    .filter((row) => within(row).queryAllByRole("cell").length > 0)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");
}

// The text of every cell of each body row, top to bottom
function cellTexts(): string[][] {
  return screen
    .getAllByRole("row")
    .map((row) =>
      within(row)
        .queryAllByRole("cell")
        .map((cell) => cell.textContent.trim()),
    )
    .filter((cells) => cells.length > 0);
}

// Mounts the table with the given props over a one-row base; returns the element that holds the component
function show(props: Partial<DataTableProps<Item>> = {}): HTMLElement {
  const base: DataTableProps<Item> = {
    rows: [{ id: "r1", name: "Beta" }],
    columns: [nameColumn],
    getRowId: (row) => row.id,
    caption: "Orders",
    regionLabel: "Orders table",
  };
  return render(DataTable<Item>, { ...base, ...props }).container;
}

// @spec("A11Y-01", "c91fd776")
describe("A11Y-01", () => {
  it("is a native table named by the caption it holds as its first child", () => {
    show();
    const table = screen.getByRole("table", { name: "Orders" });
    const caption = within(table).getByText("Orders");
    expect(caption.tagName).toBe("CAPTION");
    expect(table.firstElementChild).toBe(caption);
  });
});

// @spec("A11Y-09", "1ea0bceb")
describe("A11Y-09", () => {
  it("sits inside a region named by regionLabel", () => {
    show();
    const region = screen.getByRole("region", { name: "Orders table" });
    expect(
      within(region).getByRole("table", { name: "Orders" }).isConnected,
    ).toBe(true);
  });
});

// @spec("A11Y-02", "bb579ca8")
describe("A11Y-02", () => {
  it("makes every column header a th with scope col", () => {
    show({ columns: [idColumn, nameColumn, noteColumn] });
    expect(
      screen
        .getAllByRole("columnheader")
        .map((th) => [th.tagName, th.getAttribute("scope")]),
    ).toEqual([
      ["TH", "col"],
      ["TH", "col"],
      ["TH", "col"],
    ]);
  });
});

// @spec("RND-08", "e3e4bdfc")
describe("RND-08", () => {
  it("shows value(row) as the text of a cell of a column without a cell snippet", () => {
    show({ columns: [idColumn, nameColumn] });
    expect(screen.getByRole("cell", { name: "Beta" }).textContent).toBe("Beta");
    // Each column's own value: the id cell holds r1, not the first column's value repeated
    expect(cellTexts()).toEqual([["r1", "Beta"]]);
  });
});

// @spec("RND-02", "9a4c8ebf")
describe("RND-02", () => {
  it("renders the cell snippet, called with the row and the column id, in each of its cells", () => {
    render(CellSnippetTable, {
      rows: [
        { id: "r1", name: "Beta" },
        { id: "r2", name: "Gamma" },
      ],
    });
    for (const name of ["Open Beta in name", "Open Gamma in name"]) {
      const shown = screen.getByRole("cell", { name });
      expect(within(shown).getByRole("link", { name }).isConnected).toBe(true);
    }
  });
});

const twentyFive: Item[] = Array.from({ length: 25 }, (_, index) => {
  const id = `r${String(index + 1).padStart(2, "0")}`;
  return { id, name: `Name ${id}` };
});

// @spec("RND-01", "4b6167be")
describe("RND-01", () => {
  it.each([
    [
      "r3, r1, r2",
      [
        { id: "r3", name: "Gamma" },
        { id: "r1", name: "Alpha" },
        { id: "r2", name: "Beta" },
      ],
    ],
    [
      "two equal names and an empty one",
      [
        { id: "r1", name: "Beta" },
        { id: "r2", name: "Beta" },
        { id: "r3", name: "" },
      ],
    ],
    ["25 rows", twentyFive],
  ])("shows the rows %s in exactly the order given", (_rows, rows) => {
    show({ rows, columns: [idColumn, nameColumn] });
    expect(firstCells()).toEqual(rows.map((row) => row.id));
  });
});

describe("STATE-03 first example; the statement's marker arrives with 1c", () => {
  it("with the default status ready and no rows, shows the empty message in one cell spanning every column", () => {
    show({ rows: [], columns: [idColumn, nameColumn, noteColumn] });
    expect(screen.getAllByRole("cell")).toHaveLength(1);
    expect(
      screen.getByRole("cell", { name: "No records." }).getAttribute("colspan"),
    ).toBe("3");
  });
});

describe("RND-03 first examples; the statement's marker arrives with 1c", () => {
  const places: [
    string,
    (text: string) => Partial<DataTableProps<Item>>,
    (text: string) => HTMLElement,
  ][] = [
    [
      "caption",
      (text) => ({ caption: text }),
      (text) => screen.getByRole("table", { name: text }),
    ],
    [
      "a column label",
      (text) => ({ columns: [{ ...nameColumn, label: text }] }),
      (text) => screen.getByRole("columnheader", { name: text }),
    ],
    [
      "a default cell",
      (text) => ({ rows: [{ id: "r1", name: text }] }),
      (text) => screen.getByRole("cell", { name: text }),
    ],
  ];
  const texts = ["<img src=x onerror=alert(1)>", "<none>"];

  it.each(
    places.flatMap(([place, props, find]) =>
      texts.map((text) => [place, text, props, find] as const),
    ),
  )("renders %s %s as text, never as markup", (_place, text, props, find) => {
    const component = show(props(text));
    expect(find(text).isConnected).toBe(true);
    expect(component.querySelector("img, none")).toBeNull();
  });
});
