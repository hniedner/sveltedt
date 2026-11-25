// @vitest-environment node
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import { useConsoleErrors } from "../../test/console-spy.ts";
import DataTable from "./DataTable.svelte";
import type { DataTableColumn, DataTableProps } from "./types.ts";

interface Item {
  id: string;
}

const errors = useConsoleErrors();

// @spec("RND-17", "048e2060")
describe("RND-17", () => {
  it("writes no console line when the table with invalid input is rendered on the server", () => {
    const { body } = render(DataTable<Item>, {
      props: {
        rows: [],
        columns: [],
        getRowId: ({ row }: { row: Item }): string => row.id,
        caption: "Orders",
        regionLabel: "Orders table",
      },
    });
    expect(body).toContain("This table cannot be shown.");
    expect(errors()).toEqual([]);
  });
});

// No marker: STATE-15 is a real-browser statement (site/browser/slow-load.spec.ts); this row pins in the server render
// the class that keeps the status line's room, which a table that loads must have from its first byte
describe("STATE-15, the status line's class in the server render", () => {
  const html = (props: Partial<DataTableProps<Item>>): string =>
    render(DataTable<Item>, {
      props: {
        rows: [],
        columns: [
          { id: "id", label: "Id", value: ({ row }) => row.id },
        ] satisfies DataTableColumn<Item>[],
        getRowId: ({ row }: { row: Item }): string => row.id,
        caption: "Orders",
        regionLabel: "Orders table",
        ...props,
      },
    }).body;

  it("holds the class in the server render of a loading table and not of a table that never loads", () => {
    expect(html({ status: "loading" })).toContain('class="sdt-status"');
    expect(html({ status: "ready", busy: true })).toContain(
      'class="sdt-status"',
    );
    expect(html({ status: "ready" })).not.toContain("sdt-status");
    expect(errors()).toEqual([]);
  });
});

// No marker: the search field is a component-layer statement (FILT-40, FILT-44); this row pins in the server render
// that the field is there from the first byte and shows the applied search, since the server never runs an effect
// (PRD-B2, record 004)
describe("The search field in the server render", () => {
  it("shows the field with the applied search and writes no console line", () => {
    const { body } = render(DataTable<Item>, {
      props: {
        rows: [],
        columns: [
          { id: "id", label: "Id", value: ({ row }) => row.id },
        ] satisfies DataTableColumn<Item>[],
        getRowId: ({ row }: { row: Item }): string => row.id,
        caption: "Orders",
        regionLabel: "Orders table",
        onsearch: () => undefined,
        search: "beta",
      },
    });
    expect(body).toContain('type="search"');
    expect(body).toContain('value="beta"');
    expect(errors()).toEqual([]);
  });
});
