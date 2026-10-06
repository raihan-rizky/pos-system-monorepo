import { describe, expect, it } from "vitest";
import { parseCartQuantity } from "../cart-quantity";

describe("parseCartQuantity", () => {
  it("rejects empty, non-positive, and partially numeric editing values", () => {
    for (const text of ["", "0", "-1", "NaN", "Infinity", "2x", "1e2", "2.5", "2,5", "9007199254740992"]) {
      expect(parseCartQuantity(text)).toBeNull();
    }
  });

  it("accepts positive safe integer quantities", () => {
    expect(parseCartQuantity(" 12 ")).toBe(12);
    expect(parseCartQuantity("2")).toBe(2);
  });
});
