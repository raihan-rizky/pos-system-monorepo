import { describe, expect, it } from "vitest";
import {
  buildGoodsPurchaseNumber,
  calculateGoodsPurchaseLineTotal,
  calculateGoodsPurchaseTotal,
  countPendingGoodsPurchaseItems,
  hasMasterHppDifference,
  isLargePurchaseUnit,
} from "../goods-purchase-core";

describe("goods purchase core", () => {
  it("formats PB monthly numbers", () => {
    expect(
      buildGoodsPurchaseNumber(new Date("2026-07-23T00:00:00Z"), 7),
    ).toBe("PB-202607-007");
  });

  it("rounds line and header money to two decimals", () => {
    expect(calculateGoodsPurchaseLineTotal(2.5, 1000.555)).toBe(2501.39);
    expect(
      calculateGoodsPurchaseTotal([
        { quantity: 2.5, latestUnitPrice: 1000.555 },
        { quantity: 1, latestUnitPrice: 500 },
      ]),
    ).toBe(3001.39);
  });

  it("detects HPP differences including a missing HPP", () => {
    expect(hasMasterHppDifference(null, 0)).toBe(true);
    expect(hasMasterHppDifference(10_000, 10_000)).toBe(false);
    expect(hasMasterHppDifference(10_000, 10_001)).toBe(true);
  });

  it("accepts multiplier and normalized package units", () => {
    expect(
      isLargePurchaseUnit({ unit: "pcs", unitMultiplierToBase: 12 }),
    ).toBe(true);
    expect(
      isLargePurchaseUnit({ unit: "KARTON", unitMultiplierToBase: 1 }),
    ).toBe(true);
    expect(
      isLargePurchaseUnit({ unit: "lembar", unitMultiplierToBase: 1 }),
    ).toBe(false);
  });

  it("counts only items that still need action", () => {
    expect(
      countPendingGoodsPurchaseItems([
        { reviewStatus: "PENDING" },
        { reviewStatus: "APPROVED" },
      ]),
    ).toBe(1);
  });
});
