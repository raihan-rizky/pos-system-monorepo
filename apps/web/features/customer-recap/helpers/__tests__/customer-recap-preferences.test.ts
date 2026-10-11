import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadCustomerRecapExpanded,
  saveCustomerRecapExpanded,
} from "../customer-recap-preferences";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("customer recap expanded preference", () => {
  it("defaults to collapsed when no preference is saved", () => {
    vi.stubGlobal("window", {
      localStorage: { getItem: () => null, setItem: () => undefined },
    });

    expect(loadCustomerRecapExpanded()).toBe(false);
  });

  it("restores and saves the user's expanded state", () => {
    let storedValue: string | null = null;
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => storedValue,
        setItem: (_key: string, value: string) => {
          storedValue = value;
        },
      },
    });

    saveCustomerRecapExpanded(true);
    expect(loadCustomerRecapExpanded()).toBe(true);

    saveCustomerRecapExpanded(false);
    expect(loadCustomerRecapExpanded()).toBe(false);
  });
});
