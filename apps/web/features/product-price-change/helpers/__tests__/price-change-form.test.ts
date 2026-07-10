import { describe, expect, it } from "vitest";
import { buildPriceChangePayload } from "../price-change-form";

describe("buildPriceChangePayload", () => {
  it("separates permanent POS prices from a transaction-only price", async () => {
    const priceFormModule = await import("../price-change-form");
    const buildPosCartPriceUpdate = (
      priceFormModule as typeof priceFormModule & {
        buildPosCartPriceUpdate?: (input: {
          productId: string;
          currentPrice: number;
          currentHargaDinas: number | null;
          currentHargaAgen: number | null;
          nextPrice: string;
          nextHargaDinas: string;
          nextHargaAgen: string;
          transactionPrice: string;
          note: string;
        }) => {
          masterUpdate: {
            id: string;
            price: number;
            hargaDinas: number | null;
            hargaAgen: number | null;
            priceChangeNote?: string;
          } | null;
          transactionPrice: number | null;
        };
      }
    ).buildPosCartPriceUpdate;

    expect(buildPosCartPriceUpdate).toBeTypeOf("function");
    if (!buildPosCartPriceUpdate) return;

    expect(
      buildPosCartPriceUpdate({
        productId: "product-1",
        currentPrice: 10000,
        currentHargaDinas: 11000,
        currentHargaAgen: 9000,
        nextPrice: "12000",
        nextHargaDinas: "13000",
        nextHargaAgen: "",
        transactionPrice: "8000",
        note: "Harga proyek",
      }),
    ).toEqual({
      masterUpdate: {
        id: "product-1",
        price: 12000,
        hargaDinas: 13000,
        hargaAgen: null,
        priceChangeNote: "Harga proyek",
      },
      transactionPrice: 8000,
    });
  });

  it("rejects a non-positive normal price from the POS quick edit form", async () => {
    const { buildPosCartPriceUpdate } = await import("../price-change-form");

    expect(() =>
      buildPosCartPriceUpdate({
        productId: "product-1",
        currentPrice: 10000,
        currentHargaDinas: null,
        currentHargaAgen: null,
        nextPrice: "0",
        nextHargaDinas: "",
        nextHargaAgen: "",
        transactionPrice: "",
        note: "",
      }),
    ).toThrow("Harga Normal harus lebih dari 0.");
  });

  it("rejects a non-positive transaction-only price", async () => {
    const { buildPosCartPriceUpdate } = await import("../price-change-form");

    expect(() =>
      buildPosCartPriceUpdate({
        productId: "product-1",
        currentPrice: 10000,
        currentHargaDinas: null,
        currentHargaAgen: null,
        nextPrice: "10000",
        nextHargaDinas: "",
        nextHargaAgen: "",
        transactionPrice: "0",
        note: "",
      }),
    ).toThrow("Harga Khusus harus lebih dari 0.");
  });

  it("returns null when price and HPP are unchanged", () => {
    expect(
      buildPriceChangePayload({
        productId: "product-1",
        currentPrice: 15000,
        currentCostPrice: 9000,
        currentHargaDinas: 18000,
        currentHargaAgen: 16000,
        nextPrice: "15000",
        nextCostPrice: "9000.00",
        nextHargaDinas: "18000",
        nextHargaAgen: "16000",
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
        currentHargaAgen: 16000,
        nextPrice: "17000",
        nextCostPrice: "9000",
        nextHargaDinas: "18000",
        nextHargaAgen: "16000",
        note: "Harga supplier naik",
      }),
    ).toEqual({
      id: "product-1",
      price: 17000,
      costPrice: 9000,
      hargaDinas: 18000,
      hargaAgen: 16000,
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
        currentHargaAgen: 16000,
        nextPrice: "15000",
        nextCostPrice: "",
        nextHargaDinas: "",
        nextHargaAgen: "",
        note: "",
      }),
    ).toEqual({
      id: "product-1",
      price: 15000,
      costPrice: null,
      hargaDinas: null,
      hargaAgen: null,
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
        currentHargaAgen: null,
        nextPrice: "15000",
        nextCostPrice: "9000",
        nextHargaDinas: "20000",
        nextHargaAgen: "",
        note: "",
      }),
    ).toEqual({
      id: "product-1",
      price: 15000,
      costPrice: 9000,
      hargaDinas: 20000,
      hargaAgen: null,
      priceChangeNote: undefined,
    });
  });

  it("builds an update payload when only Harga Agen changes", () => {
    expect(
      buildPriceChangePayload({
        productId: "product-1",
        currentPrice: 15000,
        currentCostPrice: 9000,
        currentHargaDinas: 18000,
        currentHargaAgen: null,
        nextPrice: "15000",
        nextCostPrice: "9000",
        nextHargaDinas: "18000",
        nextHargaAgen: "16000",
        note: "",
      }),
    ).toEqual({
      id: "product-1",
      price: 15000,
      costPrice: 9000,
      hargaDinas: 18000,
      hargaAgen: 16000,
      priceChangeNote: undefined,
    });
  });
});
