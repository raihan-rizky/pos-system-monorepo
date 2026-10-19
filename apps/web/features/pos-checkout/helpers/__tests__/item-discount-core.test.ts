import { describe, expect, it } from "vitest";
import type { ProductCartItem } from "@/hooks/useCart";
import { buildOfflineSyncDecision } from "@/lib/offline/offline-sync-core";
import { priceCartItemsForCheckout } from "../checkout-pricing";
import { applyCartItemDiscounts } from "../item-discount";
import { buildDraftCheckoutItems, buildOfflineCheckoutTotals } from "../checkout-persistence";
import { canSubmitPayment } from "../payment-submission";

const product: ProductCartItem = {
  cartLineId: "row-1", lineType: "PRODUCT", productId: "paper", name: "Kertas contoh",
  price: 10000, catalogPrice: 10000, hargaAgen: 8000, quantity: 3,
  unit: "lembar", stock: 100, categoryId: "paper", categoryName: "Kertas",
};
const now = new Date("2026-10-19T03:00:00Z");

describe("item discount checkout persistence contract", () => {
  // All expected amounts are hand calculated, independent of the pricing helpers.
  it.each([
    { price: 10000, quantity: 3, mode: "RP" as const, value: 5000, invoice: 5000, rate: 10, lineDiscount: 5000, subtotal: 25000, total: 22000 },
    { price: 10000, quantity: 3, mode: "PERCENT" as const, value: 12.5, invoice: 250, rate: 12.5, lineDiscount: 3750, subtotal: 26250, total: 29250 },
    { price: 99.99, quantity: 3, mode: "PERCENT" as const, value: 33.33, invoice: 0.99, rate: 12.5, lineDiscount: 99.98, subtotal: 199.99, total: 224 },
    { price: 0, quantity: 2, mode: "RP" as const, value: 0, invoice: 0, rate: 100, lineDiscount: 0, subtotal: 0, total: 0 },
    { price: 1000, quantity: 0.5, mode: "RP" as const, value: 25, invoice: 25, rate: 10, lineDiscount: 25, subtotal: 475, total: 495 },
    { price: 10000, quantity: 3, mode: "PERCENT" as const, value: 100, invoice: 0, rate: 12.5, lineDiscount: 30000, subtotal: 0, total: 0 },
  ])("keeps checkout, draft, and offline sync consistent for $mode $value at $rate% tax", scenario => {
    const priced = priceCartItemsForCheckout({
      items: [{ ...product, price: scenario.price, catalogPrice: scenario.price, quantity: scenario.quantity }],
      customerType: "UMUM", pricingRules: [], manualPrices: {}, role: "CASHIER",
    });
    const discounted = applyCartItemDiscounts(priced, { "row-1": { mode: scenario.mode, value: scenario.value } });
    expect(discounted[0].discount).toBe(scenario.lineDiscount);
    const draftItems = buildDraftCheckoutItems(discounted);
    expect(draftItems[0]).toMatchObject({ price: scenario.price, quantity: scenario.quantity, discount: scenario.lineDiscount });
    const totals = buildOfflineCheckoutTotals(discounted, scenario.invoice, scenario.rate);
    expect(totals).toEqual({ originalSubtotal: scenario.subtotal, originalTotal: scenario.total });
    const decision = buildOfflineSyncDecision({
      clientMutationId: "discount-contract", createdAt: now.toISOString(), items: draftItems,
      discount: scenario.invoice, taxRate: scenario.rate, originalTotal: totals.originalTotal,
    }, { now, stockByProductId: new Map([["paper", 100]]) });
    expect(decision).toMatchObject({ resultStatus: "SYNCED", subtotal: scenario.subtotal, total: scenario.total });
    expect(decision.items[0].discount).toBe(scenario.lineDiscount);
    expect(canSubmitPayment({ mode: "PAID", total: scenario.total, amountPaid: scenario.total, hasCustomer: false, hasInvalidManualPrice: false })).toBe(true);
  });

  it.each([
    { customerType: "UMUM" as const, manualPrice: 5000, transactionPrice: undefined, price: 10000, discount: 3000, subtotal: 27000, invoice: 2000, total: 27500 },
    { customerType: "AGEN" as const, manualPrice: undefined, transactionPrice: undefined, price: 8000, discount: 2400, subtotal: 21600, invoice: 1600, total: 22000 },
    { customerType: "INDUSTRI" as const, manualPrice: 5000, transactionPrice: undefined, price: 5000, discount: 1500, subtotal: 13500, invoice: 500, total: 14300 },
    { customerType: "UMUM" as const, manualPrice: undefined, transactionPrice: 6000, price: 6000, discount: 1800, subtotal: 16200, invoice: 200, total: 17600 },
  ])("applies the item discount after $customerType customer/custom pricing at $price", scenario => {
    const priced = priceCartItemsForCheckout({
      items: [{ ...product, transactionPrice: scenario.transactionPrice }], customerType: scenario.customerType,
      pricingRules: [], manualPrices: scenario.manualPrice == null ? {} : { "row-1": scenario.manualPrice }, role: "CASHIER",
    });
    const discounted = applyCartItemDiscounts(priced, { "row-1": { mode: "PERCENT", value: 10 } });
    expect(discounted[0]).toMatchObject({ price: scenario.price, discount: scenario.discount });
    expect(buildOfflineCheckoutTotals(discounted, scenario.invoice, 10)).toEqual({ originalSubtotal: scenario.subtotal, originalTotal: scenario.total });
  });
});
