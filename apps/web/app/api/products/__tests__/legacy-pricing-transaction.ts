// Stateful Prisma additions for route regression fixtures predating group pricing.
// Existing delegate spies retain responsibility for the original stock/CRUD flow;
// the pricing delegates persist money/config and supply complete relation reads.
type Row = Record<string, unknown>;
type Args = { where?: Row; data?: Row; include?: Row; select?: Row };
type Delegate = Record<string, ((args: Args) => Promise<Row | Row[] | null | undefined>) | undefined>;
type Transaction = { product?: Delegate; productStockGroup?: Delegate; productPriceLog?: Delegate; productStockGroupActivity?: Delegate };

export function withPricingTransaction<T extends object>(original: T, initialProducts: unknown[] = []): T {
  const tx = original as Transaction;
  const products = new Map<string, Row>(); const groups = new Map<string, Row>(); const written = new Set<string>();
  let createdCount = 0;
  const rememberGroup = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const row = value as Row;
    if (!row.id) return;
    groups.set(String(row.id), { storeId: "store-main", baseUnit: "pcs", pricingConfig: null, ...groups.get(String(row.id)), ...row });
    if (Array.isArray(row.products)) for (const product of row.products) rememberProduct(product, { stockGroupId: row.id, unit: row.baseUnit });
  };
  const rememberProduct = (value: unknown, defaults: Row = {}) => {
    if (!value || typeof value !== "object") return;
    const row = value as Row;
    if (!row.id) return;
    products.set(String(row.id), { storeId: "store-main", unit: "pcs", unitMultiplierToBase: 1, isActive: true, conversionNeedsReview: false, price: 0, costPrice: null, ...defaults, ...products.get(String(row.id)), ...row });
    if (row.stockGroup) rememberGroup(row.stockGroup);
  };
  initialProducts.forEach(product => rememberProduct(product));
  const product = tx.product ?? {};
  const stockGroup = tx.productStockGroup ?? {};
  const hydrate = (row: Row) => ({ ...row, stockGroup: groups.get(String(row.stockGroupId)) ?? row.stockGroup ?? null });
  return {
    ...original,
    product: {
      ...product,
      findFirst: async (args: Args) => {
        const id = String(args.where?.id);
        if (written.has(id)) return hydrate(products.get(id)!);
        const row = await product.findFirst?.(args); rememberProduct(row); return row ? hydrate(products.get(id)!) : row;
      },
      findMany: async (args: Args) => { const rows = await product.findMany?.(args); if (!Array.isArray(rows)) return rows; rows.forEach(row => rememberProduct(row)); return rows.map(row => hydrate(products.get(String(row.id))!)); },
      create: async (args: Args) => {
        const row = await product.create?.(args) as Row;
        // Older fixtures reused one ID for every optional unit; Prisma never does.
        const id = products.has(String(row.id)) ? `${row.id}-${++createdCount}` : String(row.id);
        const created = { ...args.data, ...row, id }; rememberProduct(created); written.add(id); return hydrate(products.get(id)!);
      },
      update: async (args: Args) => {
        const id = String(args.where?.id);
        const pricingWrite = Object.keys(args.data ?? {}).every(key => key === "price" || key === "costPrice");
        const row = pricingWrite ? {} : await product.update?.(args);
        rememberProduct({ ...products.get(id), ...args.data, ...row, id }); written.add(id);
        return hydrate(products.get(id)!);
      },
      delete: async (args: Args) => { const row = await product.delete?.(args); products.delete(String(args.where?.id)); return row; },
    },
    productStockGroup: {
      ...stockGroup,
      findUnique: async (args: Args) => { const row = await stockGroup.findUnique?.(args); rememberGroup(row); return row; },
      findFirst: async (args: Args) => {
        if (!args.select?.pricingConfig) {
          const row = await stockGroup.findFirst?.(args); rememberGroup(row);
          return row ?? groups.get(String(args.where?.id));
        }
        const id = String(args.where?.id);
        const group = groups.get(id) ?? { id, storeId: args.where?.storeId, baseUnit: "pcs", pricingConfig: null };
        return { ...group, products: [...products.values()].filter(row => row.stockGroupId === id).map(hydrate) };
      },
      create: async (args: Args) => { const row = await stockGroup.create?.(args) as Row; const created = { ...args.data, ...row }; rememberGroup(created); return created; },
      update: async (args: Args) => {
        const id = String(args.where?.id);
        const row = args.data?.pricingConfig ? {} : await stockGroup.update?.(args);
        groups.set(id, { ...groups.get(id), ...args.data, ...row, id }); return groups.get(id);
      },
    },
    productPriceLog: tx.productPriceLog ?? { createMany: async () => ({ count: 0 }) },
    productStockGroupActivity: tx.productStockGroupActivity ?? { create: async () => ({}) },
  } as T;
}
