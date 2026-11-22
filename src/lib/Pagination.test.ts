import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import { defaultPagerMessages } from "./messages.ts";
import Pagination from "./Pagination.svelte";
import type { PaginationMessages, PaginationProps } from "./types.ts";

// Mounts the pager over `offset 0, limit 10, total 95`, labelled "Pages of orders", with handlers that record their
// calls and pass nothing back
function mount(props: Partial<PaginationProps> = {}) {
  const onpage = vi.fn<(offset: number) => void>();
  const onsize = vi.fn<(size: number) => void>();
  const view = render(Pagination, {
    offset: 0,
    limit: 10,
    total: 95,
    label: "Pages of orders",
    onpage,
    onsize,
    ...props,
  });
  return { ...view, onpage, onsize };
}

const nav = (): HTMLElement =>
  screen.getByRole("navigation", { name: "Pages of orders" });
const button = (name: string): HTMLElement =>
  within(nav()).getByRole("button", { name });
const pageButtons = (): HTMLElement[] =>
  within(nav()).queryAllByRole("button", { name: /^Page / });

// The number row as the spec writes it: "1 … 6 7 8 9 10", each number the visible text of its button, each gap an
// aria-hidden "…" outside any button
function places(): string {
  return [...nav().querySelectorAll("button, [aria-hidden='true']")]
    .filter((element) =>
      element.tagName === "BUTTON"
        ? /^Page /.test(element.getAttribute("aria-label") ?? "")
        : element.textContent === "…" && element.closest("button") === null,
    )
    .map((element) => element.textContent.trim())
    .join(" ");
}

const current = (): string[] =>
  [...nav().querySelectorAll("[aria-current]")].map(
    (element) =>
      `${element.getAttribute("aria-label")}=${element.getAttribute("aria-current")}`,
  );

const follows = (earlier: Element, later: Element): boolean =>
  Boolean(
    earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING,
  );

// The pager's text and accessible names, for the "no NaN, no Infinity, no Page 0" checks
function pagerWords(): string {
  return [
    nav().textContent,
    ...[...nav().querySelectorAll("[aria-label]")].map(
      (element) => element.getAttribute("aria-label") ?? "",
    ),
  ].join("\n");
}

function expectNoBrokenNumber(): void {
  const words = pagerWords();
  for (const bad of ["NaN", "Infinity", "Page 0"])
    expect(words).not.toContain(bad);
}

const STEPS = ["First page", "Previous page", "Next page", "Last page"];

// @spec("PAGE-09", "b2e86c2c")
describe("PAGE-09", () => {
  it("is exactly one nav element named by its label", () => {
    mount();
    const navs = screen.getAllByRole("navigation");
    expect(navs).toHaveLength(1);
    expect(navs[0]).toBe(nav());
    expect(navs[0]?.tagName).toBe("NAV");
  });
});

// @spec("PAGE-10", "e506a7de")
describe("PAGE-10", () => {
  it("orders the select, First, Previous, the numbers, Next and Last", () => {
    mount({ offset: 100, limit: 10, total: 200, sizes: [10, 25] });
    const select = within(nav()).getByRole("combobox");
    const [first, previous, next, last] = STEPS.map(button);
    expect(follows(select, first)).toBe(true);
    expect(follows(first, previous)).toBe(true);
    const numbers = pageButtons();
    expect(numbers.length).toBeGreaterThan(0);
    for (const number of numbers) {
      expect(follows(previous, number)).toBe(true);
      expect(follows(number, next)).toBe(true);
    }
    expect(follows(next, last)).toBe(true);
  });
});

