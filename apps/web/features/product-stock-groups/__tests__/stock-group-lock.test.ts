import { describe, expect, it, vi } from "vitest";

import {
  lockProductStockGroupRow,
  lockStockMutationRows,
  StockMutationConflictError,
  isStockMutationConflict,
} from "../stock-group-lock";

function tableName(strings: TemplateStringsArray) {
  const sql = strings.join(" ");
  if (sql.includes("pos_product_stock_groups")) return "group";
  if (sql.includes("pos_products")) return "product";
  return "unknown";
}

describe("shared stock writer lock protocol", () => {
  it("locks unique groups first, then products, with each set sorted by id", async () => {
    const order: string[] = [];
    const queryRaw = vi.fn(
      async (strings: TemplateStringsArray, rowId: string) => {
        const table = tableName(strings);
        order.push(`${table}:${rowId}`);
        return rowId === "group-missing" ? [] : [{ id: rowId }];
      },
    );

    const result = await lockStockMutationRows(
      { $queryRaw: queryRaw } as never,
      {
        storeId: "store-main",
        stockGroupIds: ["group-z", "group-a", "group-z", "group-missing"],
        productIds: ["product-z", "product-a", "product-a"],
      },
    );

    expect(order).toEqual([
      "group:group-a",
      "group:group-missing",
      "group:group-z",
      "product:product-a",
      "product:product-z",
    ]);
    expect(result).toEqual({
      stockGroupIds: ["group-a", "group-missing", "group-z"],
      productIds: ["product-a", "product-z"],
      lockedStockGroupIds: ["group-a", "group-z"],
      lockedProductIds: ["product-a", "product-z"],
    });
  });

  it("keeps the tenant-scoped single-group lock primitive", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);

    await expect(
      lockProductStockGroupRow(
        { $queryRaw: queryRaw } as never,
        { storeId: "store-main", stockGroupId: "group-other-tenant" },
      ),
    ).resolves.toBe(false);
  });

  it("recognizes stale relationships and Prisma serialization conflicts", () => {
    expect(
      isStockMutationConflict(
        new StockMutationConflictError("Produk berpindah grup saat diproses"),
      ),
    ).toBe(true);
    expect(isStockMutationConflict({ code: "P2034" })).toBe(true);
    expect(isStockMutationConflict(new Error("ordinary failure"))).toBe(false);
  });
});
