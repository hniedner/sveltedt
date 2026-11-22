import type { PaginationProps } from "./types.ts";

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
  const past = offset > 0 && offset >= total;
  const page = past ? pages : Math.floor(offset / limit) + 1;
  // The answer holds every row of its page up to `total` (PAGE-37); with none, first and last are 0
  const lastRow = past ? 0 : Math.min(offset + limit, total);
  return {
    pages,
    page,
    current: past ? null : page,
    canPrevious: offset > 0,
    // The page that holds `offset` ends before `total` (PAGE-05)
    canNext: !past && page * limit < total,
    // Past the end, Previous goes to the last page (PAGE-26)
    previous: past ? (pages - 1) * limit : Math.max(0, (page - 2) * limit),
    next: page * limit,
    last: (pages - 1) * limit,
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

const isCount = (value: unknown): boolean =>
  Number.isSafeInteger(value) && (value as number) >= 0;
const isSize = (value: unknown): boolean => isCount(value) && value !== 0;

// The message key of the first fault, in the order of PAGE-16's table, or null when the input is valid
export function validatePager(input: PaginationProps): PagerFault | null {
  const { offset, limit, total, label, onpage, onsize } = input;
  // sizes given as null is no sizes, as left out (PAGE-15)
  const sizes = input.sizes ?? [];
  if (!isCount(total)) return "totalInvalid";
  if (!isCount(offset)) return "offsetInvalid";
  if (!isSize(limit)) return "limitInvalid";
  if (typeof label !== "string" || label.trim() === "") return "labelEmpty";
  if (
    !Array.isArray(sizes) ||
    !sizes.every(isSize) ||
    new Set(sizes).size !== sizes.length
  )
    return "sizesInvalid";
  if (sizes.length > 0 && !sizes.includes(limit)) return "limitNotInSizes";
  if (typeof onpage !== "function") return "pageHandlerMissing";
  if (sizes.length > 0 && typeof onsize !== "function")
    return "sizeHandlerMissing";
  // unfilteredTotal given as null is not given (PAGE-16)
  if (input.unfilteredTotal != null && !isCount(input.unfilteredTotal))
    return "unfilteredTotalInvalid";
  return null;
}
