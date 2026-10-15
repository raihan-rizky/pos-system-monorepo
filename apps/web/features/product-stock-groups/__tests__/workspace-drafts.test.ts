import { describe, expect, it, vi } from "vitest";
import {
  parseNumber,
  conversionResult,
  additionResult,
  stockInUnit,
} from "../workspace-drafts";
import { fetchStockGroupHistory, updateVariantPrice } from "../api/stock-group-api";
import { stockGroupHistoryKey } from "../hooks/useStockGroup";

export const detail = {
  id: "group-1",
  displayName: "Kertas",
  baseUnit: "pcs",
  baseStock: 120,
  hasNegativeStock: false,
  variants: [
    {
      id: "pcs",
      name: "Kertas",
      sku: "P",
      unit: "pcs",
      unitMultiplierToBase: 1,
      stock: 120,
      price: 1000,
      costPrice: null,
      conversionNeedsReview: false,
    },
    {
      id: "pack",
      name: "Kertas",
      sku: "K",
      unit: "pack",
      unitMultiplierToBase: 10,
      stock: 12,
      price: 9000,
      conversionNeedsReview: false,
    },
    {
      id: "dus",
      name: "Kertas",
      sku: "D",
      unit: "dus",
      unitMultiplierToBase: 40,
      stock: 3,
      price: 30000,
      conversionNeedsReview: false,
    },
  ],
};
describe("workspace drafts", () => {
  it("preserves HTTP conflict status even if the server message has no conflict words", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ message: "Periksa persediaan" }) }));
    await expect(updateVariantPrice("group-1", "pcs", { price: 1000 })).rejects.toMatchObject({ status: 409, message: "Periksa persediaan" });
    vi.unstubAllGlobals();
  });
  it("does not turn missing quantities into zero and preserves physical stock", () => {
    expect(parseNumber(" ")).toBeNull();
    expect(parseNumber("no")).toBeNull();
    expect(parseNumber("0")).toBe(0);
    expect(stockInUnit("12", 10, 40)).toBe("3");
    expect(stockInUnit("", 10, 40)).toBe("");
  });
  it("resolves indirect pairs for all units and changes base with the server resolver", () => {
    const draft = {
      editMode: "PAIR" as const,
      baseProductId: "pack",
      fromProductId: "dus",
      fromQuantity: "1",
      toProductId: "pack",
      toQuantity: "5",
      mode: "KEEP_SHARED_STOCK" as const,
      directMultipliers: {},
    };
    const result = conversionResult(detail, draft);
    expect(result.error).toBeNull();
    expect(result.resolved?.nextBaseStock).toBe(12);
    expect(
      result.resolved?.preview.find((p) => p.productId === "dus")
        ?.newDisplayStock,
    ).toBe(2.4);
    expect(result.payload?.conversionPairs).toHaveLength(2);
    expect(
      conversionResult(detail, { ...draft, fromQuantity: "" }).resolved,
    ).toBeNull();
    expect(
      conversionResult(detail, { ...draft, toProductId: "dus" }).resolved,
    ).toBeNull();
  });
  it("new unit stock comes from group and rejects duplicate units or blank price", () => {
    const draft = {
      unit: "palet",
      price: "50000",
      costPrice: "",
      stock: "999",
      minStock: "5",
      conversionFromQuantity: "1",
      conversionToProductId: "dus",
      conversionToQuantity: "2",
      note: "",
    };
    expect(additionResult(detail, draft).payload?.stock).toBe(1.5);
    expect(
      additionResult(detail, { ...draft, unit: " PCS " }).payload,
    ).toBeNull();
    expect(additionResult(detail, { ...draft, price: "" }).payload).toBeNull();
  });
  it("requests real history with every cache identity and cancellation", async () => {
    const signal = new AbortController().signal;
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], pagination: { page: 2 } }),
      });
    vi.stubGlobal("fetch", fetchMock);
    await fetchStockGroupHistory("group-1", "conversion", 2, signal);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/product-stock-groups/group-1/history?tab=conversion&page=2&limit=20",
      { signal },
    );
    expect(stockGroupHistoryKey("group-1", "conversion", 2)).not.toEqual(
      stockGroupHistoryKey("group-1", "activity", 2),
    );
    vi.unstubAllGlobals();
  });
});
