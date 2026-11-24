import { render, screen, within } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import CellSnippetTable from "../../test/CellSnippetTable.svelte";
import { inProduction, useConsoleErrors } from "../../test/console-spy.ts";
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

// The alert of RND-05 is one fixed text; the cause of each fault is the console line of RND-17: its code and its text
// in development (RND-05's table)
const FIXED = "This table cannot be shown.";
const FAULT_TEXTS = {
  captionEmpty: "Table caption must not be empty.",
  regionLabelEmpty: "Table region label must not be empty.",
  noColumns: "Table has no columns.",
  columnIdEmpty: "A column id is empty.",
  columnIdDuplicate: "Two columns share an id.",
  columnLabelEmpty: "A column label is empty.",
  columnLabelDuplicate: "Two columns share a label.",
  columnContentMissing: "A column has no value and no cell.",
  statusUnknown: "Table status is not known.",
  rowsNotList: "Table has no list of rows.",
  rowIdEmpty: "A row id is empty.",
  rowIdDuplicate: "Two rows share an id.",
  rowIdUnreadable: "A row id could not be read.",
};
type FaultCode = keyof typeof FAULT_TEXTS;
const line = (code: FaultCode): string =>
  `SvelteDT: ${code}: ${FAULT_TEXTS[code]}`;
// The texts passed to console.error since the test began
const errors = useConsoleErrors();

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

// The five states of RND-14 and of EXP-01 and EXP-02
const fiveStates: [string, Partial<DataTableProps<Item>>][] = [
  ["status 'loading'", { status: "loading" }],
  ["status 'failed'", { status: "failed" }],
  ["status 'ready', no rows", { rows: [] }],
  ["status 'ready', with rows", {}],
  ["the alert of RND-05", { columns: [] }],
];

// The stopped state the slow-load group adds to the five of RND-14, EXP-01 to EXP-03; kept apart because A11Y-14 and
// RND-12 list the five states and not stopped: fold the two lists together if their statements are widened
const stoppedState: [string, Partial<DataTableProps<Item>>][] = [
  ["status 'stopped'", { status: "stopped" }],
];
const sixStates = [...fiveStates, ...stoppedState];

