import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("products page inventory workflow surfaces", () => {
  it("passes action-specific permissions and requires both permissions to create or join", () => {
    const source = readFileSync(join(process.cwd(), "app/(main)/products/ProductsClientPage.tsx"), "utf8");
    const workspace = source.match(/<StockGroupWorkspaceModal\b[\s\S]*?\/>/)?.[0] ?? "";
    expect(workspace).toContain("canUpdateProducts={canUpdateProducts}");
    expect(workspace).toContain("canCreateProducts={canCreateProducts}");
    expect(workspace).toContain("canUpdateStock={canUpdateInventory}");
    expect(source).toMatch(/canUpdateProducts && canUpdateInventory && selectedProductIds.size >= 2/);
    expect(source).toContain("Buat atau gabungkan grup stok");
    expect(source).toMatch(/<BulkStockGroupDrawer[\s\S]*?products=\{selectedProducts\}/);
  });
  it("does not wire stock logs or stock history tabs into products", () => {
    const source = readFileSync(
      join(process.cwd(), "app/(main)/products/ProductsClientPage.tsx"),
      "utf8",
    );

    expect(source).not.toContain("StockLogsTab");
    expect(source).not.toContain("StockHistoryTab");
    expect(source).not.toContain("Riwayat Stok");
    expect(source).not.toContain("Stock Logs");
    expect(source).not.toContain("StockUpdateModal");
  });
});
