import type { CartItem } from "@/hooks/useCart";
import type { CustomerCategoryPricingRule } from "@/hooks/useCustomerCategoryPricingRules";
import { roundSellingPriceLine, type PriceRoundingSettings } from "@/features/product-price-rounding/rounding";
import {
  priceProductForCustomerType,
  resolveCustomPricedLine,
  type CategoryPricingRule,
  type CustomerType,
  type PricingPreference,
} from "@/features/customer-category-pricing/helpers/pricing-rules";

function roundCartPrice<T extends { unitPrice: number; appliedPricing: { appliedUnitPrice: number } | null }>(line: T, settings?: PriceRoundingSettings) {
  try {
    return { ...roundSellingPriceLine(line, settings), priceError: null };
  } catch (error) {
    return { ...line, unitPrice: 0, appliedPricing: null, priceRounding: null,
      priceError: error instanceof Error ? error.message : "Periksa kembali nilai harga jual." };
  }
}

export function mapCheckoutPricingRule(
  rule: CustomerCategoryPricingRule,
): CategoryPricingRule {
  return {
    id: rule.id,
    categoryId: rule.categoryId,
    categoryName: rule.category.name,
    customerType: rule.customerType,
    customerTypes: rule.customerTypes,
    mode: rule.mode,
    value: Number(rule.value),
    discountPercent: rule.discountPercent,
    isActive: rule.isActive,
    unit: rule.unit,
    units: rule.units,
    brandId: rule.brandId,
    brandName: rule.brand?.name ?? null,
    updatedAt: rule.updatedAt,
  };
}

export function priceCartItemsForCheckout(input: {
  items: CartItem[];
  customerType: CustomerType;
  pricingRules: CustomerCategoryPricingRule[];
  pricingPreference?: PricingPreference;
  manualPrices: Record<string, number>;
  role: string | null | undefined;
  roundingSettings?: PriceRoundingSettings;
  specialPricingEnabled?: boolean;
}): CartItem[] {
  const activePricingRules = input.pricingRules.map(mapCheckoutPricingRule);

  return input.items.map((item): CartItem => {
    if (item.lineType !== "PRODUCT") return item;

    const priced = priceProductForCustomerType(
      {
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        price: item.catalogPrice ?? item.price,
        costPrice: item.costPrice,
        hargaDinas: item.hargaDinas,
        hargaAgen: item.hargaAgen,
        unit: item.unit,
        brandId: item.brandId,
        brandName: item.brandName,
        baseCostPrice: item.baseCostPrice,
        baseCostUnit: item.baseCostUnit,
      },
      input.customerType,
      activePricingRules,
      input.pricingPreference,
      input.specialPricingEnabled,
    );
    const submittedManualPrice = input.manualPrices[item.cartLineId];
    const resolved =
      input.specialPricingEnabled !== false && submittedManualPrice == null && item.transactionPrice != null
        ? {
            unitPrice: item.transactionPrice,
            appliedPricing: null,
            manualOverrideApplied: true,
          }
        : resolveCustomPricedLine({
            pricedLine: priced,
            submittedPrice: submittedManualPrice,
            role: input.role,
            customerType: input.customerType,
            specialPricingEnabled: input.specialPricingEnabled,
          });

    const rounded = roundCartPrice(resolved, input.roundingSettings);
    return {
      ...item,
      price: rounded.unitPrice,
      transactionPrice: input.specialPricingEnabled === false ? null : item.transactionPrice,
      priceRounding: rounded.priceRounding,
      priceError: rounded.priceError,
      appliedPricing: rounded.manualOverrideApplied ? null : rounded.appliedPricing,
      unitOptions: item.unitOptions?.map(option => {
        const optionPrice = priceProductForCustomerType({
          categoryId: option.categoryId, categoryName: option.categoryName,
          price: option.catalogPrice, unit: option.unit,
          costPrice: option.costPrice,
          brandId: option.brandId, brandName: option.brandName,
          hargaAgen: option.hargaAgen, hargaDinas: option.hargaDinas,
          baseCostPrice: option.baseCostPrice, baseCostUnit: option.baseCostUnit,
        }, input.customerType, activePricingRules, undefined, input.specialPricingEnabled);
        const roundedOption = roundCartPrice(optionPrice, input.roundingSettings);
        return { ...option, price: roundedOption.unitPrice, appliedPricing: roundedOption.appliedPricing, priceRounding: roundedOption.priceRounding, priceError: roundedOption.priceError };
      }),
    };
  });
}
