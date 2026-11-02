import type { CustomerType, PricedProductLine } from "@/features/customer-category-pricing/helpers/pricing-rules";

/** Synthetic snapshot identifier, like harga-agen; it never changes a product or pricing rule. */
export const TRANSACTION_CUSTOM_PRICE_RULE_ID = "transaction-custom-price";

export function resolveTransactionCustomPrice(input: {
  pricedLine: PricedProductLine;
  transactionPrice?: number | null;
  customerType: CustomerType;
  categoryId: string;
  categoryName?: string | null;
  /** Only for a trusted saved snapshot whose positive input was rounded to zero. */
  allowSavedZeroPrice?: boolean;
}): PricedProductLine {
  if (input.transactionPrice == null) return input.pricedLine;
  if (!Number.isFinite(input.transactionPrice) || input.transactionPrice < 0 ||
      (input.transactionPrice === 0 && !input.allowSavedZeroPrice)) {
    throw new Error("Harga custom harus lebih dari 0.");
  }
  const unitPrice = Math.round((input.transactionPrice + Number.EPSILON) * 100) / 100;
  return {
    unitPrice,
    appliedPricing: {
      ruleId: TRANSACTION_CUSTOM_PRICE_RULE_ID,
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
