import type { PaginationProps } from "./types.ts";
import { firstFault, hasDuplicate, isEmpty } from "./checks.js";

// pageNumbers is adapted from vincjo/datatables' createPagesWithEllipsis (src/lib/src/server/
// AbstractTableHandler.svelte.ts, commit fe6f7bb1), MIT License, Copyright (c) 2020 vincjo (full text in NOTICE).
// Changed: 0-based pages, named gaps, no page array, a pure function.
export type PageItem = number | "gap-start" | "gap-end";

// The number row for page index `current` of `pages` pages: a page index, or a named gap (two need distinct keys);
// at most seven places (PAGE-02)
export function pageNumbers(current: number, pages: number): PageItem[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index);
  const last = pages - 1;
  if (current <= 3) return [0, 1, 2, 3, 4, "gap-end", last];
  if (current >= pages - 4)
    return [0, "gap-start", last - 4, last - 3, last - 2, last - 1, last];
  return [0, "gap-start", current - 1, current, current + 1, "gap-end", last];
}

// Every field is meaningful only for input validatePager accepts
export interface PagerState {
  // The number of pages, at least 1
  pages: number;
  // The page that holds `offset`; past the end, the last page (PAGE-25)
  page: number;
  // The current page, or null while `offset` is above 0 and at or past `total` (PAGE-25)
  current: number | null;
  canPrevious: boolean;
  canNext: boolean;
  previous: number;
  next: number;
  last: number;
  // The information line's first and last row, counted from 1; both 0 with no row on the page (PAGE-37)
  firstRow: number;
  lastRow: number;
}

// Where the pager stands, from the section 8 preamble: every target is on the page grid (PAGE-27)
export function pagerState(
  offset: number,
  limit: number,
  total: number,
): PagerState {
  const pages = Math.max(1, Math.ceil(total / limit));
  const last = (pages - 1) * limit;
  // Past the end: the last page, with no current page and no row (PAGE-25, PAGE-37); Previous goes to the last page
  // (PAGE-26)
  if (offset > 0 && offset >= total)
    return {
      pages,
      page: pages,
      current: null,
      canPrevious: true,
      canNext: false,
      previous: last,
      // Stryker disable next-line ArithmeticOperator: equivalent, Next is disabled past the end (canNext), so its target is never used
      next: pages * limit,
      last,
      firstRow: 0,
      lastRow: 0,
    };
  const page = Math.floor(offset / limit) + 1;
  // No rows are passed in, so the last row is the smaller of offset + limit and total (PAGE-37); with no row on the
  // page (a total of 0), first and last are 0
  const lastRow = Math.min(offset + limit, total);
  return {
    pages,
    page,
    current: page,
    canPrevious: offset > 0,
    // The page that holds `offset` ends before `total` (PAGE-05)
    canNext: page * limit < total,
    previous: Math.max(0, (page - 2) * limit),
    next: page * limit,
    last,
    firstRow: lastRow === 0 ? 0 : offset + 1,
    lastRow,
  };
}

// The alert keys of PAGE-16
export type PagerFault =
  | "totalInvalid"
  | "offsetInvalid"
  | "limitInvalid"
  | "labelEmpty"
  | "sizesInvalid"
  | "limitNotInSizes"
  | "pageHandlerMissing"
  | "sizeHandlerMissing"
  | "unfilteredTotalInvalid";

export const isCount = (value: unknown): boolean =>
  Number.isSafeInteger(value) && (value as number) >= 0;
const isSize = (value: unknown): boolean => isCount(value) && value !== 0;

// The message key of the first fault, in the order of PAGE-16's table, or null when the input is valid
export function validatePager(input: PaginationProps): PagerFault | null {
  const { offset, limit, total, label, onpage, onsize } = input;
  // sizes given as null is no sizes, as left out (PAGE-15)
  const sizes = input.sizes ?? [];
  return firstFault<PagerFault>([
    ["totalInvalid", () => !isCount(total)],
    ["offsetInvalid", () => !isCount(offset)],
    ["limitInvalid", () => !isSize(limit)],
    ["labelEmpty", () => isEmpty(label)],
    [
      "sizesInvalid",
      () =>
        !Array.isArray(sizes) || !sizes.every(isSize) || hasDuplicate(sizes),
    ],
    ["limitNotInSizes", () => sizes.length > 0 && !sizes.includes(limit)],
    ["pageHandlerMissing", () => typeof onpage !== "function"],
    [
      "sizeHandlerMissing",
      () => sizes.length > 0 && typeof onsize !== "function",
    ],
    // unfilteredTotal given as null is not given (PAGE-16)
    [
      "unfilteredTotalInvalid",
      () => input.unfilteredTotal != null && !isCount(input.unfilteredTotal),
    ],
  ]);
}