// @spec("PAGE-01", "1f97322b")
describe("PAGE-01", () => {
  it.each([
    ["First page", 0],
    ["Previous page", 10],
    ["Next page", 30],
    ["Last page", 90],
    ["Page 5", 40],
    ["Page 10", 90],
  ])(
    "with offset 20, limit 10, total 95, a press on %s emits %i once",
    async (name, offset) => {
      const { onpage, onsize } = mount({ offset: 20 });
      expect(places()).toBe("1 2 3 4 5 … 10");
      await fireEvent.click(button(name));
      expect(onpage.mock.calls).toEqual([[offset]]);
      expect(onsize).not.toHaveBeenCalled();
    },
  );
});

// @spec("PAGE-02", "d5eaa755")
describe("PAGE-02", () => {
  it.each([
    [1, 1, "1"],
    [7, 1, "1 2 3 4 5 6 7"],
    [7, 4, "1 2 3 4 5 6 7"],
    [7, 7, "1 2 3 4 5 6 7"],
    [8, 1, "1 2 3 4 5 … 8"],
    [8, 4, "1 2 3 4 5 … 8"],
    [8, 5, "1 … 4 5 6 7 8"],
    [8, 8, "1 … 4 5 6 7 8"],
    [20, 11, "1 … 10 11 12 … 20"],
  ])("with %i pages and page %i current shows %s", (pages, page, shown) => {
    mount({ offset: (page - 1) * 10, limit: 10, total: pages * 10 });
    expect(places()).toBe(shown);
    expect(current()).toEqual([`Page ${page}=page`]);
  });
});

// @spec("PAGE-11", "1c83f221")
describe("PAGE-11", () => {
  it("draws each gap as an aria-hidden … outside any button", () => {
    mount({ offset: 100, limit: 10, total: 200 });
    const marks = within(nav()).getAllByText("…");
    expect(marks).toHaveLength(2);
    for (const mark of marks) {
      expect(mark.getAttribute("aria-hidden")).toBe("true");
      expect(mark.closest("button")).toBeNull();
    }
  });
});

// @spec("PAGE-17", "42d136f9")
describe("PAGE-17", () => {
  it.each([
    [1, "1"],
    [25, "1"],
    [26, "1 2"],
    [9007199254740991, "1 2 3 4 5 … 360,287,970,189,640"],
  ])("with offset 0, limit 25, total %i shows %s", (total, shown) => {
    mount({ offset: 0, limit: 25, total });
    expect(places()).toBe(shown);
    expectNoBrokenNumber();
  });
});

// @spec("PAGE-18", "c238a5f5")
describe("PAGE-18", () => {
  it.each([
    [26, 25],
    [50, 25],
    [51, 50],
    [9007199254740991, 9007199254740975],
  ])(
    "with offset 0, limit 25, total %i, Last page emits %i",
    async (total, offset) => {
      const { onpage } = mount({ offset: 0, limit: 25, total });
      await fireEvent.click(button("Last page"));
      expect(onpage.mock.calls).toEqual([[offset]]);
    },
  );
});

// @spec("PAGE-25", "fc092594")
describe("PAGE-25", () => {
  it.each([
    [100, 95, "1 … 6 7 8 9 10"],
    [90, 90, "1 … 5 6 7 8 9"],
    [95, 95, "1 … 6 7 8 9 10"],
    [25, 0, "1"],
  ])(
    "with offset %i at or past total %i shows %s and no current page",
    (offset, total, shown) => {
      mount({ offset, limit: 10, total });
      expect(places()).toBe(shown);
      expect(current()).toEqual([]);
      expect(screen.queryByRole("alert")).toBeNull();
    },
  );
});

// @spec("PAGE-26", "1e18e4f8")
describe("PAGE-26", () => {
  it.each([
    [100, 95, 90],
    [200, 95, 90],
    [25, 0, 0],
  ])(
    "with offset %i past total %i, Previous page emits %i",
    async (offset, total, previous) => {
      const { onpage } = mount({ offset, limit: 10, total });
      expect(button("Next page").getAttribute("aria-disabled")).toBe("true");
      expect(button("Last page").getAttribute("aria-disabled")).toBe("true");
      await fireEvent.click(button("Previous page"));
      expect(onpage.mock.calls).toEqual([[previous]]);
    },
  );
});

