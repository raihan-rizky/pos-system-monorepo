import { discountedLineSubtotal } from "./item-discount";
import type { DraftItemInput } from "@/features/transactions-draft/types/draft";
import type { CartItem, ProductCartItem } from "@/hooks/useCart";
import { calculateTransactionTax } from "@/features/transaction-tax/helpers/tax-calculation";

export function buildDraftCheckoutItems(items: CartItem[]): DraftItemInput[] {
  return items.filter((item): item is ProductCartItem => item.lineType === "PRODUCT").map(item => ({
    productId: item.productId, name: item.name, size: item.size ?? null, material: item.material ?? null,
    price: item.price, transactionPrice: item.transactionPrice, quantity: item.quantity, discount: item.discount ?? 0,
  }));
}

export function buildOfflineCheckoutTotals(items: { price: number; quantity: number; discount?: number }[], discount: number, taxRate: number) {
  const originalSubtotal = Math.round(items.reduce((sum, item) => sum + discountedLineSubtotal(item.price, item.quantity, item.discount), 0) * 100) / 100;
  return { originalSubtotal, originalTotal: calculateTransactionTax({ subtotal: originalSubtotal, discount, taxRate, taxMethod: "STANDARD" }).total };
}
