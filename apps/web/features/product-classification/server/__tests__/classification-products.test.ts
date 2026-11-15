import { beforeEach, describe, expect, it, vi } from "vitest";
import { listClassificationProducts } from "../classification-products";

const fixture = vi.hoisted(() => ({ products: [] as any[] }));
vi.mock("@pos/db", () => ({
  db: {
    product: {
      findMany: async ({ where, select }: any) => fixture.products.filter((row) => {
        if (row.storeId !== where.storeId) return false;
        if (where.categoryId && row.categoryId !== where.categoryId) return false;
        if (typeof where.catalogSubcategoryId === "string" && row.catalogSubcategoryId !== where.catalogSubcategoryId) return false;
        if (where.catalogSubcategoryId === null && row.catalogSubcategoryId !== null) return false;
        if (where.catalogSubcategoryId?.not === null && row.catalogSubcategoryId === null) return false;
        if (where.catalogSubcategory?.is?.group && row.catalogSubcategory?.group !== where.catalogSubcategory.is.group) return false;
        if (where.OR && select?.stockGroup) return where.OR.some((condition: any) => row[Object.keys(condition)[0]]?.toLowerCase().includes(Object.values(condition)[0] && (Object.values(condition)[0] as any).contains.toLowerCase()));
        if (where.OR) return where.OR.some((condition: any) => condition.stockGroupId?.in?.includes(row.stockGroupId) || condition.id?.in?.includes(row.id));
        return true;
      }),
    },
  },
}));

beforeEach(() => {
  const base = { storeId: "store-a", categoryId: "bot", category: { id: "bot", name: "BOT" }, catalogSubcategoryId: null, catalogSubcategory: null, imageUrl: null, sku: "PULPEN", barcode: null, isActive: true, stockGroup: { displayName: "Pulpen" } };
  fixture.products = [
    { ...base, id: "pcs", name: "Pulpen", unit: "pcs", stockGroupId: "group-a" },
    { ...base, id: "pak", name: "Pulpen", unit: "pak", stockGroupId: "group-a", isActive: false },
    { ...base, id: "single", name: "Zebra", sku: "ZEBRA", unit: "pcs", stockGroupId: null, stockGroup: null },
    { ...base, id: "foreign", storeId: "store-b", name: "Pulpen", unit: "pcs", stockGroupId: "group-a" },
  ];
});

describe("classification product groups", () => {
  it("returns the complete stock group including inactive units without another store", async () => {
    const result = await listClassificationProducts("store-a", { search: "Pulpen", page: 1, limit: 20 });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].units.map((unit: { id: string }) => unit.id).sort()).toEqual(["pak", "pcs"]);
    expect(result.groups[0].units.find((unit: { id: string }) => unit.id === "pak")?.isActive).toBe(false);
  });

  it("paginates groups instead of splitting units across pages", async () => {
    const first = await listClassificationProducts("store-a", { page: 1, limit: 1 });
    const second = await listClassificationProducts("store-a", { page: 2, limit: 1 });
    expect(first.total).toBe(2);
    expect(first.groups[0].units).toHaveLength(2);
    expect(second.groups[0].units.map((unit: { id: string }) => unit.id)).toEqual(["single"]);
  });

  it("filters groups by classification but includes all members of a matching group", async () => {
    Object.assign(fixture.products[0], { catalogSubcategoryId: "print", catalogSubcategory: { id: "print", group: "PERCETAKAN", name: "PRINT" } });
    const result = await listClassificationProducts("store-a", { group: "PERCETAKAN", page: 1, limit: 20 });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].units.map((unit: { id: string }) => unit.id).sort()).toEqual(["pak", "pcs"]);
  });

  it("does not return classified units when the unclassified filter is combined with a subcategory", async () => {
    Object.assign(fixture.products[0], { catalogSubcategoryId: "print", catalogSubcategory: { id: "print", group: "PERCETAKAN", name: "PRINT" } });
    const result = await listClassificationProducts("store-a", { status: "unclassified", subcategoryId: "print", page: 1, limit: 20 });
    expect(result.groups).toEqual([]);
    expect(result.total).toBe(0);
  });
});
