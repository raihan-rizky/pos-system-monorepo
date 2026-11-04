import type { CustomerType, PricedProductLine } from "@/features/customer-category-pricing/helpers/pricing-rules";

/** Snapshot marker for an authorized manual Harga Khusus, distinct from an invoice price. */
export const CUSTOMER_MANUAL_PRICE_RULE_ID = "customer-manual-price";

export function resolveCustomerManualPrice(input: {
  pricedLine: PricedProductLine;
  manualPrice: number;
  customerType: CustomerType;
  categoryId: string;
  categoryName?: string | null;
}): PricedProductLine {
  const unitPrice = Math.round((input.manualPrice + Number.EPSILON) * 100) / 100;
  return {
    unitPrice,
    appliedPricing: {
      ruleId: CUSTOMER_MANUAL_PRICE_RULE_ID,
      customerType: input.customerType,
      categoryId: input.categoryId,
      categoryName: input.categoryName ?? null,
      mode: "FLAT_DISCOUNT",
      value: Math.round((input.pricedLine.unitPrice - unitPrice) * 100) / 100,
      originalUnitPrice: input.pricedLine.unitPrice,
      appliedUnitPrice: unitPrice,
    },
  };
}
