import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import { useConsoleErrors } from "../../test/console-spy.ts";
import DataTable from "./DataTable.svelte";
import type {
  DataTableColumn,
  DataTableFilter,
  DataTableProps,
  SortDirection,
} from "./types.ts";

interface Item {
  id: string;
  name: string;
  status: string;
}

const rows: Item[] = [{ id: "r1", name: "Alpha", status: "active" }];

// The spec's filter columns: Name (text) and Status (categorical, Active and Inactive)
function column(
  id: "name" | "status",
  label: string,
  filter?: unknown,
): DataTableColumn<Item> {
  return {
    id,
    label,
    value: ({ row }) => row[id],
    ...(filter === undefined ? {} : { filter: filter as DataTableFilter }),
  };
}
const options = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];
const nameColumn = column("name", "Name", { kind: "text" });
const statusColumn = column("status", "Status", {
  kind: "categorical",
  options,
});
const withStatus = (extra: object): DataTableColumn<Item> =>
  column("status", "Status", { kind: "categorical", options, ...extra });

function mount(props: Partial<DataTableProps<Item>> = {}) {
  return render(DataTable<Item>, {
    rows,
    columns: [nameColumn, statusColumn],
    getRowId: ({ row }: { row: Item }) => row.id,
    caption: "Orders",
    regionLabel: "Orders table",
    onfilter: vi.fn(),
    onclearfilter: vi.fn(),
    onclearfilters: vi.fn(),
    ...props,
  });
}

// The alert of RND-05 is one fixed text; the cause is the console line of RND-17 (code and development text)
const FIXED = "This table cannot be shown.";
const errors = useConsoleErrors();
const TEXTS = {
  filterInvalid: "A column filter is not valid.",
  filterHandlerMissing: "A filter has no handler.",
  filterStateInvalid: "An applied filter is not valid.",
  searchInvalid: "The applied search is not valid.",
  searchDelayInvalid: "The search delay is not a valid number.",
  maxLengthInvalid: "The text length limit is not a valid number.",
};
const line = (code: keyof typeof TEXTS): string =>
  `SvelteDT: ${code}: ${TEXTS[code]}`;

type Props = Partial<DataTableProps<Item>>;
const cast = (value: unknown): never => value as never;

