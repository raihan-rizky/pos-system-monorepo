import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildProductStockFilter,
  matchesStockFilter,
  loadStockOnlyPreference,
  saveStockOnlyPreference,
  STOCK_ONLY_STORAGE_KEY,
} from "../pos-stock-filter";

describe("buildProductStockFilter", () => {
  it("returns undefined when inStockOnly is false so callers can omit the filter", () => {
    expect(buildProductStockFilter(false)).toBeUndefined();
  });

  it("emits a Prisma fragment requiring stock greater than zero", () => {
    expect(buildProductStockFilter(true)).toEqual({ stock: { gt: 0 } });
  });
});

describe("matchesStockFilter", () => {
  it("returns true when the filter is disabled regardless of stock", () => {
    expect(matchesStockFilter({ stock: 0 }, false)).toBe(true);
    expect(matchesStockFilter({ stock: -3 }, false)).toBe(true);
    expect(matchesStockFilter({ stock: 12 }, false)).toBe(true);
  });

  it("keeps only products with positive stock when enabled", () => {
    expect(matchesStockFilter({ stock: 1 }, true)).toBe(true);
    expect(matchesStockFilter({ stock: 100 }, true)).toBe(true);
    expect(matchesStockFilter({ stock: 0 }, true)).toBe(false);
    expect(matchesStockFilter({ stock: -1 }, true)).toBe(false);
  });

  it("treats missing or non-numeric stock as out of stock when filtering", () => {
    expect(matchesStockFilter({}, true)).toBe(false);
    expect(matchesStockFilter({ stock: undefined }, true)).toBe(false);
    expect(matchesStockFilter({ stock: Number.NaN }, true)).toBe(false);
  });
});

describe("stock-only preference persistence", () => {
  const storage = new Map<string, string>();
  const fakeLocalStorage = {
    getItem: (key: string) => (storage.has(key) ? storage.get(key)! : null),
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => storage.clear(),
  };

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", fakeLocalStorage);
    vi.stubGlobal("window", { localStorage: fakeLocalStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to false when nothing is stored", () => {
    expect(loadStockOnlyPreference()).toBe(false);
  });

  it("round-trips a true value through localStorage", () => {
    saveStockOnlyPreference(true);
    expect(storage.get(STOCK_ONLY_STORAGE_KEY)).toBe("1");
    expect(loadStockOnlyPreference()).toBe(true);
  });

  it("round-trips a false value as a removed key to keep storage tidy", () => {
    saveStockOnlyPreference(true);
    saveStockOnlyPreference(false);
    expect(storage.has(STOCK_ONLY_STORAGE_KEY)).toBe(false);
    expect(loadStockOnlyPreference()).toBe(false);
  });

  it("returns false safely when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("window", undefined);
    expect(loadStockOnlyPreference()).toBe(false);
    expect(() => saveStockOnlyPreference(true)).not.toThrow();
  });
});
