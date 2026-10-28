import { describe, expect, it } from "vitest";
import type { ProductCartItem } from "@/hooks/useCart";
import { priceCartItemsForCheckout } from "@/features/pos-checkout/helpers/checkout-pricing";
import { applyCartItemDiscounts, discountedLineSubtotal } from "@/features/pos-checkout/helpers/item-discount";
import { calculateTransactionTax } from "@/features/transaction-tax/helpers/tax-calculation";

const line: ProductCartItem = { cartLineId: "paper", lineType: "PRODUCT", productId: "paper", name: "Produk contoh", price: 4050, catalogPrice: 4050, costPrice: 2030.25, quantity: 3, unit: "pcs", stock: 10, categoryId: "paper", categoryName: "Kertas" };

describe("pembulatan sebelum diskon dan pajak transaksi", () => {
  it.each([
    { enabled: true, price: 4500, lineDiscount: 1350, subtotal: 12150, tax: 1337, total: 13487 },
    { enabled: false, price: 4050, lineDiscount: 1215, subtotal: 10935, tax: 1203, total: 12138 },
  ])("menghitung total konsisten ketika pembulatan aktif=$enabled", expected => {
    const priced = priceCartItemsForCheckout({ items: [line], customerType: "UMUM", pricingRules: [], manualPrices: {}, role: "CASHIER", roundingSettings: { enabled: expected.enabled, increment: 500, threshold: 50 } });
    const discounted = applyCartItemDiscounts(priced, { paper: { mode: "PERCENT", value: 10 } });
    expect(discounted[0].price).toBe(expected.price);
    expect(discounted[0].discount).toBe(expected.lineDiscount);
    const subtotal = discountedLineSubtotal(discounted[0].price, discounted[0].quantity, discounted[0].discount);
    expect(subtotal).toBe(expected.subtotal);
    expect(calculateTransactionTax({ subtotal, discount: 0, taxRate: 11, taxMethod: "STANDARD" })).toMatchObject({ tax: expected.tax, total: expected.total });
    expect(line.price).toBe(4050);
    expect(line.costPrice).toBe(2030.25);
  });

  it("menghitung ulang dari harga asal saat kebijakan berubah tanpa pembulatan bertingkat", () => {
    const current = (items: ProductCartItem[], enabled: boolean, increment: number, threshold: number) => priceCartItemsForCheckout({ items, customerType: "UMUM", pricingRules: [], manualPrices: {}, role: "OWNER", roundingSettings: { enabled, increment, threshold } }) as ProductCartItem[];
    const first = current([line], true, 500, 50);
    const changed = current(first, true, 1000, 100);
    const disabled = current(changed, false, 1000, 100);
    expect(first[0].price).toBe(4500);
    expect(changed[0].price).toBe(4000);
    expect(changed[0].priceRounding?.originalPrice).toBe(4050);
    expect(disabled[0].price).toBe(4050);
    expect(disabled[0].priceRounding).toBeNull();
  });
});
