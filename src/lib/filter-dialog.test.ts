import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import DataTable from "./DataTable.svelte";
import type { DataTableColumn, DataTableProps } from "./types.ts";

interface Item {
  id: string;
  name: string;
}

// No marker: these are real-browser statements (site/browser/filter-dialog.spec.ts); these rows pin the dialog's markup
// in the simulated DOM, where red-check and the mutation step can see it. The simulated DOM hides every popover and
// never opens one, so a row finds the dialog by its attribute and never by role or name.
const columns: DataTableColumn<Item>[] = [
  {
    id: "name",
    label: "Name",
    value: ({ row }) => row.name,
    filter: { kind: "text" },
  },
  {
    id: "status",
    label: "Status",
    value: ({ row }) => row.name,
    filter: { kind: "categorical", options: [{ value: "a", label: "A" }] },
  },
];

function mount(extra: Partial<DataTableProps<Item>> = {}) {
  return render(DataTable<Item>, {
    rows: [{ id: "r1", name: "Alpha" }],
    columns,
    getRowId: ({ row }: { row: Item }) => row.id,
    caption: "Orders",
    regionLabel: "Orders table",
    onfilter: () => undefined,
    onclearfilter: () => undefined,
    onclearfilters: () => undefined,
    ...extra,
  });
}

describe("FILT-02, the dialog of each filter button in the simulated DOM", () => {
  it("follows its button, which names it, as a popover dialog", () => {
    const table = mount();
    const dialogs = table.container.querySelectorAll("[popover]");
    expect(dialogs).toHaveLength(2);
    ["Name", "Status"].forEach((label, index) => {
      const button = screen.getByRole("button", { name: `Filter ${label}` });
      const dialog = dialogs[index];
      expect(button.nextElementSibling).toBe(dialog);
      expect(button.getAttribute("popovertarget")).toBe(dialog?.id);
      expect(dialog?.id).not.toBe("");
      expect(dialog?.getAttribute("popover")).toBe("auto");
      expect(dialog?.getAttribute("role")).toBe("dialog");
      expect(dialog?.getAttribute("aria-label")).toBe(`${label} filter`);
    });
    expect(dialogs[0]?.id).not.toBe(dialogs[1]?.id);
  });

  it("is named by the filterDialog word", () => {
    const table = mount({
      messages: { filterDialog: (label) => `Choose ${label}` },
    });
    expect(
      table.container.querySelector("[popover]")?.getAttribute("aria-label"),
    ).toBe("Choose Name");
  });
});
