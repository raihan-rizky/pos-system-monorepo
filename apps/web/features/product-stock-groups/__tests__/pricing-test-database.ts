import { vi } from "vitest";
import type { Prisma } from "@pos/db";

export function createPricingTestDatabase() {
  const products = [
    { id: "rim", storeId: "store-main", stockGroupId: "group-1", name: "HVS A4", sku: "HVS-A4-RIM", unit: "rim", price: "50000", costPrice: "40000" as string | null, unitMultiplierToBase: 1, isActive: true, conversionNeedsReview: false, stock: 20, minStock: 1, categoryId: "cat", material: null, size: null },
    { id: "dus", storeId: "store-main", stockGroupId: "group-1", name: "HVS A4", sku: "HVS-A4-DUS", unit: "dus", price: "225000", costPrice: "150000" as string | null, unitMultiplierToBase: 5, isActive: true, conversionNeedsReview: false, stock: 4, minStock: 1, categoryId: "cat", material: null, size: null },
  ];
  const group = { id: "group-1", storeId: "store-main", baseUnit: "rim", displayName: "HVS A4", groupKey: "hvs-a4", baseStock: 20, pricingConfig: null as unknown };
  const locks: string[] = []; const logs: unknown[] = []; const activities: unknown[] = [];
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: string[]) => {
      const isGroup = strings.join("").includes("pos_product_stock_groups");
      locks.push(`${isGroup ? "group" : "product"}:${values[0]}`);
      return (isGroup ? values[0] === group.id && values[1] === group.storeId : products.some(p => p.id === values[0] && p.storeId === values[1])) ? [{ id: values[0] }] : [];
    }),
    productStockGroup: {
      findFirst: vi.fn(async ({ where, include, select }: {
        where: { id: string; storeId: string };
        include?: { products?: true | { where?: { isActive?: boolean } } };
        select?: { products?: true | { where?: { isActive?: boolean } } };
      }) => {
        if (where.id !== group.id || where.storeId !== group.storeId) return null;
        const relation = include?.products ?? select?.products;
        const active = typeof relation === "object" ? relation.where?.isActive : undefined;
        return structuredClone({ ...group, products: products.filter(p => p.stockGroupId === group.id && (active === undefined || p.isActive === active)) });
      }),
      update: vi.fn(async ({ data }: { data: object }) => Object.assign(group, data)),
    },
    product: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; storeId?: string; stockGroupId?: string; isActive?: boolean } }) => structuredClone(products.find(p => p.id === where.id && (where.storeId === undefined || p.storeId === where.storeId) && (where.stockGroupId === undefined || p.stockGroupId === where.stockGroupId) && (where.isActive === undefined || p.isActive === where.isActive)) ?? null)),
      findUnique: vi.fn(async ({ where }: { where: { id?: string; sku?: string } }) => structuredClone(products.find(p => where.id ? p.id === where.id : p.sku === where.sku) ?? null)),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(products.find(p => p.id === where.id)!, data)),
      create: vi.fn(async ({ data }: { data: object }) => { const p = { ...products[0], ...data, id: "new-variant" }; products.push(p); return structuredClone(p); }),
    },
    productPriceLog: { createMany: vi.fn(async ({ data }: { data: unknown[] }) => { logs.push(...data); }) },
    productStockGroupActivity: { create: vi.fn(async ({ data }: { data: unknown }) => { activities.push(data); }) },
  };
  return { products, group, locks, logs, activities, raw: tx, tx: tx as unknown as Prisma.TransactionClient };
}
