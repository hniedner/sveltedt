import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import Pagination from "./Pagination.svelte";
import type { PaginationProps } from "./types.ts";

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
