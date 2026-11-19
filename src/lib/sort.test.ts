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
