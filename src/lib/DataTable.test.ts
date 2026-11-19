import { render, screen, within } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import CellSnippetTable from "../../test/CellSnippetTable.svelte";
import SnippetsTable from "../../test/SnippetsTable.svelte";
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

// The props every mount starts from: one row, one column
const base: DataTableProps<Item> = {
  rows: [{ id: "r1", name: "Beta" }],
  columns: [nameColumn],
  getRowId: (row) => row.id,
  caption: "Orders",
  regionLabel: "Orders table",
};

// Mounts the table with the given props over the base; returns the element that holds the component
function show(props: Partial<DataTableProps<Item>> = {}): HTMLElement {
  return render(DataTable<Item>, { ...base, ...props }).container;
}

// As show, through the fixture that declares the heading and actions snippets in markup; the flags pick which
function showWithSnippets(
  props: Partial<Omit<DataTableProps<Item>, "heading" | "actions">> & {
    withHeading?: boolean;
    withActions?: boolean;
  },
): HTMLElement {
  return render(SnippetsTable, { ...base, ...props }).container;
}

const LOADING = "Loading data…";
const EMPTY = "No data.";

const FAILED = "The data could not be loaded.";

const threeRows: Item[] = [
  { id: "r1", name: "Beta" },
  { id: "r2", name: "Gamma" },
  { id: "r3", name: "Delta" },
];

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
    // Only the snippet's own column renders it; the id column keeps its value
    expect(cellTexts()).toEqual([
      ["r1", "Open Beta in name"],
      ["r2", "Open Gamma in name"],
    ]);
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

// The body row that has a cell named by the given id
function bodyRow(id: string): HTMLElement {
  const row = screen.getByRole("cell", { name: id }).closest("tr");
  if (!row) throw new Error(`no row for ${id}`);
  return row;
}

// @spec("RND-15", "93c4507b")
describe("RND-15", () => {
  it("renders each row by the same element after new row objects arrive with the same ids in another order", async () => {
    const make = (ids: string[]): Item[] =>
      ids.map((id) => ({ id, name: `Name ${id}` }));
    const { rerender } = render(DataTable<Item>, {
      ...base,
      rows: make(["r1", "r2", "r3"]),
      columns: [idColumn],
    });
    const before = new Map(["r1", "r2", "r3"].map((id) => [id, bodyRow(id)]));
    await rerender({ rows: make(["r3", "r1", "r2"]) });
    expect(firstCells()).toEqual(["r3", "r1", "r2"]);
    for (const [id, element] of before) expect(bodyRow(id)).toBe(element);
  });
});

// @spec("RND-16", "03866104")
describe("RND-16", () => {
  const cityColumn: DataTableColumn<Item> = {
    id: "city",
    label: "City",
    value: (row) => `City ${row.id}`,
  };
  // The header cell, then the cell in each body row (every row after the header row), of the column with the given label
  function columnElements(label: string): HTMLElement[] {
    const header = screen.getByRole("columnheader", { name: label });
    const columnIndex = [...(header.parentElement?.children ?? [])].indexOf(
      header,
    );
    const cells = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => {
        const cell = within(row).getAllByRole("cell")[columnIndex];
        if (!cell) throw new Error(`no ${label} cell in a body row`);
        return cell;
      });
    return [header, ...cells];
  }

  it("renders each column's header cell and cells by the same elements after new column objects arrive in another order", async () => {
    const { rerender } = render(DataTable<Item>, {
      ...base,
      rows: [
        { id: "r1", name: "Alpha" },
        { id: "r2", name: "Beta" },
      ],
      columns: [{ ...nameColumn }, { ...cityColumn }],
    });
    const before = ["Name", "City"].map((label) => columnElements(label));
    await rerender({ columns: [{ ...cityColumn }, { ...nameColumn }] });
    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual(["City", "Name"]);
    expect(cellTexts()).toEqual([
      ["City r1", "Alpha"],
      ["City r2", "Beta"],
    ]);
    ["Name", "City"].forEach((label, column) => {
      columnElements(label).forEach((element, position) => {
        expect(element).toBe(before[column]?.[position]);
      });
    });
  });
});

