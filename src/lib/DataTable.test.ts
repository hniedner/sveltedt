import { render, screen, within } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import CellSnippetTable from "../../test/CellSnippetTable.svelte";
import SnippetsTable from "../../test/SnippetsTable.svelte";
import DataTable from "./DataTable.svelte";
import type {
  DataTableColumn,
  DataTableMessages,
  DataTableProps,
  DataTableStatus,
} from "./types.ts";

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
    withQuietActions?: boolean;
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

// The props a rerender passes in full, so no prop of an earlier state stays behind
function state(props: Partial<DataTableProps<Item>>): DataTableProps<Item> {
  return { ...base, status: "ready", busy: false, ...props };
}

// Rows r0 to r(count - 1), named "Name 0" onward
function manyRows(count: number): Item[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `r${index}`,
    name: `Name ${index}`,
  }));
}

// The live count, found as the spec's glossary says: the polite live region with no role
function liveCount(component: HTMLElement): Element | null {
  return component.querySelector('[aria-live="polite"]:not([role])');
}

const codeColumn: DataTableColumn<Item> = {
  id: "code",
  label: "Code",
  value: (row) => row.id,
};

// Props that raise each message of RND-05's alert, keyed by the message
// The words of RND-05 and RND-06; the sort words are SORT-17's
type TableWords = Omit<DataTableMessages, `sort${string}`>;

const faults: [keyof TableWords, Partial<DataTableProps<Item>>][] = [
  ["captionEmpty", { caption: "" }],
  ["regionLabelEmpty", { regionLabel: "" }],
  ["noColumns", { columns: [] }],
  ["columnIdEmpty", { columns: [column("", "Name")] }],
  ["columnIdDuplicate", { columns: [column("a", "A"), column("a", "B")] }],
  ["columnLabelEmpty", { columns: [column("a", "")] }],
  ["columnLabelDuplicate", { columns: [column("a", "N"), column("b", "N")] }],
  [
    "columnContentMissing",
    { columns: [{ id: "a", label: "A" } as unknown as DataTableColumn<Item>] },
  ],
  ["statusUnknown", { status: "done" as unknown as DataTableStatus }],
  ["rowsNotList", { rows: undefined }],
  ["rowIdEmpty", { getRowId: () => "" }],
  ["rowIdDuplicate", { rows: threeRows, getRowId: () => "same" }],
  ["rowIdUnreadable", { getRowId: unreadable }],
];

// The five states of RND-14 and of EXP-01 and EXP-02
const fiveStates: [string, Partial<DataTableProps<Item>>][] = [
  ["status 'loading'", { status: "loading" }],
  ["status 'failed'", { status: "failed" }],
  ["status 'ready', no rows", { rows: [] }],
  ["status 'ready', with rows", {}],
  ["the alert of RND-05", { columns: [] }],
];

// The stopped state the slow-load group adds to the five of RND-14, EXP-01 to EXP-03; kept apart so A11Y-14 and RND-12
// keep their five
const stoppedState: [string, Partial<DataTableProps<Item>>][] = [
  ["status 'stopped'", { status: "stopped" }],
];