const faults: [string, Props, keyof typeof TEXTS][] = [
  // `filter` has a kind other than text and categorical
  [
    "kind 'range'",
    { columns: [column("name", "Name", { kind: "range", options })] },
    "filterInvalid",
  ],
  ["no kind", { columns: [column("name", "Name", {})] }, "filterInvalid"],
  ["a text", { columns: [column("name", "Name", "text")] }, "filterInvalid"],
  // `options` is empty or not a list
  ["no options", { columns: [withStatus({ options: [] })] }, "filterInvalid"],
  [
    "options a text",
    { columns: [withStatus({ options: "active" })] },
    "filterInvalid",
  ],
  [
    "options left out",
    { columns: [withStatus({ options: undefined })] },
    "filterInvalid",
  ],
  // an option's value or label is empty
  [
    "an empty value",
    {
      columns: [
        withStatus({
          options: [
            { value: "a", label: "A" },
            { value: "", label: "None" },
          ],
        }),
      ],
    },
    "filterInvalid",
  ],
  [
    "an empty label",
    {
      columns: [
        withStatus({
          options: [
            { value: "a", label: "A" },
            { value: "b", label: " " },
          ],
        }),
      ],
    },
    "filterInvalid",
  ],
  [
    "an option null",
    { columns: [withStatus({ options: [{ value: "a", label: "A" }, null] })] },
    "filterInvalid",
  ],
  // emptyOption of the wrong type
  [
    "emptyOption 'yes'",
    { columns: [withStatus({ emptyOption: "yes" })] },
    "filterInvalid",
  ],
  [
    "emptyOption 1",
    { columns: [withStatus({ emptyOption: 1 })] },
    "filterInvalid",
  ],
  [
    "emptyOption on text",
    { columns: [column("name", "Name", { kind: "text", emptyOption: true })] },
    "filterInvalid",
  ],
  // duplicates
  [
    "a shared value",
    {
      columns: [
        withStatus({
          options: [
            { value: "a", label: "A" },
            { value: "a", label: "B" },
          ],
        }),
      ],
    },
    "filterInvalid",
  ],
  [
    "labels equal after trimming",
    {
      columns: [
        withStatus({
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "A " },
          ],
        }),
      ],
    },
    "filterInvalid",
  ],
  [
    "the shown label of emptyOption",
    {
      columns: [
        withStatus({
          emptyOption: true,
          options: [{ value: "none", label: "(empty)" }],
        }),
      ],
    },
    "filterInvalid",
  ],
  // handlers
  ["no onfilter", { onfilter: undefined }, "filterHandlerMissing"],
  ["no onclearfilter", { onclearfilter: undefined }, "filterHandlerMissing"],
  ["no onclearfilters", { onclearfilters: undefined }, "filterHandlerMissing"],
  ["onfilter null", { onfilter: cast(null) }, "filterHandlerMissing"],
  // applied filters
  ["filters a list", { filters: cast([]) }, "filterStateInvalid"],
  ["filters a text", { filters: cast("name") }, "filterStateInvalid"],
  ["an entry null", { filters: cast({ name: null }) }, "filterStateInvalid"],
  [
    "an unknown column",
    { filters: { zzz: { kind: "text", text: "a" } } },
    "filterStateInvalid",
  ],
  [
    "a column with no filter",
    {
      columns: [column("name", "Name")],
      filters: { name: { kind: "text", text: "a" } },
      onfilter: undefined,
    },
    "filterStateInvalid",
  ],
  [
    "another kind",
    { filters: { name: { kind: "categorical", selected: [] } } },
    "filterStateInvalid",
  ],
  [
    "a non-string text",
    { filters: cast({ name: { kind: "text", text: 5 } }) },
    "filterStateInvalid",
  ],
  [
    "selected a text",
    { filters: cast({ status: { kind: "categorical", selected: "active" } }) },
    "filterStateInvalid",
  ],
  [
    "selected no option",
    { filters: { status: { kind: "categorical", selected: ["zzz"] } } },
    "filterStateInvalid",
  ],
  [
    "selected '' without emptyOption",
    { filters: { status: { kind: "categorical", selected: [""] } } },
    "filterStateInvalid",
  ],
  [
    "selected twice",
    {
      filters: {
        status: { kind: "categorical", selected: ["active", "active"] },
      },
    },
    "filterStateInvalid",
  ],
  [
    "selected a given option and an unknown one",
    {
      filters: {
        status: { kind: "categorical", selected: ["active", "zzz"] },
      },
    },
    "filterStateInvalid",
  ],
  [
    "a second entry that is not valid",
    {
      filters: {
        name: { kind: "text", text: "a" },
        status: { kind: "categorical", selected: ["zzz"] },
      },
    },
    "filterStateInvalid",
  ],
  [
    "the shown label of emptyOption, trimmed",
    {
      columns: [
        withStatus({
          emptyOption: true,
          options: [{ value: "n", label: "(none)" }],
        }),
      ],
      messages: { emptyOption: "(none) " },
    },
    "filterInvalid",
  ],
  // more than one column or entry
  [
    "a second filter column that is not valid",
    { columns: [nameColumn, column("status", "Status", { kind: "range" })] },
    "filterInvalid",
  ],
  [
    "an option value that is no text",
    { columns: [withStatus({ options: [{ value: 5, label: "A" }] })] },
    "filterInvalid",
  ],
  [
    "an option label that is no text",
    { columns: [withStatus({ options: [{ value: "a", label: 5 }] })] },
    "filterInvalid",
  ],
  [
    "an applied filter on a column whose filter is null",
    {
      columns: [column("name", "Name", null)],
      filters: { name: { kind: "text", text: "a" } },
      onfilter: undefined,
    },
    "filterStateInvalid",
  ],
  // search, searchDelay, maxLength
  ["search a number", { search: cast(5) }, "searchInvalid"],
  ...[-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, null].map(
    (value): [string, Props, keyof typeof TEXTS] => [
      `searchDelay ${String(value)}`,
      { searchDelay: cast(value) },
      "searchDelayInvalid",
    ],
  ),
  ...[0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, null].map(
    (value): [string, Props, keyof typeof TEXTS] => [
      `maxLength ${String(value)}`,
      { maxLength: cast(value) },
      "maxLengthInvalid",
    ],
  ),
];

