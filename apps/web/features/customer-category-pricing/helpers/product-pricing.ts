import type { Product, ProductVariant } from "@/hooks/useProducts";
import { priceProductForCustomerType, type AppliedCategoryPricing, type CategoryPricingRule, type CustomerType } from "./pricing-rules";

export interface CatalogPriceDisplay {
  displayPrice: number;
  appliedPricing: AppliedCategoryPricing | null;
}
export type PricedCatalogProduct = Product & CatalogPriceDisplay & {
  variants?: (ProductVariant & CatalogPriceDisplay)[];
};

export function priceCatalogVariantForCustomer(
  product: Product,
  variant: ProductVariant | undefined,
  customerType: CustomerType,
  rules: CategoryPricingRule[],
) {
  const selected = variant ?? product;
  return priceProductForCustomerType({
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
  }, customerType, rules);
}

export function priceCatalogProductForCustomer(product: Product, customerType: CustomerType, rules: CategoryPricingRule[]): PricedCatalogProduct {
  const priced = priceCatalogVariantForCustomer(product, undefined, customerType, rules);
  return {
    ...product,
    displayPrice: priced.unitPrice,
    appliedPricing: priced.appliedPricing,
    variants: product.variants?.map(variant => {
      const variantPrice = priceCatalogVariantForCustomer(product, variant, customerType, rules);
      return { ...variant, displayPrice: variantPrice.unitPrice, appliedPricing: variantPrice.appliedPricing };
    }),
  };
}
