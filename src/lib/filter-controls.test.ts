import { fireEvent, render, screen, within } from "@testing-library/svelte";
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
const statusColumn = column("status", "Status", {
  filter: {
    kind: "categorical",
    options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ],
  },
});
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

const BETA = "Name: contains “Beta”";
// The badge buttons: each is named "Clear filter <its words>"
const badgeButtons = (): HTMLElement[] =>
  screen.queryAllByRole("button", { name: /^Clear filter/ });

// @spec("FILT-08", "a23f1fef")
describe("FILT-08", () => {
  it("shows one button with the words visible and the same words in its name for an applied text", () => {
    mount({
      columns: [nameColumn, statusColumn],
      filters: { name: { kind: "text", text: "Beta" } },
    });
    const [badge, ...others] = badgeButtons();
    expect(others).toEqual([]);
    expect(badge?.textContent).toBe(BETA);
    expect(badge?.getAttribute("aria-label")).toBe(`Clear filter ${BETA}`);
  });

  it.each<[string, Partial<DataTableProps<Item>>]>([
    ["a text that is empty", { filters: { name: { kind: "text", text: "" } } }],
    [
      "a text that is one space",
      { filters: { name: { kind: "text", text: " " } } },
    ],
    [
      "an empty selection",
      {
        columns: [statusColumn],
        filters: { status: { kind: "categorical", selected: [] } },
      },
    ],
    [
      "a fault of filters (the alert of RND-05)",
      {
        filters: {
          name: { kind: "text", text: "Beta" },
          zzz: { kind: "text", text: "x" },
        },
      },
    ],
  ])("shows no badge for %s", (_row, props) => {
    mount(props);
    expect(badgeButtons()).toEqual([]);
  });
});

const CLEAR_ALL = "Clear column filters";
const clearAll = (): HTMLElement[] =>
  screen.queryAllByRole("button", { name: CLEAR_ALL });

// @spec("FILT-10", "d4f0090f")
describe("FILT-10", () => {
  it.each<[string, Partial<DataTableProps<Item>>, number]>([
    ["no filter", { filters: {} }, 0],
    [
      "a text that is empty",
      { filters: { name: { kind: "text", text: "" } } },
      0,
    ],
    [
      "an applied text",
      { filters: { name: { kind: "text", text: "Beta" } } },
      1,
    ],
    [
      "a fault of filters (the alert of RND-05)",
      {
        filters: {
          name: { kind: "text", text: "Beta" },
          zzz: { kind: "text", text: "x" },
        },
      },
      0,
    ],
  ])(
    "with %s shows the button as often as the row says",
    (_row, props, shown) => {
      mount(props);
      expect(clearAll()).toHaveLength(shown);
    },
  );
});

// @spec("FILT-09", "48cff703")
describe("FILT-09", () => {
  it("emits onclearfilter once with the column id on a badge press, and calls no other handler", async () => {
    const { onclearfilter, onfilter, onclearfilters, onsort } = mount({
      filters: { name: { kind: "text", text: "Beta" } },
    });
    await fireEvent.click(
      screen.getByRole("button", { name: `Clear filter ${BETA}` }),
    );
    expect(onclearfilter.mock.calls).toEqual([[{ id: "name" }]]);
    expect(onfilter).not.toHaveBeenCalled();
    expect(onclearfilters).not.toHaveBeenCalled();
    expect(onsort).not.toHaveBeenCalled();
  });
});

// @spec("FILT-22", "dcf9ee27")
describe("FILT-22", () => {
  const withEmptyOption = column("status", "Status", {
    filter: {
      kind: "categorical",
      emptyOption: true,
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
    },
  });
  it.each<[string, DataTableColumn<Item>, string[], string]>([
    [
      "in the options' order, not the selection's",
      statusColumn,
      ["inactive", "active"],
      "Status: Active, Inactive",
    ],
    [
      "with the empty option last",
      withEmptyOption,
      ["", "active"],
      "Status: Active, (empty)",
    ],
  ])("names the selected options by label %s", (_row, def, selected, text) => {
    mount({
      columns: [def],
      filters: { status: { kind: "categorical", selected } },
    });
    expect(badgeButtons().map((badge) => badge.textContent)).toEqual([text]);
  });
});
