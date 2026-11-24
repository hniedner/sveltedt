// @vitest-environment node
import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";
import DataTable from "./DataTable.svelte";

interface Item {
  id: string;
}

// @spec("RND-17", "048e2060")
describe("RND-17", () => {
  it("writes no console line when the table with invalid input is rendered on the server", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { body } = render(DataTable<Item>, {
        props: {
          rows: [],
          columns: [],
          getRowId: (row: Item): string => row.id,
          caption: "Orders",
          regionLabel: "Orders table",
        },
      });
      expect(body).toContain("This table cannot be shown.");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
