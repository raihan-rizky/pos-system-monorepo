import { describe, expect, it } from "vitest";
import { buildProductPriceLogEntries } from "../price-log-entries";

const actor = {
  id: "user-1",
  name: "Owner",
};

describe("buildProductPriceLogEntries", () => {
  it("builds baseline entries for price and HPP on product creation", () => {
    const entries = buildProductPriceLogEntries({
      productId: "product-1",
      storeId: "store-1",
      before: null,
      after: { price: 15000, costPrice: 9000 },
      actor,
      source: "MANUAL",
      note: "Harga awal",
    });

    expect(entries).toEqual([
      {
        productId: "product-1",
        storeId: "store-1",
        field: "PRICE",
        oldValue: null,
        newValue: "15000.00",
        source: "MANUAL",
        note: "Harga awal",
        changedBy: "user-1",
        changedByName: "Owner",
      },
      {
        productId: "product-1",
        storeId: "store-1",
        field: "COST_PRICE",
        oldValue: null,
        newValue: "9000.00",
        source: "MANUAL",
        note: "Harga awal",
        changedBy: "user-1",
        changedByName: "Owner",
      },
    ]);
  });

  it("builds entries only for changed normalized price fields", () => {
    const entries = buildProductPriceLogEntries({
      productId: "product-1",
      storeId: "store-1",
      before: { price: "15000.00", costPrice: null },
      after: { price: 15000, costPrice: 10000 },
      actor,
      source: "API",
      note: "Update HPP",
    });

    expect(entries).toEqual([
      {
        productId: "product-1",
        storeId: "store-1",
        field: "COST_PRICE",
        oldValue: null,
        newValue: "10000.00",
        source: "API",
        note: "Update HPP",
        changedBy: "user-1",
        changedByName: "Owner",
      },
    ]);
  });
});
