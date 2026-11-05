import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CartSidebar } from "@/components/CartSidebar";
import { normalizeStoredCartItems, type ProductCartItem } from "@/hooks/useCart";
import type { Product } from "@/hooks/useProducts";
import { priceCartItemsForCheckout } from "@/features/pos-checkout/helpers/checkout-pricing";
import { mapProductToCartItem } from "../services/cart-mapping";

// Prisma Decimal values arrive as JSON strings, despite the client Product type.
const apiProduct: Product = JSON.parse(JSON.stringify({
  id: "paper", name: "Kertas contoh", sku: "PAPER", price: "43000",
  costPrice: "30000", hargaAgen: "37000", hargaDinas: "47000",
  stock: 110, minStock: 1, unit: "Pak", isActive: true,
  category: { id: "paper-category", name: "Kertas", icon: null, color: null },
  size: null, material: null, imageUrl: null,
}));

function renderPricedCart(item: ProductCartItem) {
  const items = priceCartItemsForCheckout({
    items: [item], customerType: "UMUM", pricingRules: [], manualPrices: {},
    role: "OWNER", specialPricingEnabled: true,
  });
  return renderToStaticMarkup(<CartSidebar
    items={items} subtotal={43000} totalItems={1}
    onUpdateQuantity={() => {}} onRemoveItem={() => {}}
    onClearCart={() => {}} onCheckout={() => {}}
    specialPricingEnabled
  />);
}

function cartItem(product: Product, variantId?: string): ProductCartItem {
  const mapped = mapProductToCartItem(product, variantId);
  return {
    ...mapped, cartLineId: `PRODUCT:${mapped.id}`, productId: mapped.id,
    lineType: "PRODUCT", catalogPrice: mapped.price, quantity: 1,
    costPrice: mapped.costPrice ?? null, hargaAgen: mapped.hargaAgen ?? null,
    hargaDinas: mapped.hargaDinas ?? null, appliedPricing: null,
  };
}

function expectReferencePrices(html: string) {
  expect(html).toMatch(/<dt[^>]*>Normal<\/dt><dd[^>]*>[^<]*43\.000/);
  expect(html).toMatch(/<dt[^>]*>Agen \(manual\)<\/dt><dd[^>]*>[^<]*37\.000/);
  expect(html).toMatch(/<dt[^>]*>Dinas \(manual\)<\/dt><dd[^>]*>[^<]*47\.000/);
  expect(html).not.toContain("NaN");
}

describe("product selection with API decimal prices", () => {
  it("renders the cart after selecting a simple search result with string member prices", () => {
    expectReferencePrices(renderPricedCart(cartItem(apiProduct)));
  });

  it("renders the selected variant and normalizes the other unit prices", () => {
    const product: Product = {
      ...apiProduct,
      stockGroupId: "paper-group",
      variants: [
        { ...apiProduct, id: "paper-pak", stockGroup: { id: "paper-group", displayName: "Kertas contoh", baseUnit: "Pak", baseStock: 110 } },
        { ...apiProduct, id: "paper-box", unit: "Dus", stockGroup: { id: "paper-group", displayName: "Kertas contoh", baseUnit: "Pak", baseStock: 110 } },
      ],
      defaultVariant: { id: "paper-pak", unit: "Pak", price: 43000, stock: 110, sku: "PAPER" },
    };
    const item = cartItem(product, "paper-box");
    expectReferencePrices(renderPricedCart(item));
    expect(item.productId).toBe("paper-box");
    expect(item.unitOptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: "paper-pak", hargaAgen: 37000, hargaDinas: 47000 }),
      expect.objectContaining({ productId: "paper-box", hargaAgen: 37000, hargaDinas: 47000 }),
    ]));
  });

  it.each([null, undefined, 0])("preserves an unset member price (%s) and displays the normal-price fallback", (unset) => {
    const product: Product = JSON.parse(JSON.stringify({ ...apiProduct, hargaAgen: unset, hargaDinas: unset }));
    const item = cartItem(product);
    const html = renderPricedCart(item);
    expect(html).toMatch(/<dt[^>]*>Agen \(manual\)<\/dt><dd[^>]*>[^<]*43\.000/);
    expect(html).toMatch(/<dt[^>]*>Dinas \(manual\)<\/dt><dd[^>]*>[^<]*43\.000/);
    expect(html).not.toContain("NaN");
  });

  it("restores a cart saved before decimal member prices were normalized", () => {
    const legacy: ProductCartItem = JSON.parse(JSON.stringify({
      ...cartItem(apiProduct), hargaAgen: "37000", hargaDinas: "47000",
      unitOptions: [{ ...cartItem(apiProduct), hargaAgen: "37000", hargaDinas: "47000" }],
    }));
    const [restored] = normalizeStoredCartItems([legacy]) as ProductCartItem[];
    expectReferencePrices(renderPricedCart(restored));
    expect(restored.unitOptions?.[0]).toMatchObject({ hargaAgen: 37000, hargaDinas: 47000 });
  });
});
