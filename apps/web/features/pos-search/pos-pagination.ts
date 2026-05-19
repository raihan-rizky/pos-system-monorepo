export type PageWindowItem = number | "…";

const DEFAULT_PAGE_SIZE = 24;

/** Clamps a page number into the valid 1..totalPages range. */
export function clampPage(page: number, totalPages: number): number {
  if (!Number.isFinite(page) || page < 1) return 1;
  if (totalPages <= 0) return 1;
  if (page > totalPages) return totalPages;
  return Math.floor(page);
}

/** Returns the slice of items for the requested 1-based page. */
export function getPageSlice<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): T[] {
  const safeSize = pageSize > 0 ? Math.floor(pageSize) : DEFAULT_PAGE_SIZE;
  if (pageSize <= 0) return items.slice();
  const start = (Math.max(1, Math.floor(page)) - 1) * safeSize;
  if (start >= items.length) return [];
  return items.slice(start, start + safeSize);
}

/**
 * Builds a compact pagination window with ellipses, matching the
 * common `1 … 4 5 6 … 10` pattern used in product browsers.
 * `siblings` is the number of pages to show on each side of `current`.
 */
export function buildPageWindow(
  current: number,
  total: number,
  siblings = 1,
): PageWindowItem[] {
  if (total <= 0) return [];

  const safeSiblings = Math.max(0, Math.floor(siblings));
  // Show every page when the compact view wouldn't actually save space.
  // 1 (first) + 1 (last) + (2 * siblings + 1) window + 2 potential ellipsis
  const compactBudget = safeSiblings * 2 + 5;
  if (total <= compactBudget) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const left = Math.max(1, current - safeSiblings);
  const right = Math.min(total, current + safeSiblings);
  const showLeftEllipsis = left > 2;
  const showRightEllipsis = right < total - 1;

  const items: PageWindowItem[] = [1];
  if (showLeftEllipsis) {
    items.push("…");
  } else {
    for (let p = 2; p < left; p++) items.push(p);
  }

  for (let p = Math.max(left, 2); p <= Math.min(right, total - 1); p++) {
    items.push(p);
  }

  if (showRightEllipsis) {
    items.push("…");
  } else {
    for (let p = right + 1; p < total; p++) items.push(p);
  }

  items.push(total);
  return items;
}
