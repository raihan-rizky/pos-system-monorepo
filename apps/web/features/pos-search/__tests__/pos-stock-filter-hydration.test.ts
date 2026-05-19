import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STOCK_ONLY_STORAGE_KEY } from "../pos-stock-filter";
import { getInitialHideOutOfStock } from "../pos-stock-filter-hydration";

describe("getInitialHideOutOfStock", () => {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the same value during SSR and client first paint, even when the toggle was previously enabled", () => {
    // SSR pass: window is undefined.
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("localStorage", undefined);
    const ssrInitial = getInitialHideOutOfStock();

    // Client first paint: window present, localStorage holds the saved "1" value.
    storage.set(STOCK_ONLY_STORAGE_KEY, "1");
    vi.stubGlobal("localStorage", fakeLocalStorage);
    vi.stubGlobal("window", { localStorage: fakeLocalStorage });
    const clientInitial = getInitialHideOutOfStock();

    // Equality is the contract that prevents React hydration mismatches.
    expect(clientInitial).toBe(ssrInitial);
  });

  it("uses false as the SSR-safe baseline so the server can render without storage access", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("localStorage", undefined);
    expect(getInitialHideOutOfStock()).toBe(false);
  });
});
