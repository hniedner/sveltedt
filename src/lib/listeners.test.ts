import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import {
  footprintProps,
  footprintStates,
  type FootprintRow,
  watchListeners,
} from "../../test/footprint.ts";
import DataTable from "./DataTable.svelte";

// @spec("FOOT-02", "97327221")
describe("FOOT-02", () => {
  it("holds no listener of its own on document or window while mounted or after unmount", async () => {
    try {
      const own = watchListeners();
      const { rerender, unmount } = render(
        DataTable<FootprintRow>,
        footprintProps(),
      );
      for (const props of footprintStates) {
        await rerender(footprintProps(props));
        expect(own()).toEqual([]);
      }
      unmount();
      expect(own()).toEqual([]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("holds no listener of its own for the search field, in use or after unmount", async () => {
    try {
      const own = watchListeners();
      const { unmount } = render(
        DataTable<FootprintRow>,
        footprintProps({ onsearch: vi.fn(), searchOnEnter: true }),
      );
      const field = screen.getByRole("searchbox");
      await fireEvent.input(field, { target: { value: "beta" } });
      await fireEvent.keyDown(field, { key: "Enter" });
      expect(own()).toEqual([]);
      unmount();
      expect(own()).toEqual([]);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
