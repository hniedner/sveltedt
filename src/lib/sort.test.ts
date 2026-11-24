import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { inProduction, useConsoleErrors } from "../../test/console-spy.ts";
import DataTable from "./DataTable.svelte";
import type {
  DataTableColumn,
  DataTableProps,
  DataTableSortEntry,
  SortDirection,
} from "./types.ts";

// The type of a column's sortable: at least one direction (SORT-15 rejects none at run time)
type Directions = NonNullable<DataTableColumn<Item>["sortable"]>;

interface Item {
  id: string;
  name: string;
  code: string;
  date: string;
}

const rows: Item[] = [
  { id: "r1", name: "Beta", code: "B-2", date: "2026-01-02" },
  { id: "r2", name: "Alpha", code: "A-1", date: "2026-01-01" },
];

// The spec's columns: Code, Name and Date, each allowing both directions unless a row says otherwise
function sortable(
  id: "code" | "name" | "date",
  label: string,
  directions: Directions = ["asc", "desc"],
): DataTableColumn<Item> {
  return { id, label, value: ({ row }) => row[id], sortable: directions };
}
const code = sortable("code", "Code");
const name = sortable("name", "Name");
const note: DataTableColumn<Item> = {
  id: "note",
  label: "Note",
  value: () => "",
};

// An order in the spec's notation, "code asc, name desc", lead first; "" is the empty order
function order(text: string): DataTableSortEntry[] {
  return text === ""
    ? []
    : text.split(", ").map((part) => {
        const [id = "", direction] = part.split(" ");
        return { id, direction: direction === "desc" ? "desc" : "asc" };
      });
}

const getRowId = ({ row }: { row: Item }): string => row.id;

// Mounts the table with Code and Name sortable and an onsort that records its calls and passes nothing back
function mountProps(
  onsort: DataTableProps<Item>["onsort"],
  props: Partial<DataTableProps<Item>>,
): DataTableProps<Item> {
  return {
    rows,
    columns: [code, name],
    getRowId,
    caption: "Orders",
    regionLabel: "Orders table",
    sort: [],
    onsort,
    ...props,
  };
}
function mount(props: Partial<DataTableProps<Item>> = {}) {
  const onsort = vi.fn<(next: DataTableSortEntry[]) => void>();
  const view = render(DataTable<Item>, mountProps(onsort, props));
  return { ...view, onsort };
}

const sortButton = (label: string): HTMLElement =>
  screen.getByRole("button", { name: label });

