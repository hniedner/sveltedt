import { fireEvent, render, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    filter: {
      kind: "categorical",
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
    },
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
      const button = within(table.container).getByRole("button", {
        name: `Filter ${label}`,
      });
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

// What a browser sends just before it shows or hides a popover: the simulated DOM never does
async function toggle(
  table: { container: HTMLElement },
  index: number,
  to: string,
) {
  const dialog = table.container.querySelectorAll("[popover]")[index];
  if (!dialog) throw new Error(`no dialog ${index}`);
  dialog.dispatchEvent(
    Object.assign(new Event("beforetoggle"), { newState: to }),
  );
  await tick();
}
const fieldOf = (table: { container: HTMLElement }) =>
  table.container.querySelector<HTMLInputElement>(
    '[popover] input[type="search"]',
  );

describe("FILT-01, a text filter's field in the simulated DOM", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("exists only while the dialog is open", async () => {
    const table = mount();
    expect(fieldOf(table)).toBeNull();
    await toggle(table, 0, "open");
    expect(fieldOf(table)).not.toBeNull();
    await toggle(table, 0, "closed");
    expect(fieldOf(table)).toBeNull();
  });

  it("is labelled by the filterText word", async () => {
    const table = mount();
    await toggle(table, 0, "open");
    expect(within(table.container).getByLabelText("Filter Name text")).toBe(
      fieldOf(table),
    );
    const own = mount({ messages: { filterText: (label) => `Find ${label}` } });
    await toggle(own, 0, "open");
    expect(within(own.container).getByLabelText("Find Name")).toBe(
      fieldOf(own),
    );
  });

  it("emits the column's id and the typed text after the pause", async () => {
    const onfilter = vi.fn();
    const table = mount({ onfilter });
    await toggle(table, 0, "open");
    await fireEvent.input(fieldOf(table) as HTMLElement, {
      target: { value: "beta" },
    });
    await vi.advanceTimersByTimeAsync(399);
    expect(onfilter).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onfilter.mock.calls).toEqual([
      [{ id: "name", state: { kind: "text", text: "beta" } }],
    ]);
  });

  it("shows the applied text of its own column only", async () => {
    const table = mount({
      filters: {
        status: { kind: "categorical", selected: ["active"] },
        name: { kind: "text", text: "beta" },
      },
    });
    await toggle(table, 0, "open");
    expect(fieldOf(table)?.value).toBe("beta");
  });

  it("is empty while its column has no applied text", async () => {
    const none = mount();
    await toggle(none, 0, "open");
    expect(fieldOf(none)?.value).toBe("");
  });

  it("emits at once with searchDelay 0", async () => {
    const onfilter = vi.fn();
    const table = mount({ onfilter, searchDelay: 0 });
    await toggle(table, 0, "open");
    await fireEvent.input(fieldOf(table) as HTMLElement, {
      target: { value: "a" },
    });
    expect(onfilter).toHaveBeenCalledTimes(1);
  });

  it("emits only on Enter with searchOnEnter", async () => {
    const onfilter = vi.fn();
    const table = mount({ onfilter, searchOnEnter: true });
    await toggle(table, 0, "open");
    const field = fieldOf(table) as HTMLElement;
    await fireEvent.input(field, { target: { value: "b" } });
    await vi.advanceTimersByTimeAsync(400);
    expect(onfilter).not.toHaveBeenCalled();
    await fireEvent.keyDown(field, { key: "Enter" });
    expect(onfilter).toHaveBeenCalledTimes(1);
  });

  it("refuses a text longer than the table's maxLength", async () => {
    const onfilter = vi.fn();
    const table = mount({ onfilter, maxLength: 1 });
    await toggle(table, 0, "open");
    await fireEvent.input(fieldOf(table) as HTMLElement, {
      target: { value: "ab" },
    });
    await vi.advanceTimersByTimeAsync(400);
    expect(onfilter).not.toHaveBeenCalled();
    // The same text within the limit is emitted: the refusal above is the limit's, not a field that never emits
    const roomy = mount({ onfilter, maxLength: 2 });
    await toggle(roomy, 0, "open");
    await fireEvent.input(fieldOf(roomy) as HTMLElement, {
      target: { value: "ab" },
    });
    await vi.advanceTimersByTimeAsync(400);
    expect(onfilter).toHaveBeenCalledTimes(1);
  });

  it("is not shown in a categorical column's dialog", async () => {
    const table = mount();
    await toggle(table, 1, "open");
    expect(fieldOf(table)).toBeNull();
    // The text column's dialog on the same table does gain its field
    await toggle(table, 0, "open");
    expect(fieldOf(table)).not.toBeNull();
  });
});

describe("FILT-17, a categorical filter's checkboxes in the simulated DOM", () => {
  const boxes = (table: { container: HTMLElement }) =>
    [...table.container.querySelectorAll<HTMLInputElement>("[popover] input")]
      .filter((box) => box.type === "checkbox")
      .map((box) => [box.labels?.[0]?.textContent?.trim(), box.checked]);
  const withSelected = (...selected: string[]) => ({
    filters: { status: { kind: "categorical" as const, selected } },
  });

  it("are absent from a text column's dialog", async () => {
    const table = mount();
    await toggle(table, 0, "open");
    expect(boxes(table)).toEqual([]);
  });

  // This pair is the mutation proof of the reset line in ColumnFilter.svelte: without it one Survived CallExpression
  // mutant is left there (the browser rows prove the behaviour)
  it("show the props after a press, and the new props once they change", async () => {
    const table = mount(withSelected("inactive"));
    await toggle(table, 1, "open");
    const active = within(table.container).getByLabelText<HTMLInputElement>(
      "Active",
      { exact: true },
    );
    await fireEvent.click(active);
    expect(active.checked).toBe(false);
    await table.rerender(withSelected("active", "inactive"));
    expect(active.checked).toBe(true);
  });

  it("stay checked after a press on a selected one while filters is unchanged", async () => {
    const table = mount(withSelected("inactive"));
    await toggle(table, 1, "open");
    const inactive = within(table.container).getByLabelText<HTMLInputElement>(
      "Inactive",
      { exact: true },
    );
    await fireEvent.click(inactive);
    expect(inactive.checked).toBe(true);
  });
});

describe("FILT-53, the option for no value in the simulated DOM", () => {
  it("is offered last under the emptyOption word and emits ''", async () => {
    const onfilter = vi.fn();
    const table = mount({
      onfilter,
      messages: { emptyOption: "None" },
      columns: [
        ...columns.slice(0, 1),
        {
          id: "status",
          label: "Status",
          value: ({ row }) => row.name,
          filter: {
            kind: "categorical",
            options: [
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
            emptyOption: true,
          },
        },
      ],
    });
    await toggle(table, 1, "open");
    const labels = [...table.container.querySelectorAll("[popover] label")];
    expect(labels.map((label) => label.textContent?.trim())).toEqual([
      "Active",
      "Inactive",
      "None",
    ]);
    await fireEvent.click(
      within(table.container).getByLabelText("None", { exact: true }),
    );
    expect(onfilter.mock.calls).toEqual([
      [{ id: "status", state: { kind: "categorical", selected: [""] } }],
    ]);
  });
});