// @spec("A11Y-01", "7eb5c1e0")
describe("A11Y-01", () => {
  it("names a table that shows a sort button by the caption text, a space and the hint of SORT-28", () => {
    show({
      columns: [{ ...nameColumn, sortable: ["asc", "desc"] }],
      onsort: () => {},
    });
    expect(
      screen.getByRole("table", {
        name: "Orders Column headers with buttons are sortable.",
      }).isConnected,
    ).toBe(true);
  });

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

// @spec("STATE-20", "9e3a1a6c")
describe("STATE-20", () => {
  it.each<[string, Item[], string[]]>([
    ["no rows", [], []],
    ["three rows", threeRows, ["Beta", "Gamma", "Delta"]],
  ])(
    "with status stopped and %s, shows the stopped message in one cell spanning every column",
    (_rows, rows, absent) => {
      show({
        rows,
        columns: [idColumn, nameColumn, noteColumn],
        status: "stopped",
      });
      const table = screen.getByRole("table");
      expect(within(table).getAllByRole("columnheader")).toHaveLength(3);
      expect(within(table).getAllByRole("cell")).toHaveLength(1);
      expect(
        within(table)
          .getByRole("cell", { name: "Loading stopped" })
          .getAttribute("colspan"),
      ).toBe("3");
      for (const name of absent)
        expect(within(table).queryByRole("cell", { name })).toBeNull();
    },
  );
});

// @spec("STATE-21", "57aa083a")
describe("STATE-21", () => {
  it.each<[string, Item[]]>([
    ["no rows", []],
    ["two rows", threeRows.slice(0, 2)],
  ])("with status stopped and %s, shows no empty message", (_rows, rows) => {
    const component = show({ rows, status: "stopped" });
    // The stopped message is there, so an empty page cannot pass
    expect(screen.getByText("Loading stopped").isConnected).toBe(true);
    expect(component.textContent).not.toContain(EMPTY);
  });
});

// @spec("RND-03", "19d03ec8")
describe("RND-03", () => {
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
    [
      "the loading message",
      (text) => ({ status: "loading", messages: { loading: text } }),
      (text) => screen.getByText(text),
    ],
    [
      "the failed message",
      (text) => ({ status: "failed", messages: { failed: text } }),
      (text) => screen.getByText(text),
    ],
    [
      "the empty message",
      (text) => ({ rows: [], messages: { empty: text } }),
      (text) => screen.getByText(text),
    ],
    [
      "the text rowCount returns",
      (text) => ({ messages: { rowCount: () => text } }),
      (text) => screen.getByText(text),
    ],
    ...faults.map(
      ([key, props]): [
        string,
        (text: string) => Partial<DataTableProps<Item>>,
        (text: string) => HTMLElement,
      ] => [
        `the alert message ${key}`,
        (text) => ({ ...props, messages: { [key]: text } }),
        (text) => screen.getByText(text),
      ],
    ),
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

// @spec("RND-05", "e545c208")
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
      "columns is not an array",
      { columns: undefined },
      "Table has no columns.",
    ],
    ...[null, "name"].map(
      (value): [string, Partial<DataTableProps<Item>>, string] => [
        `a column is not an object (${String(value)})`,
        {
          columns: [
            column("ok", "Ok"),
            value as unknown as DataTableColumn<Item>,
          ],
        },
        "A column id is empty.",
      ],
    ),
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
    [
      "a column's value is not a function and it has no cell",
      {
        columns: [
          column("ok", "Ok"),
          {
            id: "a",
            label: "Name",
            value: "name",
          } as unknown as DataTableColumn<Item>,
        ],
      },
      "A column has no value and no cell.",
    ],
    [
      "a column's cell is not a snippet and it has no value",
      {
        columns: [
          column("ok", "Ok"),
          {
            id: "a",
            label: "Name",
            cell: "name",
          } as unknown as DataTableColumn<Item>,
        ],
      },
      "A column has no value and no cell.",
    ],
    ...["done", null].map(
      (status): [string, Partial<DataTableProps<Item>>, string] => [
        `status is outside its type (${String(status)})`,
        { status: status as unknown as DataTableStatus },
        "Table status is not known.",
      ],
    ),
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
      "several faults: a column with neither value nor cell and status 'done'",
      {
        columns: [
          { id: "a", label: "Name" } as unknown as DataTableColumn<Item>,
        ],
        status: "done" as unknown as DataTableStatus,
      },
      "A column has no value and no cell.",
    ],
    [
      "several faults: status 'done' and rows that are not an array",
      { status: "done" as unknown as DataTableStatus, rows: undefined },
      "Table status is not known.",
    ],
    [
      "several faults: two rows sharing an id, then a row id that throws",
      {
        rows: [...twoRows, { id: "r3", name: "Gamma" }],
        getRowId: (row) => (row.id === "r3" ? unreadable() : "same"),
      },
      "Two rows share an id.",
    ],
    [
      "rows is not an array, with status ready",
      { rows: undefined, status: "ready" },
      "Table has no list of rows.",
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

  it("takes status given as undefined as its default, ready: the table and no alert", () => {
    const component = show({ status: undefined });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(component.querySelector("table")).not.toBeNull();
    expect(firstCells()).toEqual(["Beta"]);
  });

  it("renders a value function beside a cell that is the text name by RND-08", () => {
    show({
      columns: [
        { ...nameColumn, cell: "name" } as unknown as DataTableColumn<Item>,
      ],
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(cellTexts()).toEqual([["Beta"]]);
  });

  it("renders a cell snippet beside a value that is the text name by RND-02", () => {
    render(CellSnippetTable, {
      rows: [{ id: "r1", name: "Beta" }],
      nameValue: "name",
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(cellTexts()).toEqual([["r1", "Open Beta in name"]]);
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

// @spec("EXP-02", "15dd3831")
describe("EXP-02", () => {
  it.each(fiveStates)("renders the actions snippet in %s", (_state, props) => {
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

// @spec("STATE-07", "2cfeee35")
describe("STATE-07", () => {
  it("with status failed, shows the failed message and none of the rows", () => {
    show({ status: "failed", rows: threeRows });
    expect(screen.getByText(FAILED).isConnected).toBe(true);
    for (const name of ["Beta", "Gamma", "Delta"])
      expect(screen.queryByRole("cell", { name })).toBeNull();
  });
});

// @spec("STATE-04", "c14f993d")
describe("STATE-04", () => {
  it.each<[DataTableStatus, boolean, string]>([
    ["ready", false, "false"],
    ["ready", true, "true"],
    ["loading", false, "true"],
    ["failed", false, "false"],
    ["stopped", false, "false"],
  ])(
    "with status %s and busy %s, the table's aria-busy is %s and the region has none",
    (status, busy, expected) => {
      show({ status, busy });
      expect(screen.getByRole("table").getAttribute("aria-busy")).toBe(
        expected,
      );
      expect(screen.getByRole("region").hasAttribute("aria-busy")).toBe(false);
    },
  );

  it("turns true into false when busy ends", async () => {
    const { rerender } = render(DataTable<Item>, state({ busy: true }));
    const table = screen.getByRole("table");
    expect(table.getAttribute("aria-busy")).toBe("true");
    await rerender(state({}));
    expect(table.getAttribute("aria-busy")).toBe("false");
  });
});

// @spec("STATE-05", "5fe71223")
describe("STATE-05", () => {
  it("with status ready and busy, keeps showing the 25 rows it was given", () => {
    show({ status: "ready", busy: true, rows: manyRows(25) });
    expect(firstCells()).toHaveLength(25);
  });
});

// @spec("A11Y-05", "28e1349a")
describe("A11Y-05", () => {
  it.each<[DataTableStatus, boolean, number, string]>([
    ["ready", false, 2, "2 rows displayed"],
    ["ready", false, 0, "0 rows displayed"],
    ["ready", true, 2, ""],
    ["ready", true, 0, ""],
    ["loading", false, 2, ""],
    ["failed", false, 0, ""],
    ["stopped", false, 0, ""],
  ])(
    "with status %s, busy %s and %i rows, the live count says %j",
    (status, busy, count, text) => {
      const component = show({ status, busy, rows: manyRows(count) });
      const live = liveCount(component);
      expect(live).not.toBeNull();
      expect(live?.textContent.trim()).toBe(text);
    },
  );
});

// @spec("A11Y-14", "5a9bec79")
describe("A11Y-14", () => {
  it("rerendered from ready to loading, shows the loading message in the status element that was there before", async () => {
    const { rerender } = render(DataTable<Item>, state({}));
    const status = screen.getByRole("status");
    await rerender(state({ status: "loading" }));
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent.trim()).toBe(LOADING);
  });

  it("rerendered from the alert to loading, shows the loading message in the status element that was there before", async () => {
    const { rerender } = render(DataTable<Item>, state({ columns: [] }));
    const status = screen.getByRole("status");
    await rerender(state({ status: "loading" }));
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent.trim()).toBe(LOADING);
  });

  it.each(fiveStates.filter(([name]) => name !== "status 'loading'"))(
    "holds nothing in the status element: %s",
    (_name, props) => {
      show(props);
      expect(screen.getByRole("status").textContent.trim()).toBe("");
    },
  );

  it("mounted with status loading, the status element holds the loading message", () => {
    show({ status: "loading" });
    expect(screen.getByRole("status").textContent.trim()).toBe(LOADING);
  });
});

// @spec("A11Y-15", "2588c0ed")
describe("A11Y-15", () => {
  it("rerendered from loading to failed, holds the failed message in the alert", async () => {
    const { rerender } = render(DataTable<Item>, state({ status: "loading" }));
    await rerender(state({ status: "failed" }));
    expect(screen.getByRole("alert").textContent.trim()).toBe(FAILED);
  });
});

// @spec("A11Y-21", "d7a4d068")
describe("A11Y-21", () => {
  it.each<[string, Partial<DataTableProps<Item>> | null]>([
    ["mounted stopped", null],
    ["rerendered from loading", { status: "loading" }],
    ["rerendered from failed", { status: "failed" }],
  ])("keeps the stopped message out of any alert: %s", async (_from, first) => {
    const columns = [nameColumn, codeColumn];
    const { rerender } = render(
      DataTable<Item>,
      state({ columns, ...(first ?? { status: "stopped" }) }),
    );
    if (first) await rerender(state({ columns, status: "stopped" }));
    // The message is on the page, so a page without it cannot pass
    expect(screen.getByText("Loading stopped").isConnected).toBe(true);
    for (const alert of screen.queryAllByRole("alert"))
      expect(alert.textContent).not.toContain("Loading stopped");
  });
});

// @spec("A11Y-22", "eb8dfc31")
describe("A11Y-22", () => {
  it.each<[string, Partial<DataTableProps<Item>>[], boolean[]]>([
    [
      "failed, loading, failed",
      [{ status: "failed" }, { status: "loading" }, { status: "failed" }],
      [true, false, true],
    ],
    [
      "failed, ready with two rows, loading, failed",
      [
        { status: "failed" },
        { status: "ready", rows: twoRows },
        { status: "loading" },
        { status: "failed" },
      ],
      [true, false, false, true],
    ],
    [
      "failed, stopped, failed",
      [{ status: "failed" }, { status: "stopped" }, { status: "failed" }],
      [true, false, true],
    ],
  ])(
    "holds the failed message exactly while failed: %s",
    async (_steps, steps, held) => {
      const columns = [nameColumn, codeColumn];
      const { container, rerender } = render(
        DataTable<Item>,
        state({ columns, ...steps[0] }),
      );
      for (const [index, step] of steps.entries()) {
        if (index > 0) await rerender(state({ columns, ...step }));
        // textContent includes hidden text, so a message only hidden still counts
        if (held[index])
          expect(screen.getByRole("alert").textContent.trim()).toBe(FAILED);
        else expect(container.textContent).not.toContain(FAILED);
      }
    },
  );
});

// The default texts of RND-05's alert, one per message key
const ALERT_TEXTS = [
  "Table caption must not be empty.",
  "Table region label must not be empty.",
  "Table has no columns.",
  "A column id is empty.",
  "Two columns share an id.",
  "A column label is empty.",
  "Two columns share a label.",
  "A column has no value and no cell.",
  "Table status is not known.",
  "Table has no list of rows.",
  "A row id is empty.",
  "Two rows share an id.",
  "A row id could not be read.",
];

// @spec("STATE-08", "afee0d46")
describe("STATE-08", () => {
  it.each<[DataTableStatus, unknown, string]>([
    ["loading", undefined, LOADING],
    ["loading", null, LOADING],
    ["failed", undefined, FAILED],
  ])(
    "with status %s and rows %s, shows that state's message and not the alert",
    (status, rows, text) => {
      // A caller the type does not reach: a pending fetch passes no list yet
      const component = show({
        status,
        rows: rows as Item[],
        columns: [nameColumn, codeColumn],
      });
      expect(screen.getByText(text).isConnected).toBe(true);
      for (const message of ALERT_TEXTS)
        expect(component.textContent).not.toContain(message);
    },
  );
});

// @spec("STATE-28", "3b8cc640")
describe("STATE-28", () => {
  it.each<[string, Partial<DataTableProps<Item>>[], boolean[]]>([
    [
      "stopped, loading, stopped",
      [{ status: "stopped" }, { status: "loading" }, { status: "stopped" }],
      [true, false, true],
    ],
    [
      "stopped, ready with two rows, failed, stopped",
      [
        { status: "stopped" },
        { status: "ready", rows: threeRows.slice(0, 2) },
        { status: "failed" },
        { status: "stopped" },
      ],
      [true, false, false, true],
    ],
  ])(
    "holds the stopped message exactly while stopped: %s",
    async (_steps, steps, held) => {
      const columns = [nameColumn, codeColumn];
      const { container, rerender } = render(
        DataTable<Item>,
        state({ columns, ...steps[0] }),
      );
      for (const [index, step] of steps.entries()) {
        if (index > 0) await rerender(state({ columns, ...step }));
        // textContent includes hidden text, so a message only hidden still counts
        if (held[index])
          expect(
            within(screen.getByRole("table")).getByText("Loading stopped")
              .isConnected,
          ).toBe(true);
        else expect(container.textContent).not.toContain("Loading stopped");
      }
    },
  );
});

// @spec("STATE-24", "fd6b9b8c")
describe("STATE-24", () => {
  // The table has no onretry prop yet (the button is #145's): the test holds the state the button's absence rides on
  it.each<DataTableStatus>(["stopped", "failed"])(
    "with status %s and invalid input, shows the one alert, no table and no Try again",
    (status) => {
      show({ status, columns: [] });
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(screen.queryByRole("table")).toBeNull();
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    },
  );
});

// @spec("STATE-22", "67351516")
describe("STATE-22", () => {
  it.each<[string, unknown]>([
    ["undefined", undefined],
    ["null", null],
  ])(
    "with status stopped and rows %s, shows the stopped message and no alert",
    (_rows, rows) => {
      // A caller the type does not reach: a load ended before any answer passes no list
      show({
        status: "stopped",
        rows: rows as Item[],
        columns: [nameColumn, codeColumn],
      });
      expect(screen.getByText("Loading stopped").isConnected).toBe(true);
      expect(screen.queryAllByRole("alert")).toHaveLength(0);
    },
  );
});

// @spec("RND-06", "5a7fccfd")
describe("RND-06", () => {
  const foreign: TableWords = {
    loading: "Laden…",
    failed: "Laden fehlgeschlagen.",
    empty: "Keine Daten.",
    rowCount: (count) => (count === 1 ? "1 Zeile" : `${count} Zeilen`),
    captionEmpty: "F-captionEmpty",
    regionLabelEmpty: "F-regionLabelEmpty",
    noColumns: "F-noColumns",
    columnIdEmpty: "F-columnIdEmpty",
    columnIdDuplicate: "F-columnIdDuplicate",
    columnLabelEmpty: "F-columnLabelEmpty",
    columnLabelDuplicate: "F-columnLabelDuplicate",
    columnContentMissing: "F-columnContentMissing",
    statusUnknown: "F-statusUnknown",
    rowsNotList: "F-rowsNotList",
    rowIdEmpty: "F-rowIdEmpty",
    rowIdDuplicate: "F-rowIdDuplicate",
    rowIdUnreadable: "F-rowIdUnreadable",
  };
  const english = [
    LOADING,
    FAILED,
    EMPTY,
    "rows displayed",
    "row displayed",
    ...ALERT_TEXTS,
  ];
  const status = (): string => screen.getByRole("status").textContent;
  const alert = (): string => screen.getByRole("alert").textContent;
  const cell = (): string => screen.getByRole("cell").textContent;
  const live = (): string => liveCount(document.body)?.textContent ?? "";

  it.each<[string, Partial<DataTableProps<Item>>, () => string, string]>([
    ["loading", { status: "loading" }, status, "Laden…"],
    ["failed", { status: "failed" }, alert, "Laden fehlgeschlagen."],
    ["empty", { rows: [] }, cell, "Keine Daten."],
    ["rowCount, 2 rows", { rows: twoRows }, live, "2 Zeilen"],
    ["rowCount, 1 row", {}, live, "1 Zeile"],
    ...faults.map(
      ([key, props]) =>
        [key, props, alert, foreign[key]] as [
          string,
          Partial<DataTableProps<Item>>,
          () => string,
          string,
        ],
    ),
  ])(
    "shows the given %s word where its statement says, and no English default",
    (_message, props, where, text) => {
      show({ ...props, messages: foreign });
      expect(where().trim()).toBe(text);
      const page = [
        document.body.textContent,
        ...[...document.body.querySelectorAll("*")].flatMap((element) =>
          [...element.attributes].map((attribute) => attribute.value),
        ),
      ].join("\n");
      for (const word of english) expect(page).not.toContain(word);
    },
  );

  it.each<[string, Partial<DataTableProps<Item>>, () => string, string]>([
    [
      "noColumns",
      { columns: [], messages: { noColumns: undefined } },
      alert,
      "Table has no columns.",
    ],
    [
      "rowCount",
      { messages: { rowCount: undefined } },
      live,
      "1 row displayed",
    ],
    [
      "loading",
      { status: "loading", messages: { loading: undefined } },
      status,
      LOADING,
    ],
  ])(
    "keeps the English default of %s when its entry is given as undefined, as a lookup that misses gives it",
    (_message, props, where, text) => {
      show(props);
      expect(where().trim()).toBe(text);
    },
  );

  // A caller the type does not reach: untyped translation data
  it.each<
    [string, unknown, Partial<DataTableProps<Item>>, () => string, string]
  >([
    ["noColumns", null, { columns: [] }, alert, "Table has no columns."],
    ["loading", 5, { status: "loading" }, status, LOADING],
    ["rowCount", "Zeilen", {}, live, "1 row displayed"],
    ["noColumns", "", { columns: [] }, alert, "Table has no columns."],
    ["loading", "  ", { status: "loading" }, status, LOADING],
  ])(
    "keeps the English default of %s when its entry is %j",
    (key, entry, props, where, text) => {
      show({
        ...props,
        messages: { [key]: entry } as unknown as Partial<DataTableMessages>,
      });
      expect(where().trim()).toBe(text);
    },
  );
});

// @spec("RND-13", "fcf0e08a")
describe("RND-13", () => {
  it.each<[DataTableStatus, boolean, string[]]>([
    ["loading", false, [LOADING]],
    ["failed", false, [FAILED]],
    ["ready", false, [EMPTY]],
    ["ready", true, []],
    ["stopped", false, ["Loading stopped"]],
  ])(
    "with columns [], status %s and busy %s, shows only the alert",
    (status, busy, hidden) => {
      const component = show({ columns: [], rows: [], status, busy });
      expect(
        screen.getAllByRole("alert").map((alert) => alert.textContent),
      ).toEqual(["Table has no columns."]);
      for (const text of hidden)
        expect(component.textContent).not.toContain(text);
      // Both live elements stay in the document, empty, beside the alert
      expect(liveCount(component)?.textContent.trim()).toBe("");
      expect(screen.getByRole("status").textContent.trim()).toBe("");
    },
  );
});

// @spec("RND-14", "ca53efc4")
describe("RND-14", () => {
  it.each([...fiveStates, ...stoppedState])(
    "renders the heading before the region, or before the alert, in %s",
    (_state, props) => {
      showWithSnippets({ ...props, withHeading: true });
      const heading = screen.getByRole("heading", { name: "Orders" });
      const next = screen.queryByRole("region") ?? screen.getByRole("alert");
      expect(
        heading.compareDocumentPosition(next) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );
});

// @spec("EXP-01", "d8229d47")
describe("EXP-01", () => {
  it.each(fiveStates)(
    "offers no export or download control of its own in %s",
    (_state, props) => {
      showWithSnippets({ ...props, withQuietActions: true });
      for (const role of ["button", "link", "menuitem"] as const)
        expect(
          screen.queryAllByRole(role, { name: /export|download/i }),
        ).toHaveLength(0);
    },
  );
});

// @spec("EXP-03", "510011e7")
describe("EXP-03", () => {
  it("starts no download during mount, every state and a pass of the focus through the table", async () => {
    // A spy in place of Node's URL.createObjectURL, the one the simulated DOM uses
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:spy");
    try {
      const { container, rerender } = render(SnippetsTable, {
        ...state({}),
        withActions: true,
      });
      for (const [, props] of fiveStates) {
        await rerender({ ...state(props), withActions: true });
        expect(document.querySelector("a[download]")).toBeNull();
      }
      // No Tab key in the simulated DOM: each focusable element takes the focus in document order. A download
      // started by a key press, or by an anchor added and removed within one step, is out of this test's sight.
      for (const element of container.querySelectorAll<HTMLElement>(
        "a[href], button, [tabindex]",
      ))
        element.focus();
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(document.querySelector("a[download]")).toBeNull();
    } finally {
      createObjectURL.mockRestore();
    }
  });
});

// @spec("RND-07", "9b9433bb")
describe("RND-07", () => {
  it("shows no sort button for the columns Name and Note, neither sortable", () => {
    show({ columns: [nameColumn, noteColumn] });
    expect(
      screen.queryAllByRole("button", { name: /^(Name|Note)$/ }),
    ).toHaveLength(0);
    for (const header of screen.getAllByRole("columnheader"))
      expect(within(header).queryAllByRole("button")).toHaveLength(0);
  });
});

// @spec("RND-11", "505ee36c")
describe("RND-11", () => {
  it("shows no filter button for the columns Name and Note, neither with a filter", () => {
    show({ columns: [nameColumn, noteColumn] });
    expect(screen.queryAllByRole("button", { name: /^Filter/ })).toHaveLength(
      0,
    );
  });
});

// @spec("RND-12", "f3696064")
describe("RND-12", () => {
  it.each<[string, Partial<DataTableProps<Item>>]>([
    ...fiveStates,
    ["status 'ready', busy", { busy: true }],
  ])(
    "shows no Reset table button with two plain columns in %s",
    (_state, props) => {
      show({ columns: [nameColumn, noteColumn], ...props });
      expect(screen.queryByRole("button", { name: "Reset table" })).toBeNull();
    },
  );
});

// @spec("A11Y-04", "550c2ce1")
describe("A11Y-04", () => {
  it("has no grid role and no focusable row or cell, 25 rows with a link in a cell snippet", () => {
    const { container } = render(CellSnippetTable, { rows: manyRows(25) });
    expect(
      container.querySelectorAll(
        '[role="grid"], [role="treegrid"], [role="gridcell"]',
      ),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll("tr[tabindex], th[tabindex], td[tabindex]"),
    ).toHaveLength(0);
    expect(screen.getAllByRole("link")).toHaveLength(25);
  });
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
