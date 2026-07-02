import { describe, expect, it } from "vitest";
import { shouldConfirmNegativeStock } from "../checkout-validation";

describe("shouldConfirmNegativeStock", () => {
  it("returns true if any item has zero or negative stock", () => {
    expect(shouldConfirmNegativeStock([{ stock: 0 } as any])).toBe(true);
    expect(shouldConfirmNegativeStock([{ stock: 10 } as any, { stock: -2 } as any])).toBe(true);
  });

  it("returns false if all items have positive stock", () => {
    expect(shouldConfirmNegativeStock([{ stock: 1 } as any])).toBe(false);
    expect(shouldConfirmNegativeStock([])).toBe(false);
  });
});