import { describe, expect, it } from "vitest";
import { buildPriceChangePayload } from "../price-change-form";

describe("buildPriceChangePayload", () => {
  it("returns null when price and HPP are unchanged", () => {
    expect(
      buildPriceChangePayload({
        productId: "product-1",
        currentPrice: 15000,
        currentCostPrice: 9000,
        nextPrice: "15000",
        nextCostPrice: "9000.00",
        note: "No change",
      }),
    ).toBeNull();
  });

  it("builds an update payload with optional note when price changes", () => {
    expect(
      buildPriceChangePayload({
        productId: "product-1",
        currentPrice: 15000,
        currentCostPrice: 9000,
        nextPrice: "17000",
        nextCostPrice: "9000",
        note: "Harga supplier naik",
      }),
    ).toEqual({
      id: "product-1",
      price: 17000,
      costPrice: 9000,
      priceChangeNote: "Harga supplier naik",
    });
  });

  it("stores blank HPP as null when HPP is cleared", () => {
    expect(
      buildPriceChangePayload({
        productId: "product-1",
        currentPrice: 15000,
        currentCostPrice: 9000,
        nextPrice: "15000",
        nextCostPrice: "",
        note: "",
      }),
    ).toEqual({
      id: "product-1",
      price: 15000,
      costPrice: null,
      priceChangeNote: undefined,
    });
  });
});
