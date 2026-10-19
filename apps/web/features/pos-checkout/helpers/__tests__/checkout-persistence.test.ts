import { describe, expect, it } from "vitest";
import type { CartItem } from "@/hooks/useCart";
import { buildDraftCheckoutItems, buildOfflineCheckoutTotals } from "../checkout-persistence";
const items = [
  { cartLineId: "a", lineType: "PRODUCT", productId: "p1", name: "Kertas", price: 10000, quantity: 3, discount: 5000, size: "A4", material: null, transactionPrice: 10000 },
  { cartLineId: "b", lineType: "PRODUCT", productId: "p2", name: "Map", price: 5000, quantity: 2, discount: 1000 },
] as CartItem[];

describe("checkout persistence payloads", () => {
  it("keeps monetary line discounts when mapping the actual draft request", () => {
    expect(buildDraftCheckoutItems(items)).toMatchObject([
      { productId: "p1", price: 10000, quantity: 3, discount: 5000, transactionPrice: 10000, size: "A4" },
      { productId: "p2", price: 5000, quantity: 2, discount: 1000 },
    ]);
  });
  it("keeps service lines out of the existing product-only quotation flow", () => {
    expect(buildDraftCheckoutItems([...items, { cartLineId: "service", lineType: "PRINTING_SERVICE", price: 1000, quantity: 1 } as CartItem])).toHaveLength(2);
  });
  it("queues the same net subtotal and taxed total that checkout showed", () => {
    expect(buildOfflineCheckoutTotals(items, 4000, 10)).toEqual({ originalSubtotal: 34000, originalTotal: 33000 });
  });
  it("keeps old carts without line discounts compatible", () => {
    expect(buildOfflineCheckoutTotals([{ price: 10000, quantity: 2 }], 1000, 10)).toEqual({ originalSubtotal: 20000, originalTotal: 20900 });
  });
});