// @spec("PAGE-27", "100349df")
describe("PAGE-27", () => {
  it.each<[number, number, number, number, string | null, string, number]>([
    [25, 10, 95, 3, "1 2 3 4 5 … 10", "First page", 0],
    [25, 10, 95, 3, null, "Previous page", 10],
    [25, 10, 95, 3, null, "Next page", 30],
    [25, 10, 95, 3, null, "Last page", 90],
    [25, 10, 95, 3, null, "Page 5", 40],
    [25, 10, 95, 3, null, "Page 3", 20],
    [25, 50, 95, 1, "1 2", "First page", 0],
    [25, 50, 95, 1, null, "Previous page", 0],
    [25, 50, 95, 1, null, "Next page", 50],
    [25, 50, 95, 1, null, "Last page", 50],
    [91, 10, 95, 10, "1 … 6 7 8 9 10", "Previous page", 80],
    [85, 10, 95, 9, "1 … 6 7 8 9 10", "Next page", 90],
    [91, 10, 95, 10, null, "Page 10", 90],
  ])(
    "with offset %i, limit %i, total %i (page %i, %s), a press on %s emits %i",
    async (offset, limit, total, page, shown, name, emitted) => {
      const { onpage } = mount({ offset, limit, total });
      expect(current()).toEqual([`Page ${page}=page`]);
      if (shown !== null) expect(places()).toBe(shown);
      await fireEvent.click(button(name));
      expect(onpage.mock.calls).toEqual([[emitted]]);
    },
  );
});

// @spec("PAGE-04", "60fec150")
describe("PAGE-04", () => {
  it("marks Page 2 and nothing else with aria-current", () => {
    mount({ offset: 25, limit: 25, total: 130 });
    expect(button("Page 2").getAttribute("aria-current")).toBe("page");
    expect(current()).toEqual(["Page 2=page"]);
  });
});

// @spec("PAGE-12", "03a695a6")
describe("PAGE-12", () => {
  it("emits nothing for a press on the current page at its own offset", async () => {
    const { onpage, onsize } = mount({ offset: 25, limit: 25, total: 130 });
    await fireEvent.click(button("Page 2"));
    expect(onpage).not.toHaveBeenCalled();
    expect(onsize).not.toHaveBeenCalled();
  });
});

// @spec("PAGE-05", "4f1295b7")
describe("PAGE-05", () => {
  it.each<[Partial<PaginationProps>, string[]]>([
    [{ offset: 0 }, ["First page", "Previous page"]],
    [{ offset: 90 }, ["Next page", "Last page"]],
    [{ offset: 80, total: 90 }, ["Next page", "Last page"]],
    [{ offset: 40 }, []],
    [{ offset: 0, total: 7 }, STEPS],
    [{ offset: 0, total: 0 }, STEPS],
    [{ offset: 100 }, ["Next page", "Last page"]],
    [{ offset: 25, limit: 50 }, []],
    [{ offset: 91 }, ["Next page", "Last page"]],
    [{ offset: 85 }, []],
  ])("with %j marks exactly %j aria-disabled", (props, disabled) => {
    mount(props);
    expect(
      STEPS.filter(
        (name) => button(name).getAttribute("aria-disabled") === "true",
      ),
    ).toEqual(disabled);
    for (const name of STEPS)
      expect(button(name).hasAttribute("disabled")).toBe(false);
  });
});

// @spec("PAGE-13", "bb09aa83")
describe("PAGE-13", () => {
  it.each([
    [0, ["First page", "Previous page"]],
    [90, ["Next page", "Last page"]],
  ])("with offset %i, pressing %j emits nothing", async (offset, names) => {
    const { onpage, onsize } = mount({ offset });
    for (const name of names) await fireEvent.click(button(name));
    expect(onpage).not.toHaveBeenCalled();
    expect(onsize).not.toHaveBeenCalled();
  });
});

