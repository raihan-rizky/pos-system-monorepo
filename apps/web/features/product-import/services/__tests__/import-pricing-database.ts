import { vi } from "vitest";
import { createPricingTestDatabase } from "@/features/product-stock-groups/__tests__/pricing-test-database";

// Simulate JSONB's freedom to reorder object keys without changing array order.
export function reorderPersistedKeys(value: unknown): any {
  if (Array.isArray(value)) return value.map(reorderPersistedKeys);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorderPersistedKeys(item)]));
  return value;
}

// Stateful persistence boundary: pricing, projection, planning and SQL writers remain real.
export function importPricingDatabase() {
  const db = createPricingTestDatabase();
  const products: any[] = db.products;
  products.forEach(p => Object.assign(p, { barcode: null, description: null, hargaDinas: null, hargaAgen: null, imageUrl: null, brandId: null, productSuppliers: [] }));
  db.group.groupKey = "hvs a4|cat||";
  const groups: any[] = [db.group];
  const batches: any[] = [{ id: "batch", storeId: "store-main", type: "PRODUCT_IMPORT", status: "PENDING", summary: {}, createdAt: new Date(0) }];
  const planned: any[] = []; const items: any[] = []; const inventory: any[] = [];
  const match = (p: any, where: any = {}): boolean => Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === "OR") return value.some((v: any) => match(p, v));
    if (value && typeof value === "object" && !(value instanceof Date)) return (value.in === undefined || value.in.includes(p[key])) && (value.not === undefined || p[key] !== value.not) && (value.gte === undefined || p[key] >= value.gte) && (value.lt === undefined || p[key] < value.lt) && (value.gt === undefined || p[key] > value.gt);
    return p[key] === value;
  });
  const clone = (p: any) => structuredClone(p);
  const tx: any = db.raw;
  tx.product.findMany = vi.fn(async ({ where }: any = {}) => products.filter(p => match(p, where)).map(p => clone({ ...p, category: p.category ?? { name: "ATK" }, stockGroup: groups.find(g => g.id === p.stockGroupId) ?? null })));
  tx.productStockGroup.findMany = vi.fn(async ({ where }: any = {}) => groups.filter(g => match(g, where)).map(g => clone({ ...g, products: products.filter(p => p.stockGroupId === g.id) })));
  tx.productStockGroup.findFirst = vi.fn(async ({ where }: any) => {
    const g = groups.find(g => match(g, where)); return g ? clone({ ...g, products: products.filter(p => p.stockGroupId === g.id) }) : null;
  });
  tx.productStockGroup.findUnique = vi.fn(async ({ where }: any) => clone(groups.find(g => match(g, where.storeId_groupKey ?? where)) ?? null));
  tx.productStockGroup.createMany = vi.fn(async ({ data }: any) => { groups.push(...clone(data)); return { count: data.length }; });
  tx.productStockGroup.update = vi.fn(async ({ where, data }: any) => Object.assign(groups.find(g => g.id === where.id)!, clone(data)));
  tx.category = { findMany: vi.fn(async () => [{ id: "cat", name: "ATK" }]) };
  tx.supplier = { findMany: vi.fn(async () => []) };
  tx.productSupplier = { deleteMany: vi.fn(), createMany: vi.fn() };
  tx.inventoryLog = { createMany: vi.fn(async ({ data }: any) => inventory.push(...clone(data))), create: vi.fn(async ({ data }: any) => { inventory.push(clone(data)); return { id: `inventory-${inventory.length}`, ...data }; }) };
  tx.batchOperation = {
    findFirst: vi.fn(async ({ where, include }: any) => { const b = batches.find(b => match(b, where)); return b ? clone({ ...b, ...(include?.items ? { items: items.filter(i => i.batchOperationId === b.id) } : {}) }) : null; }),
    update: vi.fn(async ({ where, data }: any) => Object.assign(batches.find(b => b.id === where.id), clone(data))),
    create: vi.fn(async ({ data }: any) => { const b = { id: `batch-${batches.length}`, createdAt: new Date(), ...clone(data) }; batches.push(b); return clone(b); }),
  };
  tx.batchOperationItem = {
    findMany: vi.fn(async ({ where }: any) => clone(items.filter(i => match(i, where)))),
    findFirst: vi.fn(async ({ where }: any) => clone(items.find(i => match(i, where)) ?? null)),
    count: vi.fn(async ({ where }: any) => items.filter(i => match(i, where)).length),
    createMany: vi.fn(async ({ data }: any) => { items.push(...clone(data).map((i: any) => ({ id: `item-${items.length}`, sourceRowNumber: null, ...i }))); }),
    create: vi.fn(async ({ data }: any) => { items.push(clone(data)); return data; }),
    update: vi.fn(async ({ where, data }: any) => Object.assign(items.find(i => i.id === where.id), clone(data))),
  };
  tx.productImportPlannedRow = {
    findMany: vi.fn(async ({ where }: any) => clone(planned.filter(p => match(p, where)).sort((a, b) => a.cursorIndex - b.cursorIndex))),
    count: vi.fn(async ({ where }: any) => planned.filter(p => match(p, where)).length),
    updateMany: vi.fn(async ({ where, data }: any) => { planned.filter(p => match(p, where)).forEach(p => Object.assign(p, clone(data))); }),
    createMany: vi.fn(async ({ data }: any) => planned.push(...clone(data))),
  };
  tx.transactionItem = { findMany: vi.fn(async () => []) };
  tx.$queryRaw = vi.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
    const sql = strings.join(" ");
    if (sql.includes("FOR UPDATE")) {
      const kind = sql.includes("pos_batch_operations") ? "batch" : sql.includes("pos_product_stock_groups") ? "group" : "product";
      db.locks.push(`${kind}:${values[0]}`);
      return (kind === "batch" ? batches : kind === "group" ? groups : products).filter(p => p.id === values[0] && p.storeId === values[1]).map(p => ({ id: p.id }));
    }
    if (sql.includes("INSERT INTO pos_products")) {
      const fields = ["id", "name", "sku", "barcode", "description", "price", "costPrice", "hargaDinas", "hargaAgen", "stock", "minStock", "unit", "size", "material", "imageUrl", "categoryId", "storeId", "stockGroupId", "unitMultiplierToBase", "conversionNeedsReview"];
      values[0].forEach((_: any, index: number) => products.push({ ...Object.fromEntries(fields.map((key, i) => [key, values[i][index]])), isActive: true, brandId: null, productSuppliers: [] }));
    } else if (sql.includes("UPDATE pos_products")) {
      const full = sql.includes("name = v.name");
      const fields = full ? ["id", "name", "barcode", "description", "price", "costPrice", "hargaDinas", "hargaAgen", "minStock", "unit", "size", "material", "imageUrl", "categoryId", "stockGroupId"] : ["id", "price", "costPrice", "hargaDinas", "hargaAgen", "unitMultiplierToBase"];
      values[0].forEach((id: string, index: number) => {
        const p = products.find(p => p.id === id)!;
        fields.forEach((key, i) => { if (!full && ((key === "hargaDinas" && !values[6][index]) || (["hargaAgen", "unitMultiplierToBase"].includes(key) && values[i][index] == null))) return; p[key] = values[i][index]; });
      });
    } else if (sql.includes("UPDATE pos_product_stock_groups")) values[0].forEach((id: string, i: number) => { groups.find(g => g.id === id).baseStock = values[1][i]; });
    return [];
  });
  let tail = Promise.resolve();
  const transaction = async (callback: (tx: any) => Promise<any>) => {
    const run = tail.then(async () => {
      const collections = [products, groups, batches, planned, items, inventory, db.logs, db.activities];
      const backups = collections.map(clone);
      try { return await callback(tx); } catch (error) { collections.forEach((c, i) => c.splice(0, c.length, ...backups[i])); throw error; }
    });
    tail = run.then(() => undefined, () => undefined); return run;
  };
  const addRow = (id: string, rowNumber: number, cursorIndex: number, price: number, costPrice?: number | null, action = "update-price") => {
    const p = products.find(p => p.id === id)!;
    const rowData = { name: p.name, sku: p.sku, category: "ATK", unit: p.unit, stock: p.stock, rowNumber, price, costPrice, matchedProductId: id, duplicateInFile: false, missingCategory: false, warnings: [], errors: [] };
    planned.push({ batchOperationId: "batch", sourceRowNumber: rowNumber, cursorIndex, status: "PENDING", sku: p.sku, productId: id, commitAction: action, rowData });
  };
  return { ...db, tx, products, groups, batches, planned, items, inventory, transaction, addRow };
}

