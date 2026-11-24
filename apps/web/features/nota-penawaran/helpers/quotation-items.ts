import { calculateTransactionTax, getTransactionTaxMethod } from "@/features/transaction-tax/helpers/tax-calculation";

export const MAX_QUOTATION_AMOUNT = 9_999_999_999.99;

export type QuotationItemInput = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  productId: string | null;
};

export function roundQuotationAmount(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateQuotationTotals(
  draft: { subtotal: unknown; discount?: unknown; tax?: unknown; taxRate?: unknown; taxMethod?: string | null; status: string },
  addedSubtotal: number,
) {
  const subtotal = roundQuotationAmount(Number(draft.subtotal) + addedSubtotal);
  const discount = Number(draft.discount ?? 0);
  if (draft.taxRate == null) {
    const tax = Number(draft.tax ?? 0);
    return { subtotal, tax, total: roundQuotationAmount(Math.max(0, subtotal - discount + tax)) };
  }
  const { tax, total } = calculateTransactionTax({ subtotal, discount, taxRate: Number(draft.taxRate), taxMethod: getTransactionTaxMethod(draft) });
  return { subtotal, tax, total };
}
