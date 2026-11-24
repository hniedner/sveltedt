import { render, screen, within } from "@testing-library/svelte";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import DataTable from "./DataTable.svelte";
import Pagination from "./Pagination.svelte";
import type {
  DataTableColumn,
  DataTableMessages,
  DataTableProps,
  PaginationMessages,
  PaginationProps,
} from "./types.ts";

type Item = { id: string; code: string; name: string; date: string };
type Words = Partial<DataTableMessages & PaginationMessages>;

const sortable = (id: "code" | "name" | "date"): DataTableColumn<Item> => ({
  id,
  label: id[0].toUpperCase() + id.slice(1),
  value: ({ row }) => row[id],
  sortable: ["asc", "desc"],
});
const items = (count: number): Item[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `r${index}`,
    code: "C",
    name: "N",
    date: "D",
  }));

// Typed here, not inline: the type-aware lint reads an inline callback's row as any
const getRowId = ({ row }: { row: Item }): string => row.id;

function table(props: Partial<DataTableProps<Item>>, messages?: Words): void {
  render(DataTable<Item>, {
    rows: items(1),
    columns: [sortable("code"), sortable("date"), sortable("name")],
    getRowId,
    caption: "Orders",
    regionLabel: "Orders table",
    onsort: () => undefined,
    messages,
    ...props,
  });
}
function pager(props: Partial<PaginationProps>, messages?: Words): HTMLElement {
  render(Pagination, {
    offset: 0,
    limit: 10,
    total: 57,
    label: "Pages",
    onpage: () => undefined,
    onsize: () => undefined,
    messages,
    ...props,
  });
  return screen.getByRole("navigation", { name: "Pages" });
}
// The page buttons, between the four step buttons: their names are not the step words
const pageButtons = (nav: HTMLElement): HTMLElement[] =>
  within(nav).getAllByRole("button").slice(2, -2);
const nameButton = (): HTMLElement =>
  screen.getByRole("button", { name: "Name" });