/** Upgrade older route fixtures at the database boundary without mocking the pricing service. */
export function withImportPricingPersistence(original: any) {
  const shadow = importPricingDatabase();
  shadow.products.splice(0); shadow.groups.splice(0);
  let wrote = false;
  const seed = (rows: any[]) => {
    for (const row of rows) {
      const old = shadow.products.find(p => p.id === row.id);
      if (!old || !wrote) {
        const product = { barcode: null, description: null, hargaDinas: null, hargaAgen: null, brandId: null, imageUrl: null, stockGroupId: null, unitMultiplierToBase: 1, conversionNeedsReview: false, isActive: true, storeId: "store-main", stock: 0, minStock: 5, material: null, size: null, productSuppliers: [], ...row };
        if (old) Object.assign(old, product); else shadow.products.push(product);
        if (product.stockGroupId && !shadow.groups.some(g => g.id === product.stockGroupId)) shadow.groups.push({ id: product.stockGroupId, storeId: product.storeId, baseUnit: product.stockGroup?.baseUnit ?? product.unit, baseStock: product.stockGroup?.baseStock ?? product.stock, groupKey: `${product.name.toLowerCase()}|${product.categoryId}||`, pricingConfig: null });
      }
    }
  };
  const tx: any = {
    ...original,
    product: {
      ...original.product,
      findMany: async (args: any) => { seed(await original.product.findMany(args) ?? []); return shadow.tx.product.findMany(args); },
      update: async (args: any) => { await original.product.update?.(args); return shadow.tx.product.update(args); },
    },
    productStockGroup: {
      ...original.productStockGroup,
      findFirst: shadow.tx.productStockGroup.findFirst,
      findMany: async (args: any) => {
        for (const group of await original.productStockGroup?.findMany?.(args) ?? []) if (!shadow.groups.some(g => g.id === group.id)) shadow.groups.push({ pricingConfig: null, ...group });
        return shadow.tx.productStockGroup.findMany(args);
      },
      createMany: async (args: any) => { await original.productStockGroup.createMany(args); return shadow.tx.productStockGroup.createMany(args); },
      update: async (args: any) => { await original.productStockGroup?.update?.(args); return shadow.tx.productStockGroup.update(args); },
    },
    productStockGroupActivity: shadow.tx.productStockGroupActivity,
    productSupplier: {
      ...original.productSupplier,
      deleteMany: async (args: any) => { await original.productSupplier?.deleteMany?.(args); for (const p of shadow.products) if (args.where.productId === p.id || args.where.productId?.in?.includes(p.id)) p.productSuppliers = []; },
      createMany: async (args: any) => { await original.productSupplier?.createMany?.(args); for (const row of args.data) shadow.products.find(p => p.id === row.productId)?.productSuppliers.push({ supplierId: row.supplierId }); },
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
      const result = await original.$queryRaw(strings, ...values);
      if (strings.join(" ").includes("FOR UPDATE")) return result;
      wrote = true; return shadow.tx.$queryRaw(strings, ...values);
    },
  };
  return tx;
}