// @spec("A11Y-01", "500332d8")
describe("A11Y-01", () => {
  it("names a table that shows a sort button by the caption text, a space and the hint of SORT-28", () => {
    show({
      columns: [{ ...nameColumn, sortable: ["asc", "desc"] }],
      onsort: () => {},
    });
    expect(
      screen.getByRole("table", {
        name: "Orders Column names that are buttons sort the table.",
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
  it.each<[string, Item[], string[], DataTableColumn<Item>[]]>([
    ["no rows", [], [], [idColumn, nameColumn, noteColumn]],
    [
      "three rows",
      threeRows,
      ["Beta", "Gamma", "Delta"],
      [idColumn, nameColumn, noteColumn],
    ],
    // The span follows the column count, so it cannot be a fixed number
    ["no rows and two columns", [], [], [idColumn, nameColumn]],
  ])(
    "with status stopped and %s, shows the stopped message in one cell spanning every column",
    (_rows, rows, absent, columns) => {
      show({ rows, columns, status: "stopped" });
      const table = screen.getByRole("table");
      expect(within(table).getAllByRole("columnheader")).toHaveLength(
        columns.length,
      );
      expect(within(table).getAllByRole("cell")).toHaveLength(1);
      expect(
        within(table)
          .getByRole("cell", { name: "Loading stopped" })
          .getAttribute("colspan"),
      ).toBe(String(columns.length));
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
    expect(
      within(screen.getByRole("table")).getByText("Loading stopped")
        .isConnected,
    ).toBe(true);
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
    [
      "the alert word invalidInput",
      (text) => ({ columns: [], messages: { invalidInput: text } }),
      (text) => screen.getByText(text),
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

// The rows of RND-05's table: the invalid input, and the code of its fault
const rnd05Rows: [string, Partial<DataTableProps<Item>>, FaultCode][] = [
  ["caption is empty", { caption: " " }, "captionEmpty"],
  // The "not a string" rows: a caller the type does not reach (plain JavaScript, untyped server JSON) passes one
  ["caption is not a string", { caption: undefined }, "captionEmpty"],
  ["regionLabel is empty", { regionLabel: "" }, "regionLabelEmpty"],
  ["columns is empty", { columns: [] }, "noColumns"],
  ["columns is not an array", { columns: undefined }, "noColumns"],
  ...[null, "name"].map(
    (value): [string, Partial<DataTableProps<Item>>, FaultCode] => [
      `a column is not an object (${String(value)})`,
      {
        columns: [
          column("ok", "Ok"),
          value as unknown as DataTableColumn<Item>,
        ],
      },
      "columnIdEmpty",
    ],
  ),
  [
    "a column id is empty",
    { columns: [column("ok", "Ok"), column("", "Name")] },
    "columnIdEmpty",
  ],
  [
    "a column id is not a string",
    { columns: [column("ok", "Ok"), column(7 as unknown as string, "Name")] },
    "columnIdEmpty",
  ],
  [
    "two columns share an id",
    { columns: [column("c", "Name"), column("c", "Code")] },
    "columnIdDuplicate",
  ],
  [
    "a column label is empty",
    { columns: [column("ok", "Ok"), column("a", "")] },
    "columnLabelEmpty",
  ],
  [
    "a column label is not a string",
    {
      columns: [
        column("ok", "Ok"),
        column("a", undefined as unknown as string),
      ],
    },
    "columnLabelEmpty",
  ],
  [
    "two column labels are equal after trimming",
    { columns: [column("a", "Name"), column("b", "Name ")] },
    "columnLabelDuplicate",
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
    "columnContentMissing",
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
    "columnContentMissing",
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
    "columnContentMissing",
  ],
  ...["done", null].map(
    (status): [string, Partial<DataTableProps<Item>>, FaultCode] => [
      `status is outside its type (${String(status)})`,
      { status: status as unknown as DataTableStatus },
      "statusUnknown",
    ],
  ),
  ["a row id is empty", { getRowId: () => "" }, "rowIdEmpty"],
  [
    "two rows share an id",
    { rows: twoRows, getRowId: () => "same" },
    "rowIdDuplicate",
  ],
  [
    'two rows share an id in its text form, 1 and "1"',
    { rows: twoRows, getRowId: (row) => (row.id === "r1" ? 1 : "1") },
    "rowIdDuplicate",
  ],
  ["getRowId throws", { getRowId: unreadable }, "rowIdUnreadable"],
  ["getRowId returns NaN", { getRowId: () => Number.NaN }, "rowIdUnreadable"],
  [
    "getRowId returns Infinity",
    { getRowId: () => Number.POSITIVE_INFINITY },
    "rowIdUnreadable",
  ],
  [
    "getRowId returns null",
    { getRowId: () => null as unknown as string },
    "rowIdUnreadable",
  ],
  [
    "several faults: an empty caption and two rows sharing an id",
    { caption: "", rows: twoRows, getRowId: () => "same" },
    "captionEmpty",
  ],
  [
    "several faults: two empty column ids",
    { columns: [column("", "Name"), column("", "Code")] },
    "columnIdEmpty",
  ],
  [
    "several faults: two empty column labels",
    { columns: [column("a", ""), column("b", "")] },
    "columnLabelEmpty",
  ],
  [
    "several faults: two empty row ids",
    { rows: twoRows, getRowId: () => "" },
    "rowIdEmpty",
  ],
  [
    "several faults: an empty row id, then a row id that throws",
    {
      rows: twoRows,
      getRowId: (row) => (row.id === "r2" ? unreadable() : ""),
    },
    "rowIdEmpty",
  ],
  // The pairs below are adjacent in RND-05's order of faults: each fails if its two checks swap order
  [
    "several faults: an empty caption and an empty region label",
    { caption: "", regionLabel: "" },
    "captionEmpty",
  ],
  [
    "several faults: an empty region label and no columns",
    { regionLabel: "", columns: [] },
    "regionLabelEmpty",
  ],
  [
    "several faults: two columns sharing an id, one with an empty label",
    { columns: [column("c", "Name"), column("c", "")] },
    "columnIdDuplicate",
  ],
  [
    "several faults: two columns sharing a label, one with neither value nor cell",
    {
      columns: [
        column("a", "Name"),
        { id: "b", label: "Name" } as unknown as DataTableColumn<Item>,
      ],
    },
    "columnLabelDuplicate",
  ],
  [
    "several faults: a column with neither value nor cell and an empty row id",
    {
      columns: [{ id: "a", label: "Name" } as unknown as DataTableColumn<Item>],
      getRowId: () => "",
    },
    "columnContentMissing",
  ],
  [
    "several faults: a column with neither value nor cell and status 'done'",
    {
      columns: [{ id: "a", label: "Name" } as unknown as DataTableColumn<Item>],
      status: "done" as unknown as DataTableStatus,
    },
    "columnContentMissing",
  ],
  [
    "several faults: status 'done' and rows that are not an array",
    { status: "done" as unknown as DataTableStatus, rows: undefined },
    "statusUnknown",
  ],
  [
    "several faults: two rows sharing an id, then a row id that throws",
    {
      rows: [...twoRows, { id: "r3", name: "Gamma" }],
      getRowId: (row) => (row.id === "r3" ? unreadable() : "same"),
    },
    "rowIdDuplicate",
  ],
  [
    "rows is not an array, with status ready",
    { rows: undefined, status: "ready" },
    "rowsNotList",
  ],
];

// @spec("RND-05", "d6ffc969")
describe("RND-05", () => {
  it.each(rnd05Rows)(
    "shows only the one fixed alert, no table, and logs the code, when %s",
    (_fault, props, code) => {
      const component = show(props);
      expect(
        screen.getAllByRole("alert").map((alert) => alert.textContent),
      ).toEqual([FIXED]);
      expect(component.querySelector("table")).toBeNull();
      expect(errors()).toEqual([line(code)]);
    },
  );

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
    expect(screen.getByRole("alert").textContent).toBe(FIXED);
    await rerender({ columns: [nameColumn] });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(firstCells()).toEqual(["Beta"]);
    await rerender({ caption: "" });
    expect(screen.getByRole("alert").textContent).toBe(FIXED);
    expect(screen.queryByRole("table")).toBeNull();
  });
});

// @spec("RND-09", "109c463a")
describe("RND-09", () => {
  it.each<[string, Partial<DataTableProps<Item>>, FaultCode, string[]]>([
    [
      "two rows with id r2, the second named Hidden-77",
      {
        rows: [
          { id: "r2", name: "Alpha" },
          { id: "r2", name: "Hidden-77" },
        ],
      },
      "rowIdDuplicate",
      ["r2", "Hidden-77"],
    ],
    [
      "a getRowId that throws an error saying token-9",
      {
        getRowId: () => {
          throw new Error("token-9");
        },
      },
      "rowIdUnreadable",
      ["token-9"],
    ],
    [
      "two columns with id col-x9",
      { columns: [column("col-x9", "Name"), column("col-x9", "Code")] },
      "columnIdDuplicate",
      ["col-x9"],
    ],
    [
      "a column with id col-y7 and an empty label",
      { columns: [column("col-y7", "")] },
      "columnLabelEmpty",
      ["col-y7"],
    ],
  ])(
    "keeps the value out of the alert and the console line for %s",
    (_input, props, code, forbidden) => {
      show(props);
      const texts = [screen.getByRole("alert").textContent ?? "", ...errors()];
      expect(texts).toEqual([FIXED, line(code)]);
      for (const word of forbidden)
        for (const text of texts) expect(text).not.toContain(word);
    },
  );
});

// @spec("RND-10", "2943a803")
describe("RND-10", () => {
  it("still renders the heading snippet beside the alert", () => {
    const component = showWithSnippets({ columns: [], withHeading: true });
    expect(screen.getByRole("alert").textContent).toBe(FIXED);
    expect(screen.getByRole("heading", { name: "Orders" }).isConnected).toBe(
      true,
    );
    expect(component.querySelector("table")).toBeNull();
  });
});

// @spec("EXP-02", "15dd3831")
describe("EXP-02", () => {
  it.each(sixStates)("renders the actions snippet in %s", (_state, props) => {
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
    expect(
      within(screen.getByRole("table")).getByText("Loading stopped")
        .isConnected,
    ).toBe(true);
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

// @spec("STATE-08", "a828368a")
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
      expect(component.textContent).not.toContain(FIXED);
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

// @spec("STATE-24", "768017fd")
describe("STATE-24", () => {
  // Half of STATE-24 (no "Try again") is asserted by the build that adds the button, shown red with it rendered
  it.each<DataTableStatus>(["stopped", "failed"])(
    "with status %s and invalid input, shows the one alert and no table",
    (status) => {
      show({ status, columns: [] });
      expect(
        screen.getAllByRole("alert").map((alert) => alert.textContent),
      ).toEqual([FIXED]);
      expect(screen.queryByRole("table")).toBeNull();
    },
  );
});

// @spec("STATE-22", "f2c984f4")
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
      expect(
        within(screen.getByRole("table")).getByText("Loading stopped")
          .isConnected,
      ).toBe(true);
      expect(screen.queryAllByRole("alert")).toHaveLength(0);
    },
  );
});

// @spec("RND-06", "d2591ea5")
describe("RND-06", () => {
  // Only the words of RND-06: the other statements own the rest (SORT-17, STATE-26, FILT-47)
  const foreign: Pick<
    DataTableMessages,
    "loading" | "failed" | "empty" | "rowCount" | "invalidInput"
  > = {
    loading: "Laden…",
    failed: "Laden fehlgeschlagen.",
    empty: "Keine Daten.",
    rowCount: (count) => (count === 1 ? "1 Zeile" : `${count} Zeilen`),
    invalidInput: "Diese Tabelle kann nicht gezeigt werden.",
  };
  const english = [
    LOADING,
    FAILED,
    EMPTY,
    "rows displayed",
    "row displayed",
    FIXED,
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
    [
      "invalidInput",
      { columns: [] },
      alert,
      "Diese Tabelle kann nicht gezeigt werden.",
    ],
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
      "invalidInput",
      { columns: [], messages: { invalidInput: undefined } },
      alert,
      FIXED,
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
    ["invalidInput", null, { columns: [] }, alert, FIXED],
    ["loading", 5, { status: "loading" }, status, LOADING],
    ["rowCount", "Zeilen", {}, live, "1 row displayed"],
    ["invalidInput", "", { columns: [] }, alert, FIXED],
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

// @spec("RND-13", "42e9a9a7")
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
      ).toEqual([FIXED]);
      for (const text of hidden)
        expect(component.textContent).not.toContain(text);
      // Both live elements stay in the document, empty, beside the alert
      expect(liveCount(component)?.textContent.trim()).toBe("");
      expect(screen.getByRole("status").textContent.trim()).toBe("");
    },
  );

  it("shows no progress indicator and no still-loading text beside the alert at 6000 ms", async () => {
    vi.useFakeTimers();
    try {
      const component = show({ columns: [], rows: [], status: "loading" });
      await vi.advanceTimersByTimeAsync(6000);
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(component.querySelector("[data-sdt-progress]")).toBeNull();
      expect(component.textContent).not.toContain("Still loading");
    } finally {
      vi.useRealTimers();
    }
  });
});

// @spec("RND-17", "048e2060")
describe("RND-17", () => {
  const bad: Partial<DataTableProps<Item>> = { columns: [] };

  it("writes nothing for valid input", () => {
    show();
    expect(errors()).toEqual([]);
  });

  it("writes one line, once, when the same fault is rerendered", async () => {
    const { rerender } = render(DataTable<Item>, { ...base, ...bad });
    await rerender({ ...bad, caption: "Orders again" });
    await rerender({ ...bad, busy: true });
    expect(errors()).toEqual([line("noColumns")]);
  });

  it("writes one line for each change of the fault: a fault, then another fault", async () => {
    const { rerender } = render(DataTable<Item>, { ...base, ...bad });
    await rerender({ columns: [nameColumn], caption: "" });
    expect(errors()).toEqual([line("noColumns"), line("captionEmpty")]);
  });

  it("writes the same line again after a valid state", async () => {
    const { rerender } = render(DataTable<Item>, { ...base, ...bad });
    await rerender({ columns: [nameColumn] });
    await rerender({ columns: [] });
    expect(errors()).toEqual([line("noColumns"), line("noColumns")]);
  });

  it("writes one line for each mounted table", () => {
    show(bad);
    show({ caption: "" });
    expect(errors()).toEqual([line("noColumns"), line("captionEmpty")]);
  });

  it("writes one line naming the first fault that applies", () => {
    show({ caption: "", columns: [] });
    expect(errors()).toEqual([line("captionEmpty")]);
  });

  // The code alone in production: a test-side mock of the constant that esm-env's export conditions decide (CON-14
  // proves the bundler's own production condition)
  it.each(rnd05Rows)(
    "writes only the code in production when %s",
    async (_fault, props, code) => {
      await inProduction(async () => {
        const { render: renderAgain, cleanup } =
          await import("@testing-library/svelte");
        const { default: Table } = await import("./DataTable.svelte");
        renderAgain(Table<Item>, { ...base, ...props });
        cleanup();
      });
      expect(errors()).toEqual([`SvelteDT: ${code}`]);
    },
  );
});

// @spec("RND-14", "ca53efc4")
describe("RND-14", () => {
  it.each(sixStates)(
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
  it.each(sixStates)(
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
      for (const [, props] of sixStates) {
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
