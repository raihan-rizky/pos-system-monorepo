import { describe, expect, it } from "vitest";
import { buildTransactionStockJournal } from "../transaction-stock-journal";

describe("buildTransactionStockJournal", () => {
  it("records the exact grouped base delta across duplicate product lines", () => {
    const rows = buildTransactionStockJournal({
      transactionId: "tx-1",
      inventoryRows: [
        { productId: "product-1", quantity: 2, type: "OUT", reason: "SALE", unitCost: 500, note: "sale", createdBy: "u1", person: "Cashier" },
        { productId: "product-1", quantity: 1, type: "OUT", reason: "USAGE", unitCost: 500, note: "usage", createdBy: "u1", person: "Cashier" },
      ],
      stockMovements: [
        { productId: "product-1", stockGroupId: "group-1", baseDelta: -12 },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        transactionId: "tx-1",
        sourceTransactionRef: "tx-1",
        stockGroupIdSnapshot: "group-1",
        unitMultiplierSnapshot: 4,
        stockBaseDelta: -8,
      }),
      expect.objectContaining({ stockBaseDelta: -4 }),
    ]);
    expect(rows.reduce((sum, row) => sum + row.stockBaseDelta, 0)).toBe(-12);
  });

  it("records standalone movement using its product stock and a unit multiplier of one", () => {
    expect(
      buildTransactionStockJournal({
        transactionId: "tx-2",
        inventoryRows: [
          { productId: "product-2", quantity: 3, type: "OUT", reason: "SALE", unitCost: 500, note: "sale", createdBy: "u1", person: "Cashier" },
        ],
        stockMovements: [
          { productId: "product-2", stockGroupId: null, baseDelta: -3 },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        stockGroupIdSnapshot: null,
        unitMultiplierSnapshot: 1,
        stockBaseDelta: -3,
      }),
    ]);
  });

  it("fails closed when a log row has no matching stock movement", () => {
    expect(() =>
      buildTransactionStockJournal({
        transactionId: "tx-3",
        inventoryRows: [
          { productId: "missing", quantity: 1, type: "OUT", reason: "SALE", unitCost: null, note: "sale", createdBy: "u1", person: null },
        ],
        stockMovements: [],
      }),
    ).toThrow("Bukti perubahan stok tidak lengkap.");
  });
});
