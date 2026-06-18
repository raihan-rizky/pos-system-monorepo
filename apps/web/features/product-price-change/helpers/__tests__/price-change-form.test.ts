import { describe, expect, it } from "vitest";
import { buildPriceChangePayload } from "../price-change-form";

describe("buildPriceChangePayload", () => {
  it("returns null when price and HPP are unchanged", () => {
    expect(
      buildPriceChangePayload({
        productId: "product-1",
        currentPrice: 15000,
        currentCostPrice: 9000,
        currentHargaDinas: 18000,
        nextPrice: "15000",
        nextCostPrice: "9000.00",
        nextHargaDinas: "18000",
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
        currentHargaDinas: 18000,
        nextPrice: "17000",
        nextCostPrice: "9000",
        nextHargaDinas: "18000",
        note: "Harga supplier naik",
      }),
    ).toEqual({
      id: "product-1",
      price: 17000,
      costPrice: 9000,
      hargaDinas: 18000,
      priceChangeNote: "Harga supplier naik",
    });
  });

  it("stores blank HPP as null when HPP is cleared", () => {
    expect(
      buildPriceChangePayload({
        productId: "product-1",
        currentPrice: 15000,
        currentCostPrice: 9000,
        currentHargaDinas: 18000,
        nextPrice: "15000",
        nextCostPrice: "",
        nextHargaDinas: "",
        note: "",
      }),
    ).toEqual({
      id: "product-1",
      price: 15000,
      costPrice: null,
      hargaDinas: null,
      priceChangeNote: undefined,
    });
  });

  it("builds an update payload when only Harga Dinas changes", () => {
    expect(
      buildPriceChangePayload({
        productId: "product-1",
        currentPrice: 15000,
        currentCostPrice: 9000,
        currentHargaDinas: null,
        nextPrice: "15000",
        nextCostPrice: "9000",
        nextHargaDinas: "20000",
        note: "",
      }),
    ).toEqual({
      id: "product-1",
      price: 15000,
      costPrice: 9000,
      hargaDinas: 20000,
      priceChangeNote: undefined,
    });
  });
});
