import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import CriteriaTable from "../../test/CriteriaTable.svelte";
import DataTable from "./DataTable.svelte";
import type {
  DataTableColumn,
  DataTableMessages,
  DataTableProps,
} from "./types.ts";

interface Item {
  id: string;
  name: string;
  code: string;
  status: string;
  note: string;
}

const rows: Item[] = [
  { id: "r1", name: "Alpha", code: "A-1", status: "active", note: "" },
];

type Field = "name" | "code" | "status" | "note";
// The spec's columns of section 11: Name (text filter), Code (sortable, text filter), Status (categorical), Note (none)
function column(
  id: Field,
  label: string,
  extra: Partial<DataTableColumn<Item>> = {},
): DataTableColumn<Item> {
  return { id, label, value: (row) => row[id], ...extra };
}
const nameColumn = column("name", "Name", { filter: { kind: "text" } });
const statusColumn = column("status", "Status", {
  filter: {
    kind: "categorical",
    options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ],
  },
});
const codeColumn = column("code", "Code", {
  sortable: ["asc", "desc"],
  filter: { kind: "text" },
});
const noteColumn = column("note", "Note");

// Every handler is passed, as the spec's examples do, and returned so a test reads its calls
function fixture(props: Partial<DataTableProps<Item>> = {}) {
  const handlers = {
    onfilter: vi.fn(),
    onclearfilter: vi.fn(),
    onclearfilters: vi.fn(),
    onsort: vi.fn(),
  };
  const all: DataTableProps<Item> = {
    rows,
    columns: [nameColumn, noteColumn],
    getRowId: (row: Item) => row.id,
    caption: "Orders",
    regionLabel: "Orders table",
    ...handlers,
    ...props,
  };
  return { all, handlers };
}
function mount(props: Partial<DataTableProps<Item>> = {}) {
  const { all, handlers } = fixture(props);
  return { ...render(DataTable<Item>, all), ...handlers };
}

const header = (name: string): HTMLElement =>
  screen.getByRole("columnheader", { name: new RegExp(name) });

// @spec("FILT-29", "8587799c")
describe("FILT-29", () => {
  it("shows one button named Filter Name in the Name header cell", () => {
    mount();
    expect(
      within(header("Name")).getAllByRole("button", { name: "Filter Name" }),
    ).toHaveLength(1);
  });

  it("shows the sort button and the filter button in the header cell of a sortable, filtered column", () => {
    mount({ columns: [codeColumn] });
    const cell = header("Code");
    expect(within(cell).getAllByRole("button", { name: "Code" })).toHaveLength(
      1,
    );
    expect(
      within(cell).getAllByRole("button", { name: "Filter Code" }),
    ).toHaveLength(1);
  });

  it("shows no button starting with Filter in the Note header cell", () => {
    mount();
    expect(
      within(header("Note")).queryAllByRole("button", { name: /^Filter/ }),
    ).toEqual([]);
  });
});

const BETA = "Name: contains “Beta”";
// The badge buttons: each is named "Clear filter <its words>"
const badgeButtons = (): HTMLElement[] =>
  screen.queryAllByRole("button", { name: /^Clear filter/ });

// @spec("FILT-08", "a23f1fef")
describe("FILT-08", () => {
  it("shows one button with the words visible and the same words in its name for an applied text", () => {
    mount({
      columns: [nameColumn, statusColumn],
      filters: { name: { kind: "text", text: "Beta" } },
    });
    const [badge, ...others] = badgeButtons();
    expect(others).toEqual([]);
    expect(badge?.textContent).toBe(BETA);
    expect(badge?.getAttribute("aria-label")).toBe(`Clear filter ${BETA}`);
  });

  it.each<[string, Partial<DataTableProps<Item>>]>([
    ["a text that is empty", { filters: { name: { kind: "text", text: "" } } }],
    [
      "a text that is one space",
      { filters: { name: { kind: "text", text: " " } } },
    ],
    [
      "an empty selection",
      {
        columns: [statusColumn],
        filters: { status: { kind: "categorical", selected: [] } },
      },
    ],
    [
      "a fault of filters (the alert of RND-05)",
      {
        filters: {
          name: { kind: "text", text: "Beta" },
          zzz: { kind: "text", text: "x" },
        },
      },
    ],
  ])("shows no badge for %s", (_row, props) => {
    mount(props);
    expect(badgeButtons()).toEqual([]);
  });
});

const CLEAR_ALL = "Clear column filters";
const clearAll = (): HTMLElement[] =>
  screen.queryAllByRole("button", { name: CLEAR_ALL });

// @spec("FILT-10", "d4f0090f")
describe("FILT-10", () => {
  it.each<[string, Partial<DataTableProps<Item>>, number]>([
    ["no filter", { filters: {} }, 0],
    [
      "a text that is empty",
      { filters: { name: { kind: "text", text: "" } } },
      0,
    ],
    [
      "an applied text",
      { filters: { name: { kind: "text", text: "Beta" } } },
      1,
    ],
    [
      "a fault of filters (the alert of RND-05)",
      {
        filters: {
          name: { kind: "text", text: "Beta" },
          zzz: { kind: "text", text: "x" },
        },
      },
      0,
    ],
  ])(
    "with %s shows the button as often as the row says",
    (_row, props, shown) => {
      mount(props);
      expect(clearAll()).toHaveLength(shown);
    },
  );
});

