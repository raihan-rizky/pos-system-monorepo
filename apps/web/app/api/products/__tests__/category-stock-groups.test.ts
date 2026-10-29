import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProductPricingDatabase } from "./automatic-pricing-database";
import { PUT } from "../[id]/route";

const state = vi.hoisted(() => ({ db: {} as unknown }));
vi.mock("@pos/db", () => ({ db: new Proxy({}, { get: (_, key) => Reflect.get(state.db as object, key) }), Prisma: {} }));
vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: async () => ({ id: "admin", name: "Admin", storeId: "store-main" }),
  handleAuthError: () => null,
}));

let database: ReturnType<typeof createProductPricingDatabase>;
const updateCategory = (categoryId: string) => PUT(
  new Request("http://localhost/api/products/pcs", { method: "PUT", body: JSON.stringify({ categoryId, stock: 24 }) }),
  { params: Promise.resolve({ id: "pcs" }) },
);

beforeEach(() => {
  database = createProductPricingDatabase();
  state.db = database.raw;
});

describe("product category edits for shared stock groups", () => {
  it("moves all units while keeping the original shared stock and pricing group", async () => {
    database.products[1].isActive = false;
    const response = await updateCategory("next");
    expect(response.status).toBe(200);
    expect(database.products.map(product => [product.id, product.categoryId, product.stockGroupId])).toEqual([
      ["pcs", "next", "group-1"], ["pak", "next", "group-1"],
    ]);
    expect(database.groups).toHaveLength(1);
    expect(database.groups[0]).toMatchObject({ groupKey: "snowman|next||", baseStock: 24, baseUnit: "pcs" });
  });

  it("rejects an existing destination group rather than merging its inventory", async () => {
    database.groups.push({ ...database.groups[0], id: "group-2", groupKey: "snowman|next||", baseStock: 99 });
    database.products.push({ ...database.products[0], id: "other", sku: "OTHER", categoryId: "next", stockGroupId: "group-2" });
    const before = structuredClone({ products: database.products, groups: database.groups });
    const response = await updateCategory("next");
    expect(response.status).toBe(409);
    expect({ products: database.products, groups: database.groups }).toEqual(before);
  });

  it("preserves a manual key and existing member prices for a category-only edit", async () => {
    database.groups[0].groupKey = "manual:group-1";
    const prices = database.products.map(({ price, costPrice }) => ({ price, costPrice }));
    const response = await updateCategory("next");
    expect(response.status).toBe(200);
    expect(database.groups[0].groupKey).toBe("manual:group-1");
    expect(database.products.map(({ price, costPrice }) => ({ price, costPrice }))).toEqual(prices);
  });

  it("does not recalculate prices when the form resends unchanged pricing fields", async () => {
    const prices = database.products.map(({ price, costPrice }) => ({ price: Number(price), costPrice: Number(costPrice) }));
    const response = await PUT(
      new Request("http://localhost/api/products/pcs", { method: "PUT", body: JSON.stringify({ categoryId: "next", name: "Snowman", unit: "pcs", unitMultiplierToBase: 1, price: 3000, costPrice: 2000 }) }),
      { params: Promise.resolve({ id: "pcs" }) },
    );
    expect(response.status).toBe(200);
    expect(database.products.map(({ price, costPrice }) => ({ price: Number(price), costPrice: Number(costPrice) }))).toEqual(prices);
    expect(database.groups[0].pricingConfig).toBeNull();
  });

  it("keeps a pending conversion review when the category form resends the same multiplier", async () => {
    database.products[0].conversionNeedsReview = true;
    const prices = database.products.map(({ price, costPrice }) => ({ price: Number(price), costPrice: Number(costPrice) }));
    const response = await PUT(
      new Request("http://localhost/api/products/pcs", { method: "PUT", body: JSON.stringify({ categoryId: "next", unitMultiplierToBase: 1 }) }),
      { params: Promise.resolve({ id: "pcs" }) },
    );
    expect(response.status).toBe(200);
    expect(database.products[0].conversionNeedsReview).toBe(true);
    expect(database.products.map(({ price, costPrice }) => ({ price: Number(price), costPrice: Number(costPrice) }))).toEqual(prices);
    expect(database.groups[0].pricingConfig).toBeNull();
  });

  it("rejects changing group identity and category in the same edit", async () => {
    const before = structuredClone({ products: database.products, groups: database.groups });
    const response = await PUT(
      new Request("http://localhost/api/products/pcs", { method: "PUT", body: JSON.stringify({ name: "Nama baru", categoryId: "next" }) }),
      { params: Promise.resolve({ id: "pcs" }) },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ message: expect.stringMatching(/kategori.*terpisah/i) });
    expect({ products: database.products, groups: database.groups }).toEqual(before);
  });

  it("preserves a manual stock group key during group quick editing", async () => {
    database.groups[0].groupKey = "manual:group-1";
    database.products[1].isActive = false;
    Object.assign(database.raw, { category: { findFirst: vi.fn().mockResolvedValue({ id: "next", name: "Baru" }) } });
    database.raw.productStockGroup.findFirst.mockResolvedValue(null);
    const response = await PUT(
      new Request("http://localhost/api/products/pcs", { method: "PUT", body: JSON.stringify({ quickEditGroup: true, name: "Snowman", categoryId: "next" }) }),
      { params: Promise.resolve({ id: "pcs" }) },
    );
    expect(response.status).toBe(200);
    expect(database.groups[0].groupKey).toBe("manual:group-1");
    expect(database.products.map(product => product.categoryId)).toEqual(["next", "next"]);
  });

  it("preserves distinct group details during a category-only quick edit", async () => {
    database.products[0].name = "Snowman Biru";
    database.products[0].description = "Biru";
    database.products[1].description = "Hitam";
    Object.assign(database.products[0], { brandId: "brand-1" });
    Object.assign(database.products[1], { brandId: "brand-2" });
    Object.assign(database.raw, { category: { findFirst: vi.fn().mockResolvedValue({ id: "next", name: "Baru" }) } });
    database.raw.brand.findFirst.mockResolvedValue({ id: "brand-1", name: "Merek" } as never);
    database.raw.productStockGroup.findFirst.mockResolvedValue(null);
    const response = await PUT(
      new Request("http://localhost/api/products/pcs", { method: "PUT", body: JSON.stringify({ quickEditGroup: true, name: "Snowman Biru", brandId: "brand-1", categoryId: "next" }) }),
      { params: Promise.resolve({ id: "pcs" }) },
    );
    expect(response.status).toBe(200);
    expect(database.products.map(p => [p.name, p.description, (p as typeof p & { brandId: string }).brandId, p.categoryId])).toEqual([
      ["Snowman Biru", "Biru", "brand-1", "next"], ["Snowman", "Hitam", "brand-2", "next"],
    ]);
    expect(database.groups[0].groupKey).toBe("snowman|next||");
    expect(database.groups[0].displayName).toBe("Snowman");
  });

  it("rejects a quick edit when the category changed before its locks", async () => {
    Object.assign(database.raw, { category: { findFirst: vi.fn().mockResolvedValue({ id: "next", name: "Baru" }) } });
    database.raw.productStockGroup.findFirst.mockResolvedValue(null);
    const originalFind = database.raw.product.findMany.getMockImplementation()!;
    let calls = 0;
    database.raw.product.findMany.mockImplementation(async args => {
      calls += 1;
      if (calls === 2) database.products.forEach(p => { p.categoryId = "elsewhere"; });
      return originalFind(args);
    });
    const response = await PUT(
      new Request("http://localhost/api/products/pcs", { method: "PUT", body: JSON.stringify({ quickEditGroup: true, name: "Snowman", categoryId: "next" }) }),
      { params: Promise.resolve({ id: "pcs" }) },
    );
    expect(response.status).toBe(409);
  });

  it("quick edits only the selected product when it has no stock group", async () => {
    database.products[0].stockGroupId = null;
    Object.assign(database.raw, { category: { findFirst: vi.fn().mockResolvedValue({ id: "next", name: "Baru" }) } });
    const response = await PUT(
      new Request("http://localhost/api/products/pcs", { method: "PUT", body: JSON.stringify({ quickEditGroup: true, name: "Snowman", categoryId: "next" }) }),
      { params: Promise.resolve({ id: "pcs" }) },
    );
    expect(response.status).toBe(200);
    expect(database.products.map(p => [p.categoryId, p.stockGroupId])).toEqual([["next", null], ["cat", "group-1"]]);
  });

  it("rejects attaching an ungrouped product to an existing destination group", async () => {
    database.products[0].stockGroupId = null;
    database.groups.push({ ...database.groups[0], id: "group-2", groupKey: "snowman|next||", baseStock: 99 });
    database.products.push({ ...database.products[1], id: "other", sku: "OTHER", categoryId: "next", stockGroupId: "group-2" });
    const before = structuredClone({ products: database.products, groups: database.groups });
    const response = await updateCategory("next");
    expect(response.status).toBe(409);
    expect({ products: database.products, groups: database.groups }).toEqual(before);
  });

  it("rejects a category supplied from a stale pre-lock product", async () => {
    const originalFind = database.raw.product.findFirst.getMockImplementation()!;
    let calls = 0;
    database.raw.product.findFirst.mockImplementation(async args => {
      calls += 1;
      if (calls === 2) database.products.forEach(p => { p.categoryId = "next"; });
      return originalFind(args);
    });
    const response = await PUT(
      new Request("http://localhost/api/products/pcs", { method: "PUT", body: JSON.stringify({ categoryId: "cat", minStock: 2 }) }),
      { params: Promise.resolve({ id: "pcs" }) },
    );
    expect(response.status).toBe(409);
  });

  it("uses the member matching an automatic group key when the edited unit has a different name", async () => {
    database.products[0].name = "Snowman Biru";
    const response = await updateCategory("next");
    expect(response.status).toBe(200);
    expect(database.groups[0].groupKey).toBe("snowman|next||");
    expect(database.products.map(product => product.categoryId)).toEqual(["next", "next"]);
  });
});