// @spec("PAGE-22", "0ee69ca9")
describe("PAGE-22", () => {
  const props = { offset: 20, sizes: [10, 25, 50] };

  it.each(["Next page", "Page 5"])(
    "after a press on %s still marks Page 3 and shows the same places",
    async (name) => {
      const { onpage } = mount(props);
      await fireEvent.click(button(name));
      expect(onpage).toHaveBeenCalledTimes(1);
      expect(current()).toEqual(["Page 3=page"]);
      expect(places()).toBe("1 2 3 4 5 … 10");
    },
  );

  it("after 50 is chosen, the select still shows 10", async () => {
    const { onsize } = mount(props);
    const select = within(nav()).getByRole<HTMLSelectElement>("combobox");
    await fireEvent.change(select, { target: { value: "50" } });
    expect(onsize.mock.calls).toEqual([[50]]);
    expect(select.value).toBe("10");
  });
});

// @spec("PAGE-08", "55968793")
describe("PAGE-08", () => {
  it("with total 0 shows exactly one page button, Page 1, as the current page", () => {
    mount({ offset: 0, limit: 25, total: 0 });
    expect(pageButtons().map((element) => element.textContent.trim())).toEqual([
      "1",
    ]);
    expect(current()).toEqual(["Page 1=page"]);
    expectNoBrokenNumber();
  });
});

// @spec("PAGE-07", "0a863ab2")
describe("PAGE-07", () => {
  it("offers exactly the given sizes in order, named rows per page, with limit selected", () => {
    const sizes = [10, 25, 50, 100, 250, 500, 1000];
    mount({ limit: 25, sizes });
    const select = within(nav()).getByRole<HTMLSelectElement>("combobox", {
      name: "rows per page",
    });
    expect(within(nav()).getAllByRole("combobox")).toHaveLength(1);
    expect([...select.options].map((option) => Number(option.value))).toEqual(
      sizes,
    );
    expect(select.value).toBe("25");
  });
});

// @spec("PAGE-14", "5efc1301")
describe("PAGE-14", () => {
  it("emits onsize(50) once when 50 is chosen, and no onpage", async () => {
    const { onpage, onsize } = mount({ limit: 25, sizes: [10, 25, 50] });
    await fireEvent.change(within(nav()).getByRole("combobox"), {
      target: { value: "50" },
    });
    expect(onsize.mock.calls).toEqual([[50]]);
    expect(onpage).not.toHaveBeenCalled();
  });
});

// @spec("PAGE-15", "ae65f3d6")
describe("PAGE-15", () => {
  it.each<[string, Partial<PaginationProps>]>([
    ["no sizes prop", {}],
    ["sizes []", { sizes: [] }],
    ["sizes null", { sizes: null as unknown as number[] }],
  ])("shows no page-size select with %s", (_case, props) => {
    mount(props);
    expect(within(nav()).queryByRole("combobox")).toBeNull();
    expect(within(nav()).queryByRole("listbox")).toBeNull();
  });
});

const PAGER_ALERTS = {
  totalInvalid: "The row total is not a valid number.",
  offsetInvalid: "The page offset is not a valid number.",
  limitInvalid: "The page size is not a valid number.",
  labelEmpty: "Pager label must not be empty.",
  sizesInvalid: "The page sizes are not valid.",
  limitNotInSizes: "The page size is not one of the offered sizes.",
  pageHandlerMissing: "The pager has no page handler.",
  sizeHandlerMissing: "The page-size select has no handler.",
  unfilteredTotalInvalid: "The unfiltered row total is not a valid number.",
};
const BAD_NUMBERS = [Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53];