const RESET = "Reset table";
const resetButtons = (): HTMLElement[] =>
  screen.queryAllByRole("button", { name: RESET });

// @spec("FILT-30", "a6569b8a")
describe("FILT-30", () => {
  const sortableCode = column("code", "Code", { sortable: ["asc", "desc"] });
  it.each<[string, Partial<DataTableProps<Item>>, number]>([
    [
      "Code sortable, no filter, onreset given",
      { columns: [sortableCode], onreset: vi.fn() },
      1,
    ],
    [
      "Code sortable and Note neither sortable nor with a filter, onreset given",
      { columns: [sortableCode, noteColumn], onreset: vi.fn() },
      1,
    ],
    [
      "Name with a filter, none sortable, onreset given",
      { columns: [nameColumn], onreset: vi.fn() },
      1,
    ],
    ["Code sortable, onreset not given", { columns: [sortableCode] }, 0],
    [
      "neither sortable nor with a filter, onreset given",
      { columns: [noteColumn], onreset: vi.fn() },
      0,
    ],
    [
      "Code sortable, onreset given, and a fault of filters (the alert of RND-05)",
      {
        columns: [sortableCode],
        onreset: vi.fn(),
        filters: { zzz: { kind: "text", text: "x" } },
      },
      1,
    ],
    [
      "Code sortable, onreset given, and a fault of the sort (the alert of RND-05)",
      {
        columns: [sortableCode],
        onreset: vi.fn(),
        sort: [{ id: "nope", direction: "asc" }],
      },
      1,
    ],
  ])(
    "with %s shows the button as often as the row says",
    (_row, props, shown) => {
      mount(props);
      expect(resetButtons()).toHaveLength(shown);
    },
  );

  it("shows no button while the alert is a fault of the columns, though onreset is given and a column is sortable", () => {
    mount({
      columns: [sortableCode, sortableCode],
      onreset: vi.fn(),
    });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(resetButtons()).toEqual([]);
  });
});

// @spec("FILT-33", "a156afc8")
describe("FILT-33", () => {
  // The six words of FILT-33 in another language, each shown by the statement of its row
  const foreign: Pick<
    DataTableMessages,
    | "filterButton"
    | "badgeText"
    | "badgeOptions"
    | "clearFilter"
    | "clearFilters"
    | "reset"
  > = {
    filterButton: (label) => `${label} filtern`,
    badgeText: ({ label, text }) => `${label} enthält „${text}“`,
    badgeOptions: ({ label, options }) => `${label}: ${options.join(" oder ")}`,
    clearFilter: (words) => `Entfernen: ${words}`,
    clearFilters: "Spaltenfilter löschen",
    reset: "Tabelle zurücksetzen",
  };
  const english = [
    "Filter Name",
    "Filter Status",
    "contains",
    "Clear filter",
    "Clear column filters",
    "Reset table",
  ];
  // The page's text and its accessible names (aria-label values)
  const page = (): string =>
    [
      document.body.textContent,
      ...[...document.body.querySelectorAll("*")].flatMap((element) =>
        [...element.attributes].map((attribute) => attribute.value),
      ),
    ].join("\n");

  it.each([
    ["filterButton", "Name filtern", "FILT-29"],
    ["filterButton", "Status filtern", "FILT-29"],
    ["badgeText and clearFilter", "Entfernen: Name enthält „Beta“", "FILT-08"],
    ["badgeOptions", "Entfernen: Status: Active oder Inactive", "FILT-22"],
    ["clearFilters", "Spaltenfilter löschen", "FILT-10"],
    ["reset", "Tabelle zurücksetzen", "FILT-30"],
  ])("shows the given %s word as the name %s (%s)", (_key, name) => {
    mount({
      columns: [nameColumn, statusColumn],
      filters: {
        name: { kind: "text", text: "Beta" },
        status: { kind: "categorical", selected: ["active", "inactive"] },
      },
      onreset: vi.fn(),
      messages: foreign,
    });
    expect(screen.getByRole("button", { name }).isConnected).toBe(true);
    for (const word of english) expect(page()).not.toContain(word);
  });
});