// @spec("STATE-03", "bbe099c5")
describe("STATE-03", () => {
  it.each([false, true])(
    "with status ready, busy %s and no rows, shows the empty message in one cell spanning every column",
    (busy) => {
      show({
        rows: [],
        columns: [idColumn, nameColumn, noteColumn],
        status: "ready",
        busy,
      });
      expect(screen.getAllByRole("cell")).toHaveLength(1);
      expect(
        screen.getByRole("cell", { name: "No data." }).getAttribute("colspan"),
      ).toBe("3");
    },
  );
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

const twoRows: Item[] = [
  { id: "r1", name: "Alpha" },
  { id: "r2", name: "Beta" },
];

function column(id: string, label: string): DataTableColumn<Item> {
  return { id, label, value: (row) => row.name };
}

function unreadable(): string {
  throw new Error("unreadable");
}

// @spec("RND-05", "c6e0387c")
describe("RND-05", () => {
  it.each<[string, Partial<DataTableProps<Item>>, string]>([
    ["caption is empty", { caption: " " }, "Table caption must not be empty."],
    // The "not a string" rows: a caller the type does not reach (plain JavaScript, untyped server JSON) passes one
    [
      "caption is not a string",
      { caption: undefined },
      "Table caption must not be empty.",
    ],
    [
      "regionLabel is empty",
      { regionLabel: "" },
      "Table region label must not be empty.",
    ],
    ["columns is empty", { columns: [] }, "Table has no columns."],
    [
      "a column id is empty",
      { columns: [column("ok", "Ok"), column("", "Name")] },
      "A column id is empty.",
    ],
    [
      "a column id is not a string",
      { columns: [column("ok", "Ok"), column(7 as unknown as string, "Name")] },
      "A column id is empty.",
    ],
    [
      "two columns share an id",
      { columns: [column("c", "Name"), column("c", "Code")] },
      "Two columns share an id.",
    ],
    [
      "a column label is empty",
      { columns: [column("ok", "Ok"), column("a", "")] },
      "A column label is empty.",
    ],
    [
      "a column label is not a string",
      {
        columns: [
          column("ok", "Ok"),
          column("a", undefined as unknown as string),
        ],
      },
      "A column label is empty.",
    ],
    [
      "two column labels are equal after trimming",
      { columns: [column("a", "Name"), column("b", "Name ")] },
      "Two columns share a label.",
    ],
    [
      "a column has neither value nor cell",
      // A caller the type does not reach (plain JavaScript): a column with neither value nor cell
      {
        columns: [
          column("ok", "Ok"),
          { id: "a", label: "Name" } as unknown as DataTableColumn<Item>,
        ],
      },
      "A column has no value and no cell.",
    ],
    ["a row id is empty", { getRowId: () => "" }, "A row id is empty."],
    [
      "two rows share an id",
      { rows: twoRows, getRowId: () => "same" },
      "Two rows share an id.",
    ],
    [
      'two rows share an id in its text form, 1 and "1"',
      { rows: twoRows, getRowId: (row) => (row.id === "r1" ? 1 : "1") },
      "Two rows share an id.",
    ],
    [
      "getRowId throws",
      { getRowId: unreadable },
      "A row id could not be read.",
    ],
    [
      "getRowId returns NaN",
      { getRowId: () => Number.NaN },
      "A row id could not be read.",
    ],
    [
      "getRowId returns Infinity",
      { getRowId: () => Number.POSITIVE_INFINITY },
      "A row id could not be read.",
    ],
    [
      "getRowId returns null",
      { getRowId: () => null as unknown as string },
      "A row id could not be read.",
    ],
    [
      "several faults: an empty caption and two rows sharing an id",
      { caption: "", rows: twoRows, getRowId: () => "same" },
      "Table caption must not be empty.",
    ],
    [
      "several faults: two empty column ids",
      { columns: [column("", "Name"), column("", "Code")] },
      "A column id is empty.",
    ],
    [
      "several faults: two empty column labels",
      { columns: [column("a", ""), column("b", "")] },
      "A column label is empty.",
    ],
    [
      "several faults: two empty row ids",
      { rows: twoRows, getRowId: () => "" },
      "A row id is empty.",
    ],
    [
      "several faults: an empty row id, then a row id that throws",
      {
        rows: twoRows,
        getRowId: (row) => (row.id === "r2" ? unreadable() : ""),
      },
      "A row id is empty.",
    ],
    // The pairs below are adjacent in RND-05's order of faults: each fails if its two checks swap order
    [
      "several faults: an empty caption and an empty region label",
      { caption: "", regionLabel: "" },
      "Table caption must not be empty.",
    ],
    [
      "several faults: an empty region label and no columns",
      { regionLabel: "", columns: [] },
      "Table region label must not be empty.",
    ],
    [
      "several faults: two columns sharing an id, one with an empty label",
      { columns: [column("c", "Name"), column("c", "")] },
      "Two columns share an id.",
    ],
    [
      "several faults: two columns sharing a label, one with neither value nor cell",
      {
        columns: [
          column("a", "Name"),
          { id: "b", label: "Name" } as unknown as DataTableColumn<Item>,
        ],
      },
      "Two columns share a label.",
    ],
    [
      "several faults: a column with neither value nor cell and an empty row id",
      {
        columns: [
          { id: "a", label: "Name" } as unknown as DataTableColumn<Item>,
        ],
        getRowId: () => "",
      },
      "A column has no value and no cell.",
    ],
    [
      "several faults: two rows sharing an id, then a row id that throws",
      {
        rows: [...twoRows, { id: "r3", name: "Gamma" }],
        getRowId: (row) => (row.id === "r3" ? unreadable() : "same"),
      },
      "Two rows share an id.",
    ],
  ])("shows only one alert, no table, when %s", (_fault, props, message) => {
    const component = show(props);
    expect(
      screen.getAllByRole("alert").map((alert) => alert.textContent),
    ).toEqual([message]);
    expect(component.querySelector("table")).toBeNull();
  });

  it("takes finite numbers as row ids: the table and no alert", () => {
    show({ rows: twoRows, getRowId: (row) => (row.id === "r1" ? 0 : 1) });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(firstCells()).toEqual(["Alpha", "Beta"]);
  });

  it("follows the props: the alert gives way to the table and comes back", async () => {
    const { rerender } = render(DataTable<Item>, { ...base, columns: [] });
    expect(screen.getByRole("alert").textContent).toBe("Table has no columns.");
    await rerender({ columns: [nameColumn] });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(firstCells()).toEqual(["Beta"]);
    await rerender({ caption: "" });
    expect(screen.getByRole("alert").textContent).toBe(
      "Table caption must not be empty.",
    );
    expect(screen.queryByRole("table")).toBeNull();
  });
});

// @spec("RND-09", "eb114954")
describe("RND-09", () => {
  it.each<[string, Partial<DataTableProps<Item>>, string, string[]]>([
    [
      "two rows with id r2, the second named Hidden-77",
      {
        rows: [
          { id: "r2", name: "Alpha" },
          { id: "r2", name: "Hidden-77" },
        ],
      },
      "Two rows share an id.",
      ["r2", "Hidden-77"],
    ],
    [
      "a getRowId that throws an error saying token-9",
      {
        getRowId: () => {
          throw new Error("token-9");
        },
      },
      "A row id could not be read.",
      ["token-9"],
    ],
    [
      "two columns with id col-x9",
      { columns: [column("col-x9", "Name"), column("col-x9", "Code")] },
      "Two columns share an id.",
      ["col-x9"],
    ],
    [
      "a column with id col-y7 and an empty label",
      { columns: [column("col-y7", "")] },
      "A column label is empty.",
      ["col-y7"],
    ],
  ])(
    "keeps the value out of the alert for %s",
    (_input, props, message, forbidden) => {
      show(props);
      const text = screen.getByRole("alert").textContent ?? "";
      expect(text).toContain(message);
      for (const word of forbidden) expect(text).not.toContain(word);
    },
  );
});

// @spec("RND-10", "2943a803")
describe("RND-10", () => {
  it("still renders the heading snippet beside the alert", () => {
    const component = showWithSnippets({ columns: [], withHeading: true });
    expect(screen.getByRole("alert").textContent).toBe("Table has no columns.");
    expect(screen.getByRole("heading", { name: "Orders" }).isConnected).toBe(
      true,
    );
    expect(component.querySelector("table")).toBeNull();
  });
});

describe("EXP-02 first examples; the statement's marker arrives with 1c", () => {
  it.each<[string, Partial<DataTableProps<Item>>]>([
    ["status 'ready' (the default), no rows", { rows: [] }],
    ["status 'ready' (the default), with rows", {}],
    ["the alert of RND-05", { columns: [] }],
  ])("renders the actions snippet in %s", (_state, props) => {
    showWithSnippets({ ...props, withActions: true });
    expect(screen.getByRole("button", { name: "Export" }).isConnected).toBe(
      true,
    );
  });
});

// @spec("STATE-01", "e9669674")
describe("STATE-01", () => {
  it("with status loading and no rows, shows the loading message and not the empty message", () => {
    show({ status: "loading", rows: [] });
    expect(screen.getByText(LOADING).isConnected).toBe(true);
    expect(screen.queryByText(EMPTY)).toBeNull();
  });
});

// @spec("STATE-02", "f207ffc8")
describe("STATE-02", () => {
  it("with status failed and no rows, shows the failed message and not the empty message", () => {
    show({ status: "failed", rows: [] });
    expect(screen.getByText(FAILED).isConnected).toBe(true);
    expect(screen.queryByText(EMPTY)).toBeNull();
  });
});

// @spec("STATE-06", "a563c7c4")
describe("STATE-06", () => {
  it.each([false, true])(
    "with status loading and busy %s, shows the loading message and none of the rows",
    (busy) => {
      show({ status: "loading", busy, rows: threeRows });
      expect(screen.getByText(LOADING).isConnected).toBe(true);
      for (const name of ["Beta", "Gamma", "Delta"])
        expect(screen.queryByRole("cell", { name })).toBeNull();
    },
  );
});

// True when A and B are the same type, read-only modifiers included
type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
// True when A can be passed where B is expected
type Fits<A, B> = [A] extends [B] ? true : false;
// True when field K is read-only in every member of the union T (a Pick over the whole union would hide one
// member that drops it)
type ReadOnlyField<T, K extends PropertyKey> = Same<
  T extends unknown
    ? K extends keyof T
      ? Same<Pick<T, K>, Readonly<Pick<T, K>>>
      : true
    : never,
  true
>;

describe("DataTableColumn's type", () => {
  it("keeps every field read-only", () => {
    // Each line compiles only while its field is read-only: the types and svelte steps check it
    const fields: [
      ReadOnlyField<DataTableColumn<Item>, "id">,
      ReadOnlyField<DataTableColumn<Item>, "label">,
      ReadOnlyField<DataTableColumn<Item>, "value">,
      ReadOnlyField<DataTableColumn<Item>, "cell">,
    ] = [true, true, true, true];
    expect(fields).toEqual([true, true, true, true]);
  });

  it("requires value or cell", () => {
    // Compiles only while a column with neither is refused: the types and svelte steps check it
    const neither: Fits<
      { id: string; label: string },
      DataTableColumn<Item>
    > = false;
    expect(neither).toBe(false);
  });
});
