import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import DataTable from "./DataTable.svelte";
import type { DataTableProps } from "./types.ts";

interface Item {
  id: string;
  name: string;
}

const rows: Item[] = [{ id: "r1", name: "Alpha" }];

// A table of the spec's section 11 with the search given unless the test says otherwise
function props(extra: Partial<DataTableProps<Item>> = {}) {
  const all: DataTableProps<Item> = {
    rows,
    columns: [{ id: "name", label: "Name", value: ({ row }) => row.name }],
    getRowId: ({ row }: { row: Item }) => row.id,
    caption: "Orders",
    regionLabel: "Orders table",
    onsearch: vi.fn(),
    ...extra,
  };
  return all;
}

// @spec("FILT-40", "1c536137")
describe("FILT-40", () => {
  it("shows one field named Search with autocomplete off while onsearch is given", () => {
    render(DataTable<Item>, props());
    const fields = screen.getAllByRole("searchbox", { name: "Search" });
    expect(fields).toHaveLength(1);
    expect(fields[0]?.getAttribute("autocomplete")).toBe("off");
  });

  it("shows no field while onsearch is not given", () => {
    render(DataTable<Item>, props({ onsearch: undefined }));
    expect(screen.queryAllByRole("searchbox")).toEqual([]);
  });

  it("shows no field beside the alert of an invalid table", () => {
    render(DataTable<Item>, props({ columns: [] }));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryAllByRole("searchbox")).toEqual([]);
  });
});