// @spec("FILT-31", "51ec3cfb")
describe("FILT-31", () => {
  // The buttons and the region in document order, up to the region: badges by their words, the rest by their text
  const order = (container: HTMLElement): string[] => {
    const found: string[] = [];
    for (const element of container.querySelectorAll(
      'button, [role="region"]',
    )) {
      if (element.getAttribute("role") === "region") {
        found.push("region");
        break;
      }
      found.push(element.textContent.trim());
    }
    return found;
  };
  const resettable = { onreset: vi.fn() };

  it.each<[string, Partial<DataTableProps<Item>>, string[]]>([
    [
      "Name's text and Status's selection",
      {
        columns: [nameColumn, statusColumn],
        filters: {
          name: { kind: "text", text: "Beta" },
          status: { kind: "categorical", selected: ["active"] },
        },
      },
      [BETA, "Status: Active", "Clear my criteria", CLEAR_ALL, RESET, "region"],
    ],
    [
      "no filter",
      { columns: [nameColumn], filters: {} },
      ["Clear my criteria", RESET, "region"],
    ],
    [
      "Status's entry first and Name's second",
      {
        columns: [nameColumn, statusColumn],
        filters: {
          status: { kind: "categorical", selected: ["active"] },
          name: { kind: "text", text: "Beta" },
        },
      },
      [BETA, "Status: Active", "Clear my criteria", CLEAR_ALL, RESET, "region"],
    ],
    [
      "a fault of filters (the alert of RND-05)",
      {
        columns: [nameColumn],
        filters: { zzz: { kind: "text", text: "x" } },
      },
      ["Clear my criteria", RESET],
    ],
    [
      "a fault of the columns (the alert of RND-05, no reset)",
      { columns: [nameColumn, nameColumn] },
      ["Clear my criteria"],
    ],
  ])(
    "with %s puts the controls in the order the row says",
    (_row, props, expected) => {
      const { container } = render(
        CriteriaTable,
        fixture({ ...props, ...resettable }).all,
      );
      expect(order(container)).toEqual(expected);
    },
  );
});

// @spec("FILT-26", "58072d25")
describe("FILT-26", () => {
  it("emits onreset once with no argument on a press, and calls neither onsort nor onclearfilters", async () => {
    const onreset = vi.fn();
    const { onsort, onclearfilters } = mount({
      columns: [codeColumn, nameColumn],
      sort: [{ id: "code", direction: "asc" }],
      filters: { name: { kind: "text", text: "Beta" } },
      onreset,
    });
    await fireEvent.click(screen.getByRole("button", { name: RESET }));
    expect(onreset.mock.calls).toEqual([[]]);
    expect(onsort).not.toHaveBeenCalled();
    expect(onclearfilters).not.toHaveBeenCalled();
  });
});

// @spec("FILT-25", "55955f9d")
describe("FILT-25", () => {
  it("emits onclearfilters once with no argument on a press, and calls no other handler", async () => {
    const { onclearfilters, onclearfilter, onfilter, onsort } = mount({
      columns: [nameColumn, statusColumn],
      filters: {
        name: { kind: "text", text: "Beta" },
        status: { kind: "categorical", selected: ["active"] },
      },
    });
    await fireEvent.click(screen.getByRole("button", { name: CLEAR_ALL }));
    expect(onclearfilters.mock.calls).toEqual([[]]);
    expect(onclearfilter).not.toHaveBeenCalled();
    expect(onfilter).not.toHaveBeenCalled();
    expect(onsort).not.toHaveBeenCalled();
  });
});

// @spec("FILT-09", "48cff703")
describe("FILT-09", () => {
  it("emits onclearfilter once with the column id on a badge press, and calls no other handler", async () => {
    const { onclearfilter, onfilter, onclearfilters, onsort } = mount({
      filters: { name: { kind: "text", text: "Beta" } },
    });
    await fireEvent.click(
      screen.getByRole("button", { name: `Clear filter ${BETA}` }),
    );
    expect(onclearfilter.mock.calls).toEqual([[{ id: "name" }]]);
    expect(onfilter).not.toHaveBeenCalled();
    expect(onclearfilters).not.toHaveBeenCalled();
    expect(onsort).not.toHaveBeenCalled();
  });

  it("emits the id of the badge pressed when several badges show", async () => {
    const { onclearfilter } = mount({
      columns: [nameColumn, statusColumn],
      filters: {
        name: { kind: "text", text: "Beta" },
        status: { kind: "categorical", selected: ["active"] },
      },
    });
    await fireEvent.click(
      screen.getByRole("button", { name: "Clear filter Status: Active" }),
    );
    expect(onclearfilter.mock.calls).toEqual([[{ id: "status" }]]);
  });
});

// @spec("FILT-22", "dcf9ee27")
describe("FILT-22", () => {
  const withEmptyOption = column("status", "Status", {
    filter: {
      kind: "categorical",
      emptyOption: true,
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
    },
  });
  it.each<[string, DataTableColumn<Item>, string[], string]>([
    [
      "in the options' order, not the selection's",
      statusColumn,
      ["inactive", "active"],
      "Status: Active, Inactive",
    ],
    [
      "with the empty option last",
      withEmptyOption,
      ["", "active"],
      "Status: Active, (empty)",
    ],
  ])("names the selected options by label %s", (_row, def, selected, text) => {
    mount({
      columns: [def],
      filters: { status: { kind: "categorical", selected } },
    });
    expect(badgeButtons().map((badge) => badge.textContent)).toEqual([text]);
  });

  it("names the empty option by the given emptyOption word", () => {
    mount({
      columns: [withEmptyOption],
      filters: { status: { kind: "categorical", selected: ["", "active"] } },
      messages: { emptyOption: "(leer)" },
    });
    expect(badgeButtons().map((badge) => badge.textContent)).toEqual([
      "Status: Active, (leer)",
    ]);
  });
});