// @spec("FILT-32", "0f49c459")
describe("FILT-32", () => {
  it.each(faults)(
    "with %s shows only the fixed alert, no table, and logs the code",
    (_input, props, code) => {
      const { container } = mount(props);
      expect(
        screen.getAllByRole("alert").map((alert) => alert.textContent),
      ).toEqual([FIXED]);
      expect(container.querySelector("table")).toBeNull();
      expect(errors()).toEqual([line(code)]);
    },
  );

  it.each<[string, Props]>([
    ["filter null", { columns: [column("name", "Name", null)] }],
    ["filters null", { filters: cast(null) }],
    ["search null", { search: cast(null) }],
    [
      "emptyOption false on a text filter",
      {
        columns: [column("name", "Name", { kind: "text", emptyOption: false })],
      },
    ],
    [
      "emptyOption left null on a categorical filter",
      { columns: [withStatus({ emptyOption: null })] },
    ],
    ["search a text", { search: "beta" }],
    [
      "option labels that differ only in case",
      {
        columns: [
          withStatus({
            options: [
              { value: "a", label: "A" },
              { value: "b", label: "a" },
            ],
          }),
        ],
      },
    ],
    [
      "a label equal to emptyOption's word without emptyOption",
      {
        columns: [
          withStatus({
            options: [...options, { value: "n", label: "(empty)" }],
          }),
        ],
      },
    ],
    ["searchDelay 0", { searchDelay: 0 }],
    ["maxLength 1", { maxLength: 1 }],
    [
      "selected '' with emptyOption",
      {
        columns: [withStatus({ emptyOption: true })],
        filters: { status: { kind: "categorical", selected: ["", "active"] } },
      },
    ],
    [
      "an applied text over maxLength",
      { filters: { name: { kind: "text", text: "a".repeat(300) } } },
    ],
    [
      "no filter column and no handler",
      {
        columns: [column("name", "Name")],
        onfilter: undefined,
        onclearfilter: undefined,
        onclearfilters: undefined,
      },
    ],
  ])("with %s shows the table and logs nothing", (_input, props) => {
    mount(props);
    expect(screen.queryAllByRole("alert")).toEqual([]);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(errors()).toEqual([]);
  });

  const sortable: DataTableColumn<Item> = {
    ...nameColumn,
    sortable: ["asc", "desc"] satisfies SortDirection[],
  };
  it.each<[string, Props, string]>([
    [
      "an empty caption",
      { caption: "", columns: [column("name", "Name", { kind: "range" })] },
      "captionEmpty",
    ],
    [
      "an unknown sort column",
      {
        columns: [sortable],
        sort: [{ id: "zzz", direction: "asc" }],
        onsort: vi.fn(),
        search: cast(5),
      },
      "sortColumnUnknown",
    ],
    [
      "no handler and a bad search",
      { onfilter: undefined, search: cast(5) },
      "filterHandlerMissing",
    ],
    [
      "a bad sort and a bad filter",
      {
        columns: [{ ...sortable, filter: cast({ kind: "range" }) }],
        sort: [{ id: "zzz", direction: "asc" }],
        onsort: vi.fn(),
      },
      "sortColumnUnknown",
    ],
    [
      "a bad filter and no handler",
      {
        columns: [column("name", "Name", { kind: "range" })],
        onfilter: undefined,
      },
      "filterInvalid",
    ],
    [
      "no handler and a bad applied filter",
      { onfilter: undefined, filters: cast([]) },
      "filterHandlerMissing",
    ],
    [
      "a bad applied filter and a bad search",
      { filters: cast([]), search: cast(5) },
      "filterStateInvalid",
    ],
    [
      "a bad search and a bad delay",
      { search: cast(5), searchDelay: -1 },
      "searchInvalid",
    ],
    [
      "a bad delay and a bad length",
      { searchDelay: -1, maxLength: 0 },
      "searchDelayInvalid",
    ],
  ])("with %s logs the first fault only", (_input, props, code) => {
    mount(props);
    expect(errors()).toHaveLength(1);
    expect(String(errors()[0])).toContain(`SvelteDT: ${code}:`);
  });
});

// @spec("FILT-39", "09d4b557")
describe("FILT-39", () => {
  it.each<[Props, keyof typeof TEXTS, string[]]>([
    [
      {
        columns: [
          withStatus({
            options: [
              { value: "val-q8", label: "Secret-6" },
              { value: "val-q8", label: "Other" },
            ],
          }),
        ],
      },
      "filterInvalid",
      ["val-q8", "Secret-6"],
    ],
    [
      { filters: { status: { kind: "categorical", selected: ["val-p3"] } } },
      "filterStateInvalid",
      ["val-p3"],
    ],
  ])(
    "holds no filter value in the alert or the console line",
    (props, code, words) => {
      mount(props);
      const alerts = screen
        .getAllByRole("alert")
        .map((alert) => alert.textContent);
      expect(alerts).toEqual([FIXED]);
      expect(errors()).toEqual([line(code)]);
      for (const word of words)
        for (const text of [...alerts, ...errors()])
          expect(String(text)).not.toContain(word);
    },
  );
});