// @spec("PAGE-16", "df108f5e")
describe("PAGE-16", () => {
  it.each<[keyof typeof PAGER_ALERTS, Partial<PaginationProps>]>([
    ...[-1, 1.5, ...BAD_NUMBERS].map(
      (total): [keyof typeof PAGER_ALERTS, Partial<PaginationProps>] => [
        "totalInvalid",
        { total },
      ],
    ),
    ...[-25, 2.5, ...BAD_NUMBERS].map(
      (offset): [keyof typeof PAGER_ALERTS, Partial<PaginationProps>] => [
        "offsetInvalid",
        { offset },
      ],
    ),
    ...[0, -10, 2.5, ...BAD_NUMBERS].map(
      (limit): [keyof typeof PAGER_ALERTS, Partial<PaginationProps>] => [
        "limitInvalid",
        { limit },
      ],
    ),
    ["labelEmpty", { label: "" }],
    ["labelEmpty", { label: "  " }],
    ["sizesInvalid", { sizes: "10,25" as unknown as number[] }],
    ["sizesInvalid", { sizes: 25 as unknown as number[] }],
    ["sizesInvalid", { sizes: [0, 10] }],
    ["sizesInvalid", { sizes: [2.5, 10] }],
    ["sizesInvalid", { sizes: [10, 10] }],
    ["limitNotInSizes", { sizes: [25, 50] }],
    ["pageHandlerMissing", { onpage: undefined }],
    ["sizeHandlerMissing", { sizes: [10, 25], onsize: undefined }],
    ...[-1, 1.5, ...BAD_NUMBERS].map(
      (
        unfilteredTotal,
      ): [keyof typeof PAGER_ALERTS, Partial<PaginationProps>] => [
        "unfilteredTotalInvalid",
        { unfilteredTotal },
      ],
    ),
  ])("shows only the alert %s, no nav, for %o", (key, props) => {
    const { container } = mount(props);
    expect(
      screen.getAllByRole("alert").map((alert) => alert.textContent),
    ).toEqual([PAGER_ALERTS[key]]);
    expect(container.querySelector("nav")).toBeNull();
  });

  it.each<[string, Partial<PaginationProps>]>([
    ["no sizes", { onsize: undefined }],
    ["sizes []", { sizes: [], onsize: undefined }],
  ])("takes %s and no onsize as no fault", (_case, props) => {
    mount(props);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(nav().isConnected).toBe(true);
  });

  it("takes an unfilteredTotal given as null as not given", () => {
    mount({ unfilteredTotal: null as unknown as number });
    expect(screen.queryByRole("alert")).toBeNull();
    // Not given: the information line has no filtered note (PAGE-38)
    expect(
      within(nav()).getByText("Showing 1 to 10 of 95 rows").isConnected,
    ).toBe(true);
  });

  it("takes an unfilteredTotal below total as no fault", () => {
    mount({ total: 95, unfilteredTotal: 50 });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(nav().isConnected).toBe(true);
  });
});

// @spec("PAGE-37", "2fc2897d")
describe("PAGE-37", () => {
  it.each<[number, number, string]>([
    [0, 57, "Showing 1 to 10 of 57 rows"],
    [50, 57, "Showing 51 to 57 of 57 rows"],
    [0, 1, "Showing 1 to 1 of 1 row"],
    [0, 0, "Showing 0 to 0 of 0 rows"],
    [90, 90, "Showing 0 to 0 of 90 rows"],
    [100, 95, "Showing 0 to 0 of 95 rows"],
    [1000, 12345, "Showing 1,001 to 1,010 of 12,345 rows"],
  ])(
    "at offset %i of total %i shows the line %j as visible text",
    (offset, total, line) => {
      mount({ offset, limit: 10, total });
      expect(within(nav()).getByText(line).isConnected).toBe(true);
    },
  );
});

