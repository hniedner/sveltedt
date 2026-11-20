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

// @spec("PAGE-04", "60fec150")
describe("PAGE-04", () => {
  it("marks Page 2 and nothing else with aria-current", () => {
    mount({ offset: 25, limit: 25, total: 130 });
    expect(button("Page 2").getAttribute("aria-current")).toBe("page");
    expect(current()).toEqual(["Page 2=page"]);
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
