import type { CartItem } from "@/hooks/useCart";
import type { CustomerCategoryPricingRule } from "@/hooks/useCustomerCategoryPricingRules";
import {
  priceProductForCustomerType,
  resolveCustomPricedLine,
  type CategoryPricingRule,
  type CustomerType,
} from "@/features/customer-category-pricing/helpers/pricing-rules";

export function mapCheckoutPricingRule(
  rule: CustomerCategoryPricingRule,
): CategoryPricingRule {
  return {
    id: rule.id,
    categoryId: rule.categoryId,
    categoryName: rule.category.name,
    customerType: rule.customerType,
    mode: rule.mode,
    value: Number(rule.value),
    isActive: rule.isActive,
    unit: rule.unit,
    brandId: rule.brandId,
    brandName: rule.brand?.name ?? null,
    updatedAt: rule.updatedAt,
  };
}

export function priceCartItemsForCheckout(input: {
  items: CartItem[];
  customerType: CustomerType;
  pricingRules: CustomerCategoryPricingRule[];
  manualPrices: Record<string, number>;
  role: string | null | undefined;
}): CartItem[] {
  const activePricingRules = input.pricingRules.map(mapCheckoutPricingRule);

  return input.items.map((item): CartItem => {
    if (item.lineType !== "PRODUCT" || !item.categoryId) return item;

    const priced = priceProductForCustomerType(
      {
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        price: item.catalogPrice ?? item.price,
        hargaDinas: item.hargaDinas,
        hargaAgen: item.hargaAgen,
        unit: item.unit,
        brandId: item.brandId,
        brandName: item.brandName,
      },
      input.customerType,
      activePricingRules,
    );
    const resolved = resolveCustomPricedLine({
      pricedLine: priced,
      submittedPrice: input.manualPrices[item.cartLineId],
      role: input.role,
      customerType: input.customerType,
    });

    return {
      ...item,
      price: resolved.unitPrice,
      appliedPricing: resolved.appliedPricing,
    };
  });
}
