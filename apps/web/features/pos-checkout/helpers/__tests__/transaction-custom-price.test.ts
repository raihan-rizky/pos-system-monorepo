import { describe, expect, it } from "vitest";
import { applyTransactionPrice, type ProductCartItem } from "@/hooks/useCart";
import { priceCartItemsForCheckout } from "../checkout-pricing";
import { refreshCartCatalogPrices } from "../cart-catalog-pricing";
import type { Product } from "@/hooks/useProducts";
import { resolveTransactionCustomPrice } from "../transaction-custom-price";

const product: ProductCartItem = {
  cartLineId: "PRODUCT:mouse", lineType: "PRODUCT", productId: "mouse",
  name: "Alas Mouse Pad", price: 13500, catalogPrice: 13500, quantity: 2,
  unit: "Bh", stock: 10, costPrice: 7000, categoryId: "office", categoryName: "Alat tulis",
};
const price = (items: ProductCartItem[]) => priceCartItemsForCheckout({
  items, customerType: "UMUM", role: "OWNER", pricingRules: [], manualPrices: {},
  specialPricingEnabled: false, roundingSettings: { enabled: false, increment: 500, threshold: 50 },
});

describe("harga custom hanya pada nota aktif", () => {
  it("carries the raw customer manual price and replaces the invoice override when the modal edits it", () => {
    const result = priceCartItemsForCheckout({ items: [{ ...product, transactionPrice: 14000 }],
      customerType: "INDUSTRI", role: "CASHIER", pricingRules: [],
      manualPrices: { [product.cartLineId]: 4050 }, specialPricingEnabled: true,
      roundingSettings: { enabled: true, increment: 500, threshold: 50, excludedCategoryIds: ["office"] },
    })[0];
    expect(result).toMatchObject({ price: 4050, customerManualPrice: 4050, transactionPrice: null });
  });
  it("accepts zero only when restoring a trusted saved rounding result", () => {
    const input = { pricedLine: { unitPrice: 100, appliedPricing: null }, transactionPrice: 0,
      customerType: "UMUM" as const, categoryId: "office" };
    expect(() => resolveTransactionCustomPrice(input)).toThrow("Harga custom harus lebih dari 0");
    expect(resolveTransactionCustomPrice({ ...input, allowSavedZeroPrice: true })).toMatchObject({
      unitPrice: 0, appliedPricing: { ruleId: "transaction-custom-price", appliedUnitPrice: 0 },
    });
  });
  it("uses the invoice price even while Harga Khusus is off", () => {
    const items = applyTransactionPrice([product], product.cartLineId, 12000) as ProductCartItem[];
    expect(price(items)[0]).toMatchObject({ price: 12000, transactionPrice: 12000, catalogPrice: 13500 });
    expect(product.price).toBe(13500);
  });

  it("keeps custom price after catalog refresh and resets to the latest automatic price", () => {
    const custom = applyTransactionPrice([product], product.cartLineId, 12000);
    const refreshed = refreshCartCatalogPrices(custom, [{
      id: "mouse", price: 15000, costPrice: 7000, category: { id: "office", name: "Alat tulis" },
    } as Product]) as ProductCartItem[];
    expect(price(refreshed)[0].price).toBe(12000);
    const reset = applyTransactionPrice(refreshed, product.cartLineId, null) as ProductCartItem[];
    expect(price(reset)[0]).toMatchObject({ price: 15000, transactionPrice: null });
    expect(price([product])[0]).toMatchObject({ price: 13500 });
  });

  it("preserves explicit custom intent when its amount equals the automatic price", () => {
    const custom = applyTransactionPrice([product], product.cartLineId, 13500) as ProductCartItem[];
    expect(price(custom)[0]).toMatchObject({ price: 13500, transactionPrice: 13500 });
  });
});