// @spec("PAGE-38", "66cd1522")
describe("PAGE-38", () => {
  it.each<[number, number | undefined, string]>([
    [57, 1000, "Showing 1 to 10 of 57 rows (filtered from 1,000 total rows)"],
    [57, 57, "Showing 1 to 10 of 57 rows"],
    [57, undefined, "Showing 1 to 10 of 57 rows"],
    [0, 1, "Showing 0 to 0 of 0 rows (filtered from 1 total row)"],
    [57, 50, "Showing 1 to 10 of 57 rows (filtered from 50 total rows)"],
  ])(
    "with total %i and unfilteredTotal %s shows the line %j",
    (total, unfilteredTotal, line) => {
      mount({ offset: 0, limit: 10, total, unfilteredTotal });
      expect(within(nav()).getByText(line).isConnected).toBe(true);
    },
  );
});

// One input per alert key of PAGE-16, for the rows that show an alert
const FAULTS: Record<keyof typeof PAGER_ALERTS, Partial<PaginationProps>> = {
  totalInvalid: { total: -1 },
  offsetInvalid: { offset: -1 },
  limitInvalid: { limit: 0 },
  labelEmpty: { label: "" },
  sizesInvalid: { sizes: [0] },
  limitNotInSizes: { sizes: [25] },
  pageHandlerMissing: { onpage: undefined },
  sizeHandlerMissing: { sizes: [10], onsize: undefined },
  unfilteredTotalInvalid: { unfilteredTotal: -1 },
};

// @spec("PAGE-19", "5de7e31c")
describe("PAGE-19", () => {
  const foreign: PaginationMessages = {
    firstPage: "Erste Seite",
    previousPage: "Vorherige Seite",
    nextPage: "Nächste Seite",
    lastPage: "Letzte Seite",
    pageLabel: (page) => `Seite ${page}`,
    pageNumber: (page) => `#${page}`,
    sizeLabel: "Zeilen pro Seite",
    sizeOption: (size) => `${size} Zeilen`,
    info: ({ first, last, total }) =>
      `Zeilen ${first} bis ${last} von ${total}`,
    infoFiltered: (total) => `(gefiltert aus ${total})`,
    ...(Object.fromEntries(
      Object.keys(PAGER_ALERTS).map((key) => [key, `F-${key}`]),
    ) as typeof PAGER_ALERTS),
  };
  const english = [
    ...STEPS,
    "Page ",
    "rows per page",
    "Showing",
    "filtered from",
  ];
  // Page 6 of 10 with sizes and an unfiltered total: every word but the alerts is on show
  const onShow: Partial<PaginationProps> = {
    offset: 50,
    sizes: [10, 25],
    unfilteredTotal: 1000,
  };
  const everything = (): string =>
    [
      document.body.textContent,
      ...[...document.body.querySelectorAll("*")].flatMap((element) =>
        [...element.attributes].map((attribute) => attribute.value),
      ),
    ].join("\n");

  it("shows each given word where its statement says, and no English default", () => {
    mount({ ...onShow, messages: foreign });
    for (const name of [
      "Erste Seite",
      "Vorherige Seite",
      "Nächste Seite",
      "Letzte Seite",
    ])
      expect(button(name).isConnected).toBe(true);
    expect(button("Seite 6").textContent.trim()).toBe("#6");
    const select = within(nav()).getByRole<HTMLSelectElement>("combobox", {
      name: "Zeilen pro Seite",
    });
    expect([...select.options].map((option) => option.text)).toEqual([
      "10 Zeilen",
      "25 Zeilen",
    ]);
    expect(
      within(nav()).getByText("Zeilen 51 bis 60 von 95 (gefiltert aus 1000)")
        .isConnected,
    ).toBe(true);
    for (const word of english) expect(everything()).not.toContain(word);
  });

  it.each(Object.keys(FAULTS) as (keyof typeof PAGER_ALERTS)[])(
    "shows the given alert word for %s",
    (key) => {
      mount({ ...FAULTS[key], messages: foreign });
      expect(screen.getByRole("alert").textContent).toBe(`F-${key}`);
    },
  );

  // A caller the type does not reach: untyped translation data, one entry of each kind
  it.each<[string, keyof PaginationMessages, unknown, string]>([
    ["undefined", "firstPage", undefined, "First page"],
    ["null", "previousPage", null, "Previous page"],
    ["a number for a word", "nextPage", 5, "Next page"],
    ["a text for a function", "pageLabel", "Seite", "Page 6"],
    ["an empty text", "lastPage", "", "Last page"],
    ["a blank text", "sizeLabel", "  ", "rows per page"],
  ])(
    "keeps the English default when an entry is %s (%s)",
    (_kind, key, entry, name) => {
      mount({
        ...onShow,
        messages: { [key]: entry } as unknown as Partial<PaginationMessages>,
      });
      expect(
        within(nav()).getByRole(key === "sizeLabel" ? "combobox" : "button", {
          name,
        }).isConnected,
      ).toBe(true);
    },
  );
});

