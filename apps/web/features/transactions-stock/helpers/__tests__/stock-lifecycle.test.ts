import { describe, expect, it } from "vitest";
import { collectStockItems, planOutstandingReturns } from "../stock-lifecycle";

describe("collectStockItems", () => {
  it("collects product and raw-material quantities, aggregating the same product", () => {
    expect(
      collectStockItems([
        {
          productId: "box",
          quantity: 5,
          rawMaterialProductId: "paper",
          rawMaterialQuantity: 2,
        },
        { productId: "paper", quantity: 3 },
        { productId: null, quantity: 4 },
      ]),
    ).toEqual([
      { productId: "box", quantity: 5 },
      { productId: "paper", quantity: 5 },
    ]);
  });

  it("rejects negative and non-finite quantities for a known product", () => {
    for (const quantity of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => collectStockItems([{ productId: "paper", quantity }])).toThrow(
        "Jumlah stok tidak valid.",
      );
    }
  });
});

describe("planOutstandingReturns", () => {
  it("does not return stock for drafts or pending approvals", () => {
    const unknownEntry = {
      productId: "paper",
      stockGroupIdSnapshot: null,
      baseDelta: null,
    };

    expect(planOutstandingReturns("DRAFT", [unknownEntry], true)).toEqual([]);
    expect(planOutstandingReturns("PENDING_APPROVAL", [], true)).toEqual([]);
  });

  it("requires journal proof for completed history when proof is required", () => {
    expect(() => planOutstandingReturns("COMPLETED", [], true)).toThrow("Riwayat stok");
  });

  it("returns only the net negative stock movement per product and stock group", () => {
    expect(
      planOutstandingReturns(
        "COMPLETED",
        [
          { productId: "paper", stockGroupIdSnapshot: null, baseDelta: -2 },
          { productId: "paper", stockGroupIdSnapshot: null, baseDelta: 1 },
          { productId: "paper", stockGroupIdSnapshot: "group-a", baseDelta: -4 },
          { productId: "paper", stockGroupIdSnapshot: "group-a", baseDelta: 4 },
          { productId: "ink", stockGroupIdSnapshot: null, baseDelta: -3 },
        ],
        true,
      ),
    ).toEqual([
      { productId: "paper", stockGroupIdSnapshot: null, baseDelta: 1 },
      { productId: "ink", stockGroupIdSnapshot: null, baseDelta: 3 },
    ]);
  });

  it("rejects missing, non-finite, or unidentified journal evidence", () => {
    for (const baseDelta of [null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        planOutstandingReturns(
          "COMPLETED",
          [{ productId: "paper", stockGroupIdSnapshot: null, baseDelta }],
          false,
        ),
      ).toThrow("Riwayat stok");
    }

    expect(() =>
      planOutstandingReturns(
        "COMPLETED",
        [{ productId: "", stockGroupIdSnapshot: null, baseDelta: -1 }],
        false,
      ),
    ).toThrow("Riwayat stok");
  });

  it("rejects a net positive movement instead of returning more than was deducted", () => {
    expect(() =>
      planOutstandingReturns(
        "COMPLETED",
        [
          { productId: "paper", stockGroupIdSnapshot: null, baseDelta: 2 },
          { productId: "paper", stockGroupIdSnapshot: null, baseDelta: -1 },
        ],
        true,
      ),
    ).toThrow("Riwayat stok");
  });
});
