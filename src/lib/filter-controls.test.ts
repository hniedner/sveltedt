import { render, screen, within } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import DataTable from "./DataTable.svelte";
import type { DataTableColumn, DataTableProps } from "./types.ts";

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
// The spec's columns of section 11: Name (text filter), Code (sortable, text filter), Status (categorical) and Note
function column(
  id: Field,
  label: string,
  extra: Partial<DataTableColumn<Item>> = {},
): DataTableColumn<Item> {
  return { id, label, value: (row) => row[id], ...extra };
}
const nameColumn = column("name", "Name", { filter: { kind: "text" } });
const noteColumn = column("note", "Note");

// Every handler is passed, as the spec's examples do, and returned so a test reads its calls
function mount(props: Partial<DataTableProps<Item>> = {}) {
  const handlers = {
    onfilter: vi.fn(),
    onclearfilter: vi.fn(),
    onclearfilters: vi.fn(),
    onsort: vi.fn(),
  };
  const view = render(DataTable<Item>, {
    rows,
    columns: [nameColumn, noteColumn],
    getRowId: (row: Item) => row.id,
    caption: "Orders",
    regionLabel: "Orders table",
    ...handlers,
    ...props,
  });
  return { ...view, ...handlers };
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

  it("shows no button starting with Filter in the Note header cell", () => {
    mount();
    expect(
      within(header("Note")).queryAllByRole("button", { name: /^Filter/ }),
    ).toEqual([]);
  });
});
