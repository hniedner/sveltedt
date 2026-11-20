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
