import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import {
  footprintProps,
  type FootprintRow,
  watchListeners,
} from "../../test/footprint.ts";
import DataTable from "./DataTable.svelte";
import type { DataTableColumn, DataTableSortEntry } from "./types.ts";

// In a test file of its own, as FOOT-02: the listeners are wrapped before the first mount in this document

const columns: DataTableColumn<FootprintRow>[] = ["Code", "Name", "Date"].map(
  (label) => ({
    id: label.toLowerCase(),
    label,
    value: (row) => row.name,
    sortable: ["asc", "desc"],
  }),
);

// @spec("SORT-24", "564f92e6")
describe("SORT-24", () => {
  it("holds no listener of its own on document or window through presses, a new order and unmount", async () => {
    try {
      const own = watchListeners();
      const onsort = vi.fn<(next: DataTableSortEntry[]) => void>();
      const props = (sort: DataTableSortEntry[]) => ({
        ...footprintProps(),
        columns,
        sort,
        onsort,
      });
      const { rerender, unmount } = render(
        DataTable<FootprintRow>,
        props([
          { id: "code", direction: "asc" },
          { id: "name", direction: "desc" },
        ]),
      );
      const button = () => screen.getByRole("button", { name: "Name" });
      await fireEvent.click(button());
      expect(own()).toEqual([]);
      await fireEvent.click(button(), { shiftKey: true });
      expect(own()).toEqual([]);
      await rerender(props([{ id: "name", direction: "asc" }]));
      expect(own()).toEqual([]);
      expect(onsort).toHaveBeenCalledTimes(2);
      unmount();
      expect(own()).toEqual([]);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
