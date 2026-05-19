import { describe, it, expect } from "vitest";
import {
  clampPage,
  getPageSlice,
  buildPageWindow,
} from "../pos-pagination";

describe("clampPage", () => {
  it("clamps to 1 when totalPages is 0", () => {
    expect(clampPage(5, 0)).toBe(1);
  });

  it("keeps the page when in range", () => {
    expect(clampPage(3, 5)).toBe(3);
  });

  it("clamps to totalPages when over", () => {
    expect(clampPage(10, 4)).toBe(4);
  });

  it("clamps to 1 when under", () => {
    expect(clampPage(0, 4)).toBe(1);
    expect(clampPage(-2, 4)).toBe(1);
  });
});

describe("getPageSlice", () => {
  const items = Array.from({ length: 23 }, (_, i) => i + 1);

  it("returns the requested page slice", () => {
    expect(getPageSlice(items, 1, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(getPageSlice(items, 2, 10)).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
    expect(getPageSlice(items, 3, 10)).toEqual([21, 22, 23]);
  });

  it("returns an empty slice for an out-of-range page", () => {
    expect(getPageSlice(items, 99, 10)).toEqual([]);
  });

  it("falls back to a sane page size when given non-positive values", () => {
    expect(getPageSlice(items, 1, 0)).toEqual(items);
  });
});

describe("buildPageWindow", () => {
  it("shows all pages when total <= window", () => {
    expect(buildPageWindow(1, 3, 1)).toEqual([1, 2, 3]);
    expect(buildPageWindow(2, 5, 1)).toEqual([1, 2, 3, 4, 5]);
  });

  it("adds a leading ellipsis near the end", () => {
    expect(buildPageWindow(10, 10, 1)).toEqual([1, "…", 9, 10]);
  });

  it("adds a trailing ellipsis near the start", () => {
    expect(buildPageWindow(1, 10, 1)).toEqual([1, 2, "…", 10]);
  });

  it("adds both ellipses in the middle", () => {
    expect(buildPageWindow(5, 10, 1)).toEqual([1, "…", 4, 5, 6, "…", 10]);
  });

  it("omits ellipses when adjacent pages would be skipped by only one", () => {
    // current=3, total=10, siblings=1 -> window [2..4]; gap to 1 is none, gap to 10 is 5 -> trailing …
    expect(buildPageWindow(3, 10, 1)).toEqual([1, 2, 3, 4, "…", 10]);
  });
});
