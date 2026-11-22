import { render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import { watchListeners } from "../../test/footprint.ts";
import PagerListenerControl from "../../test/PagerListenerControl.svelte";
import Pagination from "./Pagination.svelte";
import type { PaginationProps } from "./types.ts";

// A pager with sizes, and the offset of the rerender step
const pager: PaginationProps = {
  offset: 0,
  limit: 10,
  total: 95,
  label: "Pages of orders",
  sizes: [10, 25],
  onpage: () => undefined,
  onsize: () => undefined,
};
const nextOffset = { offset: 50 };

// @spec("PAGE-31", "c9b7243e")
describe("PAGE-31", () => {
  it("leaves the root element's attributes and inline style unchanged through mount, a rerender and unmount", async () => {
    const root = document.documentElement;
    const snapshot = (): string[] => [
      ...[...root.attributes].map(({ name, value }) => `${name}=${value}`),
      root.style.cssText,
    ];
    const before = snapshot();
    const { rerender, unmount } = render(Pagination, pager);
    expect(snapshot()).toEqual(before);
    await rerender(nextOffset);
    expect(snapshot()).toEqual(before);
    unmount();
    expect(snapshot()).toEqual(before);
  });
});

// @spec("PAGE-32", "3e6a8fe9")
describe("PAGE-32", () => {
  it("holds no listener of its own on document or window while mounted or after unmount", async () => {
    try {
      const own = watchListeners(PagerListenerControl);
      const { rerender, unmount } = render(Pagination, pager);
      expect(own()).toEqual([]);
      await rerender(nextOffset);
      expect(own()).toEqual([]);
      unmount();
      expect(own()).toEqual([]);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
