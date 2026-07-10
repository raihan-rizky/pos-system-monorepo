import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CartItem, ProductCartItem } from "@/hooks/useCart";
import { useCart } from "@/hooks/useCart";

const productItem: ProductCartItem = {
  cartLineId: "PRODUCT:paper-rim",
  lineType: "PRODUCT",
  productId: "paper-rim",
  name: "Kertas A4",
  price: 10000,
  catalogPrice: 10000,
  transactionPrice: null,
  costPrice: 7000,
  hargaAgen: 9000,
  hargaDinas: 11000,
  quantity: 1,
  unit: "Rim",
  stock: 20,
  categoryId: "cat-paper",
  categoryName: "Kertas",
  appliedPricing: null,
};

describe("cart quick edit state", () => {
  it("exposes controlled quick edit mutations from the cart hook", () => {
    function CartApiSurface() {
      const cart = useCart() as ReturnType<typeof useCart> & {
        updateTransactionPrice?: unknown;
        syncProductPrices?: unknown;
        syncProductGroupMetadata?: unknown;
      };
      return (
        <div
          data-transaction-price={typeof cart.updateTransactionPrice}
          data-product-prices={typeof cart.syncProductPrices}
          data-group-metadata={typeof cart.syncProductGroupMetadata}
        />
      );
    }

    const html = renderToStaticMarkup(<CartApiSurface />);

    expect(html).toContain('data-transaction-price="function"');
    expect(html).toContain('data-product-prices="function"');
    expect(html).toContain('data-group-metadata="function"');
  });

  it("restores a persisted transaction price as the active price", async () => {
    const cartModule = await import("@/hooks/useCart");
    const normalizeStoredCartItems = (
      cartModule as typeof cartModule & {
        normalizeStoredCartItems?: (items: CartItem[]) => CartItem[];
      }
    ).normalizeStoredCartItems;

    expect(normalizeStoredCartItems).toBeTypeOf("function");
    if (!normalizeStoredCartItems) return;

    const [restored] = normalizeStoredCartItems([
      { ...productItem, transactionPrice: 8000, price: 10000 },
    ]);

    expect(restored).toEqual(
      expect.objectContaining({
        transactionPrice: 8000,
        price: 8000,
      }),
    );
  });

  it("sets a transaction price as the active cart price", async () => {
    const cartModule = await import("@/hooks/useCart");
    const applyTransactionPrice = (
      cartModule as typeof cartModule & {
        applyTransactionPrice?: (
          items: CartItem[],
          cartLineId: string,
          price: number,
        ) => CartItem[];
      }
    ).applyTransactionPrice;

    expect(applyTransactionPrice).toBeTypeOf("function");
    if (!applyTransactionPrice) return;

    const [updated] = applyTransactionPrice(
      [productItem],
      productItem.cartLineId,
      8000,
    );

    expect(updated).toEqual(
      expect.objectContaining({
        transactionPrice: 8000,
        price: 8000,
      }),
    );
  });

  it("clears a transaction price back to the catalog price", async () => {
    const { applyTransactionPrice } = await import("@/hooks/useCart");
    const overriddenItem = {
      ...productItem,
      transactionPrice: 8000,
      price: 8000,
    };

    const [updated] = applyTransactionPrice(
      [overriddenItem],
      productItem.cartLineId,
      null,
    );

    expect(updated).toEqual(
      expect.objectContaining({
        transactionPrice: null,
        price: 10000,
      }),
    );
  });

  it("refreshes master prices without replacing an active transaction price", async () => {
    const cartModule = await import("@/hooks/useCart");
    const applyProductPriceUpdate = (
      cartModule as typeof cartModule & {
        applyProductPriceUpdate?: (
          items: CartItem[],
          productId: string,
          prices: {
            price: number;
            hargaAgen: number | null;
            hargaDinas: number | null;
          },
        ) => CartItem[];
      }
    ).applyProductPriceUpdate;

    expect(applyProductPriceUpdate).toBeTypeOf("function");
    if (!applyProductPriceUpdate) return;

    const [updated] = applyProductPriceUpdate(
      [{ ...productItem, transactionPrice: 8000, price: 8000 }],
      productItem.productId,
      { price: 12000, hargaAgen: 10000, hargaDinas: null },
    );

    expect(updated).toEqual(
      expect.objectContaining({
        catalogPrice: 12000,
        hargaAgen: 10000,
        hargaDinas: null,
        transactionPrice: 8000,
        price: 8000,
      }),
    );
  });

  it("refreshes metadata for every cart variant returned by a group update", async () => {
    const cartModule = await import("@/hooks/useCart");
    const applyProductGroupMetadataUpdate = (
      cartModule as typeof cartModule & {
        applyProductGroupMetadataUpdate?: (
          items: CartItem[],
          productIds: string[],
          metadata: {
            name: string;
            categoryId: string;
            categoryName: string;
            brandId: string | null;
            brandName: string | null;
          },
        ) => CartItem[];
      }
    ).applyProductGroupMetadataUpdate;

    expect(applyProductGroupMetadataUpdate).toBeTypeOf("function");
    if (!applyProductGroupMetadataUpdate) return;

    const secondVariant: ProductCartItem = {
      ...productItem,
      cartLineId: "PRODUCT:paper-box",
      productId: "paper-box",
      unit: "Box",
    };
    const unrelated: ProductCartItem = {
      ...productItem,
      cartLineId: "PRODUCT:ink",
      productId: "ink",
      name: "Tinta",
    };

    const updated = applyProductGroupMetadataUpdate(
      [productItem, secondVariant, unrelated],
      ["paper-rim", "paper-box"],
      {
        name: "Kertas Premium",
        categoryId: "cat-office",
        categoryName: "Perlengkapan Kantor",
        brandId: "brand-paper",
        brandName: "Paper Co",
      },
    );

    expect(updated[0]).toEqual(
      expect.objectContaining({
        name: "Kertas Premium",
        categoryId: "cat-office",
        categoryName: "Perlengkapan Kantor",
        brandId: "brand-paper",
        brandName: "Paper Co",
      }),
    );
    expect(updated[1]).toEqual(expect.objectContaining({ name: "Kertas Premium" }));
    expect(updated[2]).toEqual(expect.objectContaining({ name: "Tinta" }));
  });
});
