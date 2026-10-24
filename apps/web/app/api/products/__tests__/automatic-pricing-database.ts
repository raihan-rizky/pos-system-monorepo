import { vi } from "vitest";

export type Product = {
  id: string; storeId: string; stockGroupId: string | null; name: string; sku: string;
  unit: string; price: string | number; costPrice: string | number | null;
  unitMultiplierToBase: number; isActive: boolean; conversionNeedsReview: boolean;
  stock: number; minStock: number; categoryId: string; material: string | null; size: string | null;
  hargaAgen?: number | null; hargaDinas?: number | null; description?: string | null;
};
export type Group = { id: string; storeId: string; baseUnit: string; displayName: string; groupKey: string; baseStock: number; pricingConfig: unknown };
type Where = { id?: string | { in: string[] }; storeId?: string; stockGroupId?: string; isActive?: boolean; sku?: string; storeId_groupKey?: { storeId: string; groupKey: string } };
export function createProductPricingDatabase() {
  const products: Product[] = [
    { id: "pcs", storeId: "store-main", stockGroupId: "group-1", name: "Snowman", sku: "SN-PCS", unit: "pcs", price: "3000", costPrice: "2000", unitMultiplierToBase: 1, isActive: true, conversionNeedsReview: false, stock: 24, minStock: 1, categoryId: "cat", material: null, size: null, hargaAgen: 2800, hargaDinas: 2900 },
    { id: "pak", storeId: "store-main", stockGroupId: "group-1", name: "Snowman", sku: "SN-PAK", unit: "pak", price: "32400", costPrice: "21000", unitMultiplierToBase: 12, isActive: true, conversionNeedsReview: false, stock: 2, minStock: 1, categoryId: "cat", material: null, size: null },
  ];
  const groups: Group[] = [{ id: "group-1", storeId: "store-main", baseUnit: "pcs", displayName: "Snowman", groupKey: "snowman|cat||", baseStock: 24, pricingConfig: null }];
  const locks: string[] = []; const logs: Array<{ productId: string; field: string; oldValue: string | null; newValue: string | null }> = []; const activities: unknown[] = []; const inventoryLogs: unknown[] = [];
  const sold = new Set<string>();
  let sequence = 0;
  const matches = (p: Product, w: Where = {}) => (!w.id || (typeof w.id === "string" ? p.id === w.id : w.id.in.includes(p.id))) && (!w.storeId || p.storeId === w.storeId) && (w.stockGroupId === undefined || p.stockGroupId === w.stockGroupId) && (w.isActive === undefined || p.isActive === w.isActive) && (!w.sku || p.sku === w.sku);
  const hydrate = (p: Product) => structuredClone({ ...p, stockGroup: groups.find(g => g.id === p.stockGroupId) ?? null, category: { id: p.categoryId, name: "Alat tulis" }, brand: null });
  const groupFind = ({ where }: { where: Where }) => {
    const g = groups.find(g => (!where.id || g.id === where.id) && (!where.storeId || g.storeId === where.storeId) && (!where.storeId_groupKey || g.storeId === where.storeId_groupKey.storeId && g.groupKey === where.storeId_groupKey.groupKey));
    return g ? structuredClone({ ...g, products: products.filter(p => p.stockGroupId === g.id).map(hydrate) }) : null;
  };
  const raw = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: string[]) => {
      const isGroup = strings.join("").includes("pos_product_stock_groups");
      locks.push(`${isGroup ? "group" : "product"}:${values[0]}`);
      return (isGroup ? groups : products).some(p => p.id === values[0] && p.storeId === values[1]) ? [{ id: values[0] }] : [];
    }),
    product: {
      findFirst: vi.fn(async ({ where }: { where: Where }) => { const p = products.find(p => matches(p, where)); return p ? hydrate(p) : null; }),
      findUnique: vi.fn(async ({ where }: { where: Where }) => { const p = products.find(p => matches(p, where)); return p ? hydrate(p) : null; }),
      findMany: vi.fn(async ({ where }: { where: Where }) => products.filter(p => matches(p, where)).map(hydrate)),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Product> }) => { const p = products.find(p => p.id === where.id)!; Object.assign(p, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))); return hydrate(p); }),
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: Partial<Product> }) => { const selected = products.filter(p => matches(p, where)); selected.forEach(p => Object.assign(p, data)); return { count: selected.length }; }),
      create: vi.fn(async ({ data }: { data: Partial<Product> }) => { const p = { ...products[0], ...data, id: `created-${++sequence}`, isActive: true } as Product; products.push(p); return hydrate(p); }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => { const i = products.findIndex(p => p.id === where.id); return products.splice(i, 1)[0]; }),
    },
    productStockGroup: {
      findFirst: vi.fn(async (args: { where: Where }) => groupFind(args)),
      findUnique: vi.fn(async (args: { where: Where }) => groupFind(args)),
      create: vi.fn(async ({ data }: { data: Omit<Group, "id" | "pricingConfig"> }) => { const g = { ...data, id: `group-created-${++sequence}`, pricingConfig: null }; groups.push(g); return structuredClone(g); }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Group> }) => Object.assign(groups.find(g => g.id === where.id)!, data)),
    },
    productPriceLog: { createMany: vi.fn(async ({ data }: { data: typeof logs }) => { logs.push(...data); return { count: data.length }; }) },
    productStockGroupActivity: { create: vi.fn(async ({ data }: { data: unknown }) => { activities.push(data); }) },
    inventoryLog: { createMany: vi.fn(async ({ data }: { data: unknown[] }) => { inventoryLogs.push(...data); }) },
    transactionItem: { count: vi.fn(async ({ where }: { where: { productId: string } }) => sold.has(where.productId) ? 1 : 0) },
    brand: { findFirst: vi.fn(async () => null) },
    $transaction: vi.fn(async <T>(run: (tx: Omit<typeof raw, "$transaction">) => Promise<T>): Promise<T> => {
      const snapshot = structuredClone({ products, groups, logs, activities, inventoryLogs });
      try { return await run(raw); } catch (error) {
        products.splice(0, products.length, ...snapshot.products); groups.splice(0, groups.length, ...snapshot.groups);
        logs.splice(0, logs.length, ...snapshot.logs); activities.splice(0, activities.length, ...snapshot.activities); inventoryLogs.splice(0, inventoryLogs.length, ...snapshot.inventoryLogs);
        throw error;
      }
    }),
  };
  return { raw, products, groups, locks, logs, sold, activities, inventoryLogs };
}
