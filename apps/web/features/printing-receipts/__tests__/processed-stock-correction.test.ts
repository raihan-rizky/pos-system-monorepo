import { describe, expect, it } from "vitest";
import type { Prisma } from "@pos/db";
import { applyProcessedMaterialCorrections } from "../server/processed-stock-correction";

function fixture() {
  const state = { baseStock: 0, locks: [] as string[], changes: [] as number[] };
  const products = ["a", "z"].map(id => ({ id, stockGroupId: "group", unitMultiplierToBase: 1, conversionNeedsReview: false }));
  const tx = {
    $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => { state.locks.push(`${sql.join("?")}:${values[0]}`); return [{ id: values[0] }]; },
    product: { findMany: async ({ where }: any) => products.filter(row => where.id.in.includes(row.id)).map(row => ({ ...row, stock: 0, stockGroup: { id: "group", baseStock: state.baseStock } })) },
    productStockGroup: { updateMany: async ({ where, data }: any) => {
      expect(state.locks.some(row => row.includes("pos_product_stock_groups") && row.endsWith(":group"))).toBe(true);
      expect(state.locks.some(row => row.includes("pos_products") && row.endsWith(":a"))).toBe(true);
      expect(state.locks.some(row => row.includes("pos_products") && row.endsWith(":z"))).toBe(true);
      const delta = data.baseStock.increment;
      if (where.baseStock && state.baseStock < where.baseStock.gte) return { count: 0 };
      state.baseStock += delta; state.changes.push(delta); return { count: 1 };
    } },
  } as unknown as Prisma.TransactionClient;
  return { state, tx, products };
}

describe("processed receipt material correction batches", () => {
  it("returns old materials before consuming their replacement from the same empty stock group", async () => {
    const { state, tx, products } = fixture();
    const movements = await applyProcessedMaterialCorrections(tx, { storeId: "store", products, deltas: [{ productId: "a", delta: -1 }, { productId: "z", delta: 1 }] });
    expect(state.changes).toEqual([1, -1]); expect(state.baseStock).toBe(0);
    expect(movements).toEqual([expect.objectContaining({ productId: "z", baseDelta: 1 }), expect.objectContaining({ productId: "a", baseDelta: -1 })]);
  });
  it("continues to reject insufficient stock after all returns, without allowing negative stock", async () => {
    const { tx, products } = fixture();
    await expect(applyProcessedMaterialCorrections(tx, { storeId: "store", products, deltas: [{ productId: "a", delta: -2 }, { productId: "z", delta: 1 }] })).rejects.toThrow("INSUFFICIENT_STOCK");
  });
});