// @spec("SORT-10", "34feca0a")
describe("SORT-10", () => {
  it("shows one sort button in the header cell of the sortable column Name and none in Note's", () => {
    mount({ columns: [name, note] });
    const [nameHeader, noteHeader] = screen.getAllByRole("columnheader");
    const buttons = within(nameHeader).getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toBe(
      within(nameHeader).getByRole("button", { name: "Name" }),
    );
    expect(within(noteHeader).queryAllByRole("button")).toEqual([]);
  });
});
// @spec("SORT-28", "e83715a4")
describe("SORT-28", () => {
  const sentence = "Column names that are buttons sort the table.";
  const caption = (): HTMLElement =>
    screen.getByRole("table").querySelector("caption") as HTMLElement;

  it("holds the sentence in a class-less span after a space in the caption while a sort button is shown", () => {
    mount({ columns: [name, note] });
    expect(caption().textContent).toBe(`Orders ${sentence}`);
    const span = caption().querySelector("span") as HTMLElement;
    expect(span.textContent).toBe(sentence);
    expect(span.hasAttribute("class")).toBe(false);
    expect(screen.getByRole("table", { name: `Orders ${sentence}` })).toBe(
      screen.getByRole("table"),
    );
  });

  it("holds no sentence while no sort button is shown", () => {
    mount({ columns: [note], onsort: undefined });
    expect(caption().textContent).toBe("Orders");
    expect(caption().querySelector("span")).toBeNull();
    expect(screen.getByRole("table", { name: "Orders" })).toBe(
      screen.getByRole("table"),
    );
  });

  it("shows the given sortableHint instead", () => {
    mount({
      messages: {
        sortableHint: "Spaltenköpfe mit Schaltflächen sind sortierbar.",
      },
    });
    expect(caption().textContent).toBe(
      "Orders Spaltenköpfe mit Schaltflächen sind sortierbar.",
    );
  });
});
// @spec("SORT-01", "83f710c0")
describe("SORT-01", () => {
  it.each([
    ["", "name asc"],
    ["name asc", "name desc"],
    ["name desc", ""],
    ["code asc", "name asc"],
    ["code asc, name desc", "name asc"],
    ["name asc, code desc", "name desc"],
  ])(
    "a press on Name with the order [%s] emits [%s] once",
    async (before, after) => {
      const { onsort } = mount({ sort: order(before) });
      await fireEvent.click(sortButton("Name"));
      expect(onsort.mock.calls).toEqual([[order(after)]]);
    },
  );

  it.each([
    ["", "date desc"],
    ["date desc", "date asc"],
    ["date asc", ""],
  ])(
    "a press on Date, listing ['desc', 'asc'], with the order [%s] emits [%s] once",
    async (before, after) => {
      const { onsort } = mount({
        columns: [code, name, sortable("date", "Date", ["desc", "asc"])],
        sort: order(before),
      });
      await fireEvent.click(sortButton("Date"));
      expect(onsort.mock.calls).toEqual([[order(after)]]);
    },
  );

  it("a press on Name with the order null (counts as []) emits [name asc] once", async () => {
    const { onsort } = mount({ sort: null });
    await fireEvent.click(sortButton("Name"));
    expect(onsort.mock.calls).toEqual([[order("name asc")]]);
  });
});
// SORT-02's Shift+click rows. Its Shift+Enter and Shift+Space rows are in site/browser/sort.spec.ts (a real browser).
describe("SORT-02, Shift+click rows", () => {
  it.each([
    ["code asc", "code asc, name asc"],
    ["code asc, name asc", "code asc, name desc"],
    ["code asc, name desc", "code asc"],
    ["name asc, code asc", "name desc, code asc"],
    ["name desc, code asc", "code asc"],
    ["", "name asc"],
  ])(
    "a Shift+click on Name with the order [%s] emits [%s] once",
    async (before, after) => {
      const { onsort } = mount({ sort: order(before) });
      await fireEvent.click(sortButton("Name"), { shiftKey: true });
      expect(onsort.mock.calls).toEqual([[order(after)]]);
    },
  );

  it("a Shift+click on Date, listing ['desc', 'asc'], with the order [code asc] emits [code asc, date desc] once", async () => {
    const { onsort } = mount({
      columns: [code, name, sortable("date", "Date", ["desc", "asc"])],
      sort: order("code asc"),
    });
    await fireEvent.click(sortButton("Date"), { shiftKey: true });
    expect(onsort.mock.calls).toEqual([[order("code asc, date desc")]]);
  });
});
// What Firefox does for Shift+Enter and Shift+Space: a keydown with Shift, then a click with no pointer (detail 0)
// and no shiftKey. The order is [code asc]: with Shift Name joins it, without Shift Name replaces it.
// @spec("SORT-02", "71005ae9")
describe("SORT-02, key-click rows", () => {
  const withShift = [order("code asc, name asc")];
  const withoutShift = [order("name asc")];
  const keyDown = (key: string) =>
    fireEvent.keyDown(sortButton("Name"), { key, shiftKey: true });
  const keyClick = () => fireEvent.click(sortButton("Name"), { detail: 0 });
  it.each(["Enter", " "])(
    "a Shift keydown of %j then a click with no pointer emits the Shift order",
    async (key) => {
      const { onsort } = mount({ sort: order("code asc") });
      await keyDown(key);
      await keyClick();
      expect(onsort.mock.calls).toEqual([withShift]);
    },
  );
  // What Chromium and WebKit do when Shift goes down after the Space keydown: Space's click carries shiftKey
  it.each(["Enter", " "])(
    "a keydown of %j without Shift, Shift down, then a click with no pointer carrying Shift emits without Shift",
    async (key) => {
      const { onsort } = mount({ sort: order("code asc") });
      await fireEvent.keyDown(sortButton("Name"), { key });
      await fireEvent.keyDown(sortButton("Name"), {
        key: "Shift",
        shiftKey: true,
      });
      await fireEvent.click(sortButton("Name"), { detail: 0, shiftKey: true });
      expect(onsort.mock.calls).toEqual([withoutShift]);
    },
  );
  it("a Shift keydown of another key then a click with no pointer emits without Shift", async () => {
    const { onsort } = mount({ sort: order("code asc") });
    await keyDown("a");
    await keyClick();
    expect(onsort.mock.calls).toEqual([withoutShift]);
  });
  it("a Shift+Enter keydown, a blur, then a click with no pointer emits without Shift", async () => {
    const { onsort } = mount({ sort: order("code asc") });
    await keyDown("Enter");
    await fireEvent.blur(sortButton("Name"));
    await keyClick();
    expect(onsort.mock.calls).toEqual([withoutShift]);
  });
  it("a Shift+Enter keydown and its click, then a second click with no pointer, emits the second without Shift", async () => {
    const { onsort } = mount({ sort: order("code asc") });
    await keyDown("Enter");
    await keyClick();
    await keyClick();
    expect(onsort.mock.calls).toEqual([withShift, withoutShift]);
  });
  it("a Shift+Enter keydown then a pointer click (detail 1, no Shift) emits without Shift", async () => {
    const { onsort } = mount({ sort: order("code asc") });
    await keyDown("Enter");
    await fireEvent.click(sortButton("Name"), { detail: 1 });
    expect(onsort.mock.calls).toEqual([withoutShift]);
  });
});
// SORT-03's click row. Its Enter and Space rows are in site/browser/sort.spec.ts (a real browser), so the statement
// carries no marker here.
describe("SORT-03, click row", () => {
  it("one click on Name with the order [] emits exactly one onsort", async () => {
    const { onsort } = mount();
    await fireEvent.click(sortButton("Name"));
    expect(onsort).toHaveBeenCalledTimes(1);
  });
});
// @spec("SORT-04", "a2edd1fa")
describe("SORT-04", () => {
  it.each<[Directions, string, boolean, string]>([
    [["desc"], "", false, "date desc"],
    [["desc"], "date desc", false, ""],
    [["desc"], "code asc", true, "code asc, date desc"],
    [["asc"], "date asc", false, ""],
    [["asc"], "code asc, date asc", true, "code asc"],
  ])(
    "Date allowing %j, order [%s], Shift %s: emits [%s]",
    async (directions, before, shiftKey, after) => {
      const { onsort } = mount({
        columns: [code, sortable("date", "Date", directions)],
        sort: order(before),
      });
      await fireEvent.click(sortButton("Date"), { shiftKey });
      expect(onsort.mock.calls).toEqual([[order(after)]]);
    },
  );
});
// @spec("SORT-12", "e17aab59")
describe("SORT-12", () => {
  it.each([
    ["", "Name", false],
    ["name asc", "Code", true],
  ])(
    "with the order [%s], a press on %s (Shift %s) changes nothing shown",
    async (before, label, shiftKey) => {
      const { container, onsort } = mount({ sort: order(before) });
      const shown = container.innerHTML;
      await fireEvent.click(sortButton(label), { shiftKey });
      expect(onsort).toHaveBeenCalledTimes(1);
      expect(container.innerHTML).toBe(shown);
    },
  );
});
// @spec("SORT-14", "0b194844")
describe("SORT-14", () => {
  it("renders the rows in the order given while sort is [name asc]", () => {
    mount({
      columns: [name],
      rows: [
        { id: "r3", name: "Gamma", code: "", date: "" },
        { id: "r1", name: "Alpha", code: "", date: "" },
        { id: "r2", name: "Beta", code: "", date: "" },
      ],
      sort: order("name asc"),
    });
    expect(
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent.trim()),
    ).toEqual(["Gamma", "Alpha", "Beta"]);
  });
});
// @spec("A11Y-03", "dcf0b4e7")
describe("A11Y-03", () => {
  it.each([
    ["code asc, name desc", "ascending", null],
    ["name desc", null, "descending"],
    ["", null, null],
  ])(
    "with the order [%s], Code's aria-sort is %s and Name's %s",
    (before, codeSort, nameSort) => {
      mount({ sort: order(before) });
      expect(
        screen
          .getAllByRole("columnheader")
          .map((header) => header.getAttribute("aria-sort")),
      ).toEqual([codeSort, nameSort]);
    },
  );
});
// @spec("SORT-09", "f47e537e")
describe("SORT-09", () => {
  it.each(["", "name asc", "code asc, name desc"])(
    "names the Name button by its label alone, with no aria-label, with the order [%s]",
    (before) => {
      mount({ sort: order(before) });
      const header = screen.getAllByRole("columnheader")[1];
      const button = within(header).getByRole("button", { name: "Name" });
      expect(button).toBe(within(header).getByRole("button"));
      expect(button.hasAttribute("aria-label")).toBe(false);
    },
  );
});
// The hidden content of a header cell: the text, and every attribute except class and style of SVG elements, inside
// its aria-hidden elements, without the rank of SORT-05
function hiddenContent(header: Element, rank: string | null): string[] {
  return [...header.querySelectorAll('[aria-hidden="true"]')].flatMap(
    (element) => [
      ...(element.textContent === rank ? [] : [element.textContent]),
      ...[...element.querySelectorAll("svg, svg *")].flatMap((svg) =>
        [...svg.attributes]
          .filter(({ name }) => name !== "class" && name !== "style")
          .map(({ name, value }) => `${name}=${value}`),
      ),
    ],
  );
}

