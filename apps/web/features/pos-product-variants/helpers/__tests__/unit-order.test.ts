import { describe, expect, it } from "vitest";
import { orderUnits } from "../unit-order";

describe("orderUnits", () => {
  it("orders known unit factors from small to large without mutating input", () => {
    const variants = [
      { id: "bal", unit: "Bal", unitMultiplierToBase: 20, price: 1000 },
      { id: "dus", unit: "Dus", unitMultiplierToBase: 1, price: 9000 },
    ];

    expect(orderUnits(variants).map((variant) => variant.id)).toEqual([
      "dus",
      "bal",
    ]);
    expect(variants[0].id).toBe("bal");
  });

  it("uses the declared base unit and puts unknown or invalid factors last", () => {
    const variants = [
      { id: "unknown", unit: "Pack", unitMultiplierToBase: null },
      { id: "base", unit: "Pcs", unitMultiplierToBase: null },
      { id: "invalid", unit: "Dus", unitMultiplierToBase: 0 },
      { id: "known", unit: "Rim", unitMultiplierToBase: 5 },
    ];

    expect(orderUnits(variants, "Pcs").map((variant) => variant.id)).toEqual([
      "base",
      "known",
      "invalid",
      "unknown",
    ]);
  });

  it("orders equal factors deterministically by unit and id", () => {
    const variants = [
      { id: "b", unit: "Box", unitMultiplierToBase: 2 },
      { id: "a", unit: "Box", unitMultiplierToBase: 2 },
      { id: "c", unit: "Bal", unitMultiplierToBase: 2 },
    ];

    expect(orderUnits(variants).map((variant) => variant.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});
