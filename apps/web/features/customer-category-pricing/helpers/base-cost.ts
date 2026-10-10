import { normalizePricingUnit } from "./pricing-rules";

export interface BaseCostProduct {
  id: string;
  storeId: string;
  unit?: string | null;
  costPrice?: number | string | { toString(): string } | null;
  stockGroupId?: string | null;
  stockGroup?: { baseUnit: string; storeId?: string } | null;
}

export interface ProductBaseCost {
  baseCostPrice: number | null;
  baseCostUnit: string | null;
}

function validCost(value: BaseCostProduct["costPrice"]): number | null {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  const cost = Number(value);
  return Number.isFinite(cost) && cost >= 0 ? cost : null;
}

export function resolveProductBaseCost(product: BaseCostProduct, candidates: BaseCostProduct[]): ProductBaseCost {
  if (!product.stockGroupId) {
    const baseCostUnit = normalizePricingUnit(product.unit);
    return { baseCostPrice: baseCostUnit ? validCost(product.costPrice) : null, baseCostUnit };
  }
  const baseCostUnit = normalizePricingUnit(product.stockGroup?.baseUnit);
  if (!baseCostUnit || (product.stockGroup?.storeId && product.stockGroup.storeId !== product.storeId)) {
    return { baseCostPrice: null, baseCostUnit: null };
  }
  const bases = candidates.filter((candidate) =>
    candidate.stockGroupId === product.stockGroupId &&
    candidate.storeId === product.storeId &&
    normalizePricingUnit(candidate.unit) === baseCostUnit,
  );
  return { baseCostPrice: bases.length === 1 ? validCost(bases[0].costPrice) : null, baseCostUnit };
}

type BaseCostQuery = {
  where: { OR: Array<{ storeId: string; stockGroupId: { in: string[] } }> };
  select: {
    id: true; storeId: true; unit: true; costPrice: true; stockGroupId: true;
    stockGroup: { select: { baseUnit: true; storeId: true } };
  };
};

export async function loadProductBaseCosts(
  db: { product: { findMany(args: BaseCostQuery): PromiseLike<BaseCostProduct[]> } },
  products: BaseCostProduct[],
): Promise<Map<string, ProductBaseCost>> {
  const groupsByStore = new Map<string, Set<string>>();
  for (const product of products) {
    if (!product.stockGroupId) continue;
    const groups = groupsByStore.get(product.storeId) ?? new Set<string>();
    groups.add(product.stockGroupId);
    groupsByStore.set(product.storeId, groups);
  }
  const candidates = groupsByStore.size ? await db.product.findMany({
    where: { OR: [...groupsByStore].map(([storeId, groups]) => ({ storeId, stockGroupId: { in: [...groups] } })) },
    select: {
      id: true, storeId: true, unit: true, costPrice: true, stockGroupId: true,
      stockGroup: { select: { baseUnit: true, storeId: true } },
    },
  }) : [];
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return new Map(products.map((product) => {
    // Transaction queries may omit the relation; the batch query also supplies it.
    const current = candidateById.get(product.id);
    const withGroup = product.stockGroup ? product : { ...product, stockGroup: current?.stockGroup };
    return [product.id, resolveProductBaseCost(withGroup, candidates)];
  }));
}