// @spec("SORT-13", "9454f958")
describe("SORT-13", () => {
  it.each([
    ["name asc", "name desc", null],
    ["code asc, name desc", "code asc, name asc", "2"],
  ])(
    "Name's hidden content differs between [%s] and [%s]",
    async (first, second, rank) => {
      const { rerender } = mount({ sort: order(first) });
      const header = (): Element => screen.getAllByRole("columnheader")[1];
      const before = hiddenContent(header(), rank);
      await rerender({ sort: order(second) });
      const after = hiddenContent(header(), rank);
      // Present in both: some text or drawing, not only an empty element
      expect(before.join("")).not.toBe("");
      expect(after.join("")).not.toBe("");
      expect(after).not.toEqual(before);
    },
  );
  it.each([
    ["name asc", "▲"],
    ["name desc", "▼"],
  ])("shows the mark of [%s] as %s", (sorted, mark) => {
    mount({ sort: order(sorted) });
    expect(hiddenContent(screen.getAllByRole("columnheader")[1], null)).toEqual(
      [mark],
    );
  });
});
// The rank marks of each header: digits inside its aria-hidden elements, top to bottom
const ranks = (): string[][] =>
  screen
    .getAllByRole("columnheader")
    .map((header) =>
      [...header.querySelectorAll('[aria-hidden="true"]')]
        .map((element) => element.textContent)
        .filter((text) => /^\d+$/.test(text)),
    );

