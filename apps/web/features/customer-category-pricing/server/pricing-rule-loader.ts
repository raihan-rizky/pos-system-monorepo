import type { Prisma } from "@pos/db";
import type { CategoryCustomerPricingMode, CategoryPricingRule, CustomerType } from "../helpers/pricing-rules";

type CommonRule = {
  id: string; customerType: CustomerType | null; customerTypes: CustomerType[];
  unit: string | null; units: string[]; brandId: string | null; brand: { name: string } | null;
  mode: CategoryCustomerPricingMode; value: unknown; discountPercent: unknown;
  isActive: boolean; updatedAt: Date;
};
type LegacyRule = CommonRule & { categoryId: string; category: { name: string } };
type ScopedRule = CommonRule & { subcategoryId: string; subcategory: { group: string; name: string } };

export function normalizeServerPricingRules(legacy: LegacyRule[], scoped: ScopedRule[]): CategoryPricingRule[] {
  const common = (rule: CommonRule) => ({
    id: rule.id, customerType: rule.customerType ?? "ALL" as const, customerTypes: rule.customerTypes,
    unit: rule.unit, units: rule.units, brandId: rule.brandId, brandName: rule.brand?.name ?? null,
    mode: rule.mode, value: Number(rule.value), discountPercent: Number(rule.discountPercent ?? 0),
    isActive: rule.isActive, updatedAt: rule.updatedAt,
  });
  return [
    ...legacy.map(rule => ({ ...common(rule), scope: "CATEGORY" as const, categoryId: rule.categoryId, categoryName: rule.category.name })),
    ...scoped.map(rule => ({ ...common(rule), scope: "SUBCATEGORY" as const, categoryId: rule.subcategoryId, categoryName: `${rule.subcategory.group} / ${rule.subcategory.name}` })),
  ];
}

export async function loadCustomerPricingRules(client: Pick<Prisma.TransactionClient, "categoryCustomerPricingRule" | "subcategoryCustomerPricingRule">, storeId: string, activeOnly = true): Promise<CategoryPricingRule[]> {
  const where = { storeId, ...(activeOnly ? { isActive: true } : {}) };
  const [legacy, scoped] = await Promise.all([
    client.categoryCustomerPricingRule.findMany({ where, include: { category: { select: { name: true } }, brand: { select: { name: true } } }, orderBy: { id: "asc" } }),
    client.subcategoryCustomerPricingRule.findMany({ where, include: { subcategory: { select: { group: true, name: true } }, brand: { select: { name: true } } }, orderBy: { id: "asc" } }),
  ]);
  return normalizeServerPricingRules(legacy, scoped);
}
