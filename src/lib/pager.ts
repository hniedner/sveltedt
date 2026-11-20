// pageNumbers is adapted from vincjo/datatables, src/lib/src/server/AbstractTableHandler.svelte.ts, commit fe6f7bb1,
// MIT License, Copyright (c) 2020 vincjo (full text in NOTICE). Changed: 0-based pages, named gaps, no page array, a
// pure function.
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
  };
}