// @spec("SORT-05", "a6a7074f")
describe("SORT-05", () => {
  it("shows nothing but the arrow in the header of a lone sorted column", () => {
    mount({ sort: order("name desc") });
    expect(
      screen
        .getAllByRole("columnheader")[1]
        ?.querySelectorAll('[aria-hidden="true"]'),
    ).toHaveLength(1);
  });

  it.each([
    ["code asc, name desc", [["1"], ["2"], []]],
    ["name desc", [[], [], []]],
    ["date asc, code asc, name asc", [["2"], ["3"], ["1"]]],
  ])("with the order [%s] shows the ranks %j, hidden", (before, expected) => {
    mount({
      columns: [code, name, sortable("date", "Date")],
      sort: order(before),
    });
    expect(ranks()).toEqual(expected);
  });
});
const HINT =
  "Shift+click, Shift+Enter or Shift+Space adds this column to the sort.";

// @spec("SORT-06", "9e99f312")
describe("SORT-06", () => {
  it.each([
    ["name asc", `sorted ascending. ${HINT}`],
    ["name desc, code asc", `sorted descending, priority 1. ${HINT}`],
    ["code asc, date asc, name desc", `sorted descending, priority 3. ${HINT}`],
    ["code asc", HINT],
  ])("with the order [%s], the Name button is described %j", (before, text) => {
    mount({
      columns: [code, sortable("date", "Date"), name],
      sort: order(before),
    });
    expect(
      screen.getByRole("button", { name: "Name", description: text })
        .isConnected,
    ).toBe(true);
  });
});
// The alert of RND-05 is one fixed text; SORT-15's cause is the console line of RND-17: its code and its text in
// development
const FIXED = "This table cannot be shown.";
const errors = useConsoleErrors();
const line = (code: keyof typeof SORT_ALERTS): string =>
  `SvelteDT: ${code}: ${SORT_ALERTS[code]}`;
