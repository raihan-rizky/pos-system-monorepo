import { describe, expect, it } from "vitest";
import { createPricingTestDatabase } from "./pricing-test-database";

describe("pricing database fixture scope", () => {
  it("honors active/group/store filters while unfiltered pricing reads retain inactive members", async () => {
    const { tx, products } = createPricingTestDatabase();
    products[1].isActive = false;
    products.push({ ...products[0], id: "foreign-group", stockGroupId: "other-group" });
    const scoped = await tx.productStockGroup.findFirst({ where: { id: "group-1", storeId: "store-main" }, include: { products: { where: { isActive: true } } } });
    expect(scoped?.products.map(p => p.id)).toEqual(["rim"]);
    const all = await tx.productStockGroup.findFirst({ where: { id: "group-1", storeId: "store-main" }, include: { products: true } });
    expect(all?.products.map(p => p.id)).toEqual(["rim", "dus"]);
    expect(await tx.productStockGroup.findFirst({ where: { id: "group-1", storeId: "foreign-store" } })).toBeNull();
    for (const where of [
      { id: "dus", isActive: true }, { id: "rim", stockGroupId: "other-group" }, { id: "rim", storeId: "foreign-store" },
    ]) expect(await tx.product.findFirst({ where })).toBeNull();
    expect((await tx.product.findFirst({ where: { id: "dus", isActive: false, stockGroupId: "group-1", storeId: "store-main" } }))?.id).toBe("dus");
  });
});
