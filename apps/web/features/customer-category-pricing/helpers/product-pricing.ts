import type { Product, ProductVariant } from "@/hooks/useProducts";
import { priceProductForCustomerType, type AppliedCategoryPricing, type CategoryPricingRule, type CustomerType } from "./pricing-rules";
import { roundSellingPriceLine, type PriceRoundingResult, type PriceRoundingSettings } from "@/features/product-price-rounding/rounding";

export interface CatalogPriceDisplay {
  displayPrice: number;
  appliedPricing: AppliedCategoryPricing | null;
  priceRounding: PriceRoundingResult | null;
}
export type PricedCatalogProduct = Product & CatalogPriceDisplay & {
  variants?: (ProductVariant & CatalogPriceDisplay)[];
};

export function priceCatalogVariantForCustomer(
  product: Product,
  variant: ProductVariant | undefined,
  customerType: CustomerType,
  rules: CategoryPricingRule[],
  roundingSettings?: PriceRoundingSettings,
  specialPricingEnabled = true,
) {
  const selected = variant ?? product;
  return roundSellingPriceLine(priceProductForCustomerType({
    categoryId: product.category.id,
    categoryName: product.category.name,
    price: Number(selected.price),
    costPrice: selected.costPrice == null ? null : Number(selected.costPrice),
    unit: selected.unit,
    brandId: selected.brandId,
    brandName: selected.brand?.name,
    hargaAgen: selected.hargaAgen == null ? null : Number(selected.hargaAgen),
    hargaDinas: selected.hargaDinas == null ? null : Number(selected.hargaDinas),
    baseCostPrice: selected.baseCostPrice,
    baseCostUnit: selected.baseCostUnit,
  }, customerType, rules, undefined, specialPricingEnabled), roundingSettings);
}

export function priceCatalogProductForCustomer(product: Product, customerType: CustomerType, rules: CategoryPricingRule[], roundingSettings?: PriceRoundingSettings, specialPricingEnabled = true): PricedCatalogProduct {
  const priced = priceCatalogVariantForCustomer(product, undefined, customerType, rules, roundingSettings, specialPricingEnabled);
  return {
    ...product,
    displayPrice: priced.unitPrice,
    appliedPricing: priced.appliedPricing,
    priceRounding: priced.priceRounding,
    variants: product.variants?.map(variant => {
      const variantPrice = priceCatalogVariantForCustomer(product, variant, customerType, rules, roundingSettings, specialPricingEnabled);
      return { ...variant, displayPrice: variantPrice.unitPrice, appliedPricing: variantPrice.appliedPricing, priceRounding: variantPrice.priceRounding };
    }),
  };
}