const SORT_ALERTS = {
  sortableInvalid: "A column's sort directions are invalid.",
  sortHandlerMissing: "A sortable column has no sort handler.",
  sortInvalid: "The sort is not valid.",
  sortColumnUnknown: "The sort names an unknown column.",
  sortColumnNotSortable: "The sort names a column that cannot be sorted.",
  sortDirectionNotAllowed: "The sort uses a direction a column does not allow.",
  sortColumnDuplicate: "The sort names a column twice.",
};

// Props that raise each message of SORT-15's alert
const sortFaults: [keyof typeof SORT_ALERTS, Partial<DataTableProps<Item>>][] =
  [
    [
      "sortableInvalid",
      { columns: [sortable("name", "Name", [] as unknown as Directions)] },
    ],
    [
      "sortableInvalid",
      { columns: [sortable("name", "Name", ["asc", "asc"])] },
    ],
    [
      "sortableInvalid",
      {
        columns: [sortable("name", "Name", ["up"] as unknown as Directions)],
      },
    ],
    ["sortHandlerMissing", { onsort: undefined }],
    ["sortInvalid", { sort: [null] as unknown as DataTableSortEntry[] }],
    ["sortColumnUnknown", { sort: order("zzz asc") }],
    [
      "sortColumnNotSortable",
      { columns: [code, note], sort: order("note asc") },
    ],
    [
      "sortDirectionNotAllowed",
      {
        columns: [sortable("date", "Date", ["desc"])],
        sort: order("date asc"),
      },
    ],
    ["sortColumnDuplicate", { sort: order("name asc, name desc") }],
  ];

