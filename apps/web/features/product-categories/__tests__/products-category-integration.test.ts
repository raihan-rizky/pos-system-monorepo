import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "app/(main)/products/ProductsClientPage.tsx"), "utf8");
describe("product category integration permissions", () => {
  it("offers explicit-ID transfers for product editors and keeps stock action permission restricted", () => {
    expect(/const canSelectProducts = [^;]*canUpdateProducts/.test(source)).toBe(true);
    expect(/canUpdateProducts && \([\s\S]*?Pindahkan Kategori/.test(source)).toBe(true);
    expect(/canUpdateInventory && \([\s\S]*?Stok Massal/.test(source)).toBe(true);
    expect(/<MoveProductsDialog[\s\S]*?productIds=\{Array.from\(selectedProductIds\)\}/.test(source)).toBe(true);
    expect(/onMoved=\{[\s\S]*?clearSelection\(\)/.test(source)).toBe(true);
  });
  it("provides the category workspace and clears deleted category filters", () => {
    expect(source.includes('id: "categories" as PageTab')).toBe(true);
    expect(/<CategoryManagementTab[\s\S]*?onDeleted=\{[\s\S]*?includes\(categoryId\)[\s\S]*?setCategoryId\(""\)/.test(source)).toBe(true);
  });
});