// @spec("PAGE-20", "5b2aca46")
describe("PAGE-20", () => {
  // The input that makes the pager show an entry: an alert key's fault, else page 6 with sizes and a filtered total
  const shownBy = (key: keyof PaginationMessages): Partial<PaginationProps> =>
    key in FAULTS
      ? FAULTS[key as keyof typeof PAGER_ALERTS]
      : { offset: 50, sizes: [10, 25], unfilteredTotal: 1000 };
  const keys = Object.keys(
    defaultPagerMessages,
  ) as (keyof PaginationMessages)[];

  it.each(
    keys.flatMap((key) =>
      ["<img src=x onerror=alert(1)>", "<none>"].map(
        (text): [keyof PaginationMessages, string] => [key, text],
      ),
    ),
  )("renders %s given as %j as text", (key, text) => {
    const entry =
      typeof defaultPagerMessages[key] === "function" ? () => text : text;
    mount({
      ...shownBy(key),
      messages: { [key]: entry },
    });
    const words = [
      document.body.textContent,
      ...[...document.body.querySelectorAll("[aria-label]")].map(
        (element) => element.getAttribute("aria-label") ?? "",
      ),
    ].join("\n");
    expect(words).toContain(text);
    expect(document.body.querySelector("img, none")).toBeNull();
  });
});

// @spec("PAGE-39", "19afc27d")
describe("PAGE-39", () => {
  it("holds the line in an element that, up to the nav, has no aria-live and no live role", async () => {
    const { rerender } = mount({ offset: 0, limit: 10, total: 57 });
    await rerender({ offset: 10 });
    const line = within(nav()).getByText("Showing 11 to 20 of 57 rows");
    const chain: Element[] = [];
    for (let at: Element | null = line; at !== null; at = at.parentElement) {
      chain.push(at);
      if (at === nav()) break;
    }
    expect(chain.at(-1)).toBe(nav());
    // No element of the pager has a live role, given or implicit (an output element is a status)
    for (const role of ["status", "alert", "log"])
      expect(within(nav()).queryAllByRole(role)).toEqual([]);
    for (const element of chain) {
      expect(element.hasAttribute("aria-live")).toBe(false);
      expect(["status", "alert", "log"]).not.toContain(
        element.getAttribute("role"),
      );
    }
  });
});

// @spec("PAGE-40", "e030c81e")
describe("PAGE-40", () => {
  it.each<[string, number[]]>([
    ["sizes [10, 25]", [10, 25]],
    ["sizes []", []],
  ])(
    "with %s puts the line after the page-size select, if any, and before First page",
    (_case, sizes) => {
      mount({ offset: 100, limit: 10, total: 200, sizes });
      const line = within(nav()).getByText("Showing 101 to 110 of 200 rows");
      expect(follows(line, button("First page"))).toBe(true);
      const select = within(nav()).queryByRole("combobox");
      if (sizes.length > 0) expect(follows(select!, line)).toBe(true);
      else
        expect(
          [...nav().querySelectorAll("*")].every(
            (element) =>
              element === line ||
              follows(line, element) ||
              element.contains(line),
          ),
        ).toBe(true);
    },
  );
});