// A column's sortable with no direction is a type error, as well as SORT-15's alert at run time
expectTypeOf<readonly []>().not.toExtend<Directions>();
// @spec("SORT-15", "c4bf5485")
describe("SORT-15", () => {
  it.each(sortFaults)(
    "shows only the fixed alert, no table, and logs the code %s",
    (key, props) => {
      const { container } = mount(props);
      expect(
        screen.getAllByRole("alert").map((alert) => alert.textContent),
      ).toEqual([FIXED]);
      expect(container.querySelector("table")).toBeNull();
      expect(errors()).toEqual([line(key)]);
    },
  );

  it.each<[string, Partial<DataTableProps<Item>>, keyof typeof SORT_ALERTS]>([
    [
      "a sortable column with no direction and no onsort",
      {
        columns: [sortable("name", "Name", [] as unknown as Directions)],
        onsort: undefined,
      },
      "sortableInvalid",
    ],
    [
      "no onsort and a sort naming an unknown column",
      { onsort: undefined, sort: order("zzz asc") },
      "sortHandlerMissing",
    ],
    [
      "a sort naming a column that cannot be sorted, then an unknown one",
      { columns: [code, note], sort: order("note asc, zzz asc") },
      "sortColumnUnknown",
    ],
    [
      "a sort naming a column twice, the second time in a direction it does not allow",
      {
        columns: [sortable("date", "Date", ["desc"])],
        sort: order("date desc, date asc"),
      },
      "sortDirectionNotAllowed",
    ],
    [
      "no onsort and a sort that is the text name",
      { onsort: undefined, sort: "name" as unknown as DataTableSortEntry[] },
      "sortHandlerMissing",
    ],
    [
      "a sort entry whose id is the number 5",
      {
        sort: [{ id: 5, direction: "desc" }] as unknown as DataTableSortEntry[],
      },
      "sortInvalid",
    ],
  ])("lets the first row that applies win: %s", (_faults, props, key) => {
    mount(props);
    expect(screen.getByRole("alert").textContent).toBe(FIXED);
    expect(errors()).toEqual([line(key)]);
  });

  // A caller the type does not reach (plain JavaScript, untyped state) passes these
  it.each<[string, unknown]>([
    ["not an array", "name"],
    ["not an array", { id: "name", direction: "asc" }],
    ["an entry that is null", [null]],
    ["an entry that is an array", [["name"]]],
    ["an entry that is not an object", ["name"]],
    ["an entry's id left out", [{ direction: "asc" }]],
    ["an entry's id not a string", [{ id: 5, direction: "asc" }]],
    ["an entry's id null", [{ id: null, direction: "asc" }]],
    ["an entry's direction left out", [{ id: "name" }]],
    ["an entry's direction undefined", [{ id: "name", direction: undefined }]],
    ["an entry's direction null", [{ id: "name", direction: null }]],
    ["an entry's direction 'up'", [{ id: "name", direction: "up" }]],
    ["an entry's direction 'ASC'", [{ id: "name", direction: "ASC" }]],
    ["an entry with the old boolean desc", [{ id: "name", desc: false }]],
  ])(
    "shows only the fixed alert, no table, and logs sortInvalid, for %s: %j",
    (_row, sort) => {
      const { container } = mount({ sort: sort as DataTableSortEntry[] });
      expect(
        screen.getAllByRole("alert").map((alert) => alert.textContent),
      ).toEqual([FIXED]);
      expect(container.querySelector("table")).toBeNull();
      expect(errors()).toEqual([line("sortInvalid")]);
    },
  );

  // RND-17's production rows for SORT-15's table: the code alone, a test-side mock of esm-env's DEV
  it.each(sortFaults)(
    "writes only the code %s in production",
    async (key, props) => {
      await inProduction(async () => {
        const { render: renderAgain, cleanup } =
          await import("@testing-library/svelte");
        const { default: Table } = await import("./DataTable.svelte");
        renderAgain(Table<Item>, mountProps(vi.fn(), props));
        cleanup();
      });
      expect(errors()).toEqual([`SvelteDT: ${key}`]);
    },
  );

  it.each([undefined, null])(
    "takes sort given as %s as no order and no fault",
    (sort) => {
      mount({ sort: sort as unknown as DataTableSortEntry[] });
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("table").isConnected).toBe(true);
    },
  );

  it("takes a column's sortable given as null as not sortable, and no fault", () => {
    mount({
      columns: [
        code,
        { ...name, sortable: null } as unknown as DataTableColumn<Item>,
      ],
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Name" })).toBeNull();
    expect(sortButton("Code").isConnected).toBe(true);
  });

  it("lets a fault of RND-05's table win: an empty caption and an unknown sort column", () => {
    mount({ caption: "", sort: order("zzz asc") });
    expect(screen.getByRole("alert").textContent).toBe(FIXED);
    expect(errors()).toEqual([
      "SvelteDT: captionEmpty: Table caption must not be empty.",
    ]);
  });
});
// @spec("SORT-16", "79a0cfe2")
describe("SORT-16", () => {
  it.each<[Partial<DataTableProps<Item>>, keyof typeof SORT_ALERTS, string[]]>([
    [{ sort: order("col-z3 asc") }, "sortColumnUnknown", ["col-z3"]],
    [
      {
        columns: [{ ...name, id: "col-w4", label: "Secret-5" }],
        sort: order("col-w4 asc, col-w4 desc"),
      },
      "sortColumnDuplicate",
      ["col-w4", "Secret-5"],
    ],
  ])(
    "keeps the sort's values out of the alert and the console line %#",
    (props, code, words) => {
      mount(props);
      const texts = [screen.getByRole("alert").textContent, ...errors()];
      expect(texts).toEqual([FIXED, line(code)]);
      for (const word of words)
        for (const text of texts) expect(text).not.toContain(word);
    },
  );
});
// Non-English sort words for SORT-17 and the texts SORT-23 passes through them
function sortWords(text?: string) {
  return {
    sortableHint: text ?? "Spaltenköpfe mit Schaltflächen sind sortierbar.",
    sortRank: (rank: number) => text ?? `Nr ${rank}`,
    sortDescription: ({
      direction,
      rank,
    }: {
      direction: SortDirection | null;
      rank: number | null;
    }) => text ?? `Richtung ${direction ?? "keine"}, Rang ${rank ?? "keiner"}`,
  };
}

// @spec("SORT-17", "7d8220b7")
describe("SORT-17", () => {
  const english = [
    "Column names that are buttons",
    "sorted ascending",
    "sorted descending",
    "priority",
    HINT,
  ];
  // The page's text, accessible names and descriptions (aria-label values and the hidden description elements)
  const page = (): string =>
    [
      document.body.textContent,
      ...[...document.body.querySelectorAll("*")].flatMap((element) =>
        [...element.attributes].map((attribute) => attribute.value),
      ),
    ].join("\n");

  it.each([
    [
      "sortableHint",
      "",
      "the caption",
      () => screen.getByText("Spaltenköpfe mit Schaltflächen sind sortierbar."),
    ],
    [
      "sortRank",
      "code asc, name desc",
      "the rank mark",
      () => screen.getByText("Nr 2"),
    ],
    [
      "sortDescription",
      "name desc, code asc",
      "the description",
      () =>
        screen.getByRole("button", {
          name: "Name",
          description: "Richtung desc, Rang 1",
        }),
    ],
  ])(
    "shows the given %s word with the order [%s] in %s, and no English default",
    (_word, before, _where, find) => {
      mount({ sort: order(before), messages: sortWords() });
      expect(find().isConnected).toBe(true);
      for (const word of english) expect(page()).not.toContain(word);
    },
  );
});
// @spec("SORT-23", "235aef4e")
describe("SORT-23", () => {
  const texts = ["<img src=x onerror=alert(1)>", "<none>"];

  it.each(texts)(
    "renders the sort words %s as text, never as markup",
    (text) => {
      const { container } = mount({
        sort: order("code asc, name desc"),
        messages: sortWords(text),
      });
      expect(screen.getAllByRole("button", { description: text })).toHaveLength(
        2,
      );
      // The caption's hint is its own span
      expect(container.querySelector("caption span")?.textContent).toBe(text);
      expect(container.querySelector("img, none")).toBeNull();
    },
  );
});
