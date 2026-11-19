import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import DataTable from "./DataTable.svelte";
import type {
  DataTableColumn,
  DataTableProps,
  DataTableSortEntry,
  SortDirection,
} from "./types.ts";

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
  directions: readonly SortDirection[] = ["asc", "desc"],
): DataTableColumn<Item> {
  return { id, label, value: (row) => row[id], sortable: directions };
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
        return { id, desc: direction === "desc" };
      });
}

const getRowId = (row: Item): string => row.id;

// Mounts the table with Code and Name sortable and an onsort that records its calls and passes nothing back
function mount(props: Partial<DataTableProps<Item>> = {}) {
  const onsort = vi.fn<(next: DataTableSortEntry[]) => void>();
  const view = render(DataTable<Item>, {
    rows,
    columns: [code, name],
    getRowId,
    caption: "Orders",
    regionLabel: "Orders table",
    sort: [],
    onsort,
    ...props,
  });
  return { ...view, onsort };
}

const sortButton = (label: string): HTMLElement =>
  screen.getByRole("button", { name: `Sort by ${label}` });

// @spec("SORT-10", "4d6c171d")
describe("SORT-10", () => {
  it("shows one sort button in the header cell of the sortable column Name and none in Note's", () => {
    mount({ columns: [name, note] });
    const [nameHeader, noteHeader] = screen.getAllByRole("columnheader");
    expect(
      within(nameHeader)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Sort by Name"]);
    expect(within(noteHeader).queryAllByRole("button")).toEqual([]);
  });
});
// @spec("SORT-01", "792165c5")
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
});
// SORT-02's Shift+click rows. Its Shift+Enter and Shift+Space rows are owed to the real-browser sort step, so the
// statement carries no marker until then.
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
});
// SORT-03's click row. Its Enter and Space rows are owed to the real-browser sort step, so the statement carries no
// marker until then.
describe("SORT-03, click row", () => {
  it("one click on Name with the order [] emits exactly one onsort", async () => {
    const { onsort } = mount();
    await fireEvent.click(sortButton("Name"));
    expect(onsort).toHaveBeenCalledTimes(1);
  });
});
// @spec("SORT-04", "6386c5a1")
describe("SORT-04", () => {
  it.each<[SortDirection[], string, boolean, string]>([
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
// @spec("SORT-09", "5ad95b87")
describe("SORT-09", () => {
  it.each(["", "name asc", "code asc, name desc"])(
    "names the Name button 'Sort by Name' with the order [%s]",
    (before) => {
      mount({ sort: order(before) });
      expect(
        within(screen.getAllByRole("columnheader")[1])
          .getByRole("button")
          .getAttribute("aria-label"),
      ).toBe("Sort by Name");
      expect(sortButton("Name").isConnected).toBe(true);
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

// @spec("SORT-13", "ee42c8ce")
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
      expect(before).not.toEqual([]);
      expect(after).not.toEqual([]);
      expect(after).not.toEqual(before);
    },
  );
});
