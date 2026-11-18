import { render, screen, within } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { describe, expect, it } from "vitest";
import { spec } from "../../test/spec.ts";
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

describe(spec("A11Y-01", "c91fd776"), () => {
  it("is a native table named by the caption it holds as its first child", () => {
    show();
    const table = screen.getByRole("table", { name: "Orders" });
    const caption = within(table).getByText("Orders");
    expect(caption.tagName).toBe("CAPTION");
    expect(table.firstElementChild).toBe(caption);
  });
});

describe(spec("A11Y-09", "1ea0bceb"), () => {
  it("sits inside a region named by regionLabel", () => {
    show();
    const region = screen.getByRole("region", { name: "Orders table" });
    expect(
      within(region).getByRole("table", { name: "Orders" }).isConnected,
    ).toBe(true);
  });
});

describe(spec("A11Y-02", "bb579ca8"), () => {
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

describe(spec("RND-08", "e3e4bdfc"), () => {
  it("shows value(row) as the text of a cell of a column without a cell snippet", () => {
    show();
    expect(screen.getByRole("cell", { name: "Beta" }).textContent).toBe("Beta");
  });
});

describe(spec("RND-02", "9a4c8ebf"), () => {
  it("renders the cell snippet, called with the row and the column id, in each of its cells", () => {
    const beta = { id: "r1", name: "Beta" };
    const gamma = { id: "r2", name: "Gamma" };
    const calls: [Item, string][] = [];
    const cell = createRawSnippet<[Item, string]>((row, columnId) => {
      calls.push([row(), columnId()]);
      return { render: () => `<a href="#${row().id}">Open ${row().name}</a>` };
    });
    show({
      rows: [beta, gamma],
      columns: [{ id: "name", label: "Name", cell }],
    });
    for (const name of ["Open Beta", "Open Gamma"]) {
      const shown = screen.getByRole("cell", { name });
      expect(within(shown).getByRole("link", { name }).isConnected).toBe(true);
    }
    expect(calls).toEqual([
      [beta, "name"],
      [gamma, "name"],
    ]);
  });
});

const twentyFive: Item[] = Array.from({ length: 25 }, (_, index) => {
  const id = `r${String(index + 1).padStart(2, "0")}`;
  return { id, name: `Name ${id}` };
});

describe(spec("RND-01", "4b6167be"), () => {
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