const described = (element: HTMLElement): string =>
  (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

// Each row of the statement: the function, the value it is called with, its English default, and where the
// component shows it, read after mounting with the given messages
type Row = [
  keyof (DataTableMessages & PaginationMessages),
  unknown,
  string,
  (messages?: Words) => string,
];
const ROWS: Row[] = [
  [
    "rowCount",
    1000,
    "1,000 rows displayed",
    (messages) => {
      table({ rows: items(1000) }, messages);
      return (
        document.querySelector('[aria-live="polite"]:not([role])')
          ?.textContent ?? ""
      );
    },
  ],
  [
    "sortRank",
    2,
    "2",
    (messages) => {
      table(
        {
          sort: [
            { id: "code", direction: "asc" },
            { id: "name", direction: "desc" },
          ],
        },
        messages,
      );
      return [
        ...screen
          .getByRole("columnheader", { name: /^Name/ })
          .querySelectorAll('[aria-hidden="true"]'),
      ]
        .map((element) => element.textContent)
        .join(" ");
    },
  ],
  [
    "sortDescription",
    { direction: "desc", rank: 3 },
    "sorted descending, priority 3. Shift+click, Shift+Enter or Shift+Space adds this column to the sort.",
    (messages) => {
      table(
        {
          sort: [
            { id: "code", direction: "asc" },
            { id: "date", direction: "asc" },
            { id: "name", direction: "desc" },
          ],
        },
        messages,
      );
      return described(nameButton());
    },
  ],
  [
    "pageNumber",
    1234,
    "1,234",
    (messages) =>
      pageButtons(pager({ offset: 12330, total: 20000 }, messages))
        .map((element) => element.textContent.trim())
        .join(" "),
  ],
  [
    "pageLabel",
    1234,
    "Page 1,234",
    (messages) =>
      pageButtons(pager({ offset: 12330, total: 20000 }, messages))
        .map((element) => element.getAttribute("aria-label"))
        .join(" "),
  ],
  [
    "sizeOption",
    1000,
    "1,000",
    (messages) =>
      within(pager({ sizes: [10, 1000] }, messages))
        .getAllByRole("option")
        .map((element) => element.textContent)
        .join(" "),
  ],
  [
    "info",
    { first: 1001, last: 1010, total: 12345 },
    "Showing 1,001 to 1,010 of 12,345 rows",
    (messages) => pager({ offset: 1000, total: 12345 }, messages).textContent,
  ],
  [
    "info",
    { first: 1, last: 1, total: 1 },
    "Showing 1 to 1 of 1 row",
    (messages) => pager({ total: 1 }, messages).textContent,
  ],
  [
    "infoFiltered",
    1000,
    "(filtered from 1,000 total rows)",
    (messages) =>
      pager({ total: 57, unfilteredTotal: 1000 }, messages).textContent,
  ],
  [
    "infoFiltered",
    1,
    "(filtered from 1 total row)",
    (messages) => pager({ total: 0, unfilteredTotal: 1 }, messages).textContent,
  ],
];

// Eastern Arabic digits for every Western digit of a number
const arabic = (value: number): string =>
  String(value).replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
// Replacements that receive the number and return Eastern Arabic digits
const ARABIC: Words = {
  rowCount: (count) => `${arabic(count)} صفوف`,
  sortRank: (rank) => arabic(rank),
  sortDescription: ({ rank }) => `ترتيب ${arabic(rank ?? 0)}`,
  pageNumber: (page) => arabic(page),
  pageLabel: (page) => `صفحة ${arabic(page)}`,
  sizeOption: (size) => arabic(size),
  info: ({ first, last, total }) =>
    `${arabic(first)} - ${arabic(last)} / ${arabic(total)}`,
  infoFiltered: (total) => `(${arabic(total)})`,
};

// The German run: a child process started with a German default locale calls each row's default function
const GERMAN = `
const m = await import(process.argv[1]);
const d = m.defaultMessages, p = m.defaultPagerMessages;
const words = { ...d, ...p };
console.log(JSON.stringify({
  toLocaleString: (1000).toLocaleString(),
  numberFormat: new Intl.NumberFormat().format(1000),
  language: navigator.language,
  languages: navigator.languages,
  rows: JSON.parse(process.argv[2]).map(([name, value]) => words[name](value)),
}));
`;

// @spec("I18N-01", "f3ba2b4e")
describe("I18N-01", () => {
  it.each(ROWS)(
    "%s(%j) shows its English default %j",
    (_name, _value, english, shown) => {
      expect(shown()).toContain(english);
    },
  );

  it.each(ROWS)(
    "%s(%j) shows the replacement's Eastern Arabic digits and no Western digit",
    (name, value, _english, shown) => {
      const replacement = (ARABIC[name] as (input: unknown) => string)(value);
      const text = shown(ARABIC);
      expect(text).toContain(replacement);
      expect(text).not.toMatch(/[0-9]/);
    },
  );

  it("gives the English defaults in a process whose default locale is German", () => {
    const child = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        GERMAN,
        join(import.meta.dirname, "messages.ts"),
        JSON.stringify(ROWS.map(([name, value]) => [name, value])),
      ],
      {
        encoding: "utf8",
        env: { ...process.env, LANG: "de_DE.UTF-8", LC_ALL: "de_DE.UTF-8" },
      },
    );
    expect(child.error).toBeUndefined();
    // The child's error output shows only when it failed
    expect([child.status, child.status === 0 ? "" : child.stderr]).toEqual([
      0,
      "",
    ]);
    const out = JSON.parse(child.stdout) as {
      toLocaleString: string;
      numberFormat: string;
      language: string;
      languages: string[];
      rows: string[];
    };
    // The locale took effect: the runtime's own formatting and the navigator are German
    expect([out.toLocaleString, out.numberFormat]).toEqual(["1.000", "1.000"]);
    expect(out.language).toMatch(/^de\b/);
    expect(out.languages.every((language) => /^de\b/.test(language))).toBe(
      true,
    );
    expect(out.rows).toEqual(ROWS.map(([, , english]) => english));
  });
});
