import { describe, expect, it } from "vitest";
import type { CartItem } from "@/hooks/useCart";
import type { Product } from "@/hooks/useProducts";
import { refreshCartCatalogPrices } from "../cart-catalog-pricing";

describe("refresh cart prices", () => {
  it("refreshes the base modal of alternate units too", () => {
    const item = { lineType: "PRODUCT", productId: "pcs", unitOptions: [{ productId: "rim", baseCostPrice: 700 }] } as CartItem;
    const product = { id: "rim", price: 6000, baseCostPrice: 800, baseCostUnit: "pcs", category: { id: "paper", name: "Kertas" } } as Product;
    const [fresh] = refreshCartCatalogPrices([item], [product]);
    if (fresh.lineType !== "PRODUCT") throw new Error("Expected product");
    expect(fresh.unitOptions?.[0].baseCostPrice).toBe(800);
  });
  it("refreshes base modal beyond the current catalog page and preserves manual price", () => {
    const item = { lineType: "PRODUCT", productId: "rim", cartLineId: "line", price: 4500, catalogPrice: 5000, transactionPrice: 4500, baseCostPrice: 700, quantity: 2 } as CartItem;
    const product = { id: "rim", price: 6000, baseCostPrice: 800, baseCostUnit: "pcs", category: { id: "paper", name: "Kertas" } } as Product;
    const [fresh] = refreshCartCatalogPrices([item], [product]);
    expect(fresh).toMatchObject({ price: 4500, catalogPrice: 6000, baseCostPrice: 800, quantity: 2, transactionPrice: 4500 });
  });
  it("keeps cart data if the catalog cannot supply that product", () => {
    const item = { lineType: "PRODUCT", productId: "rim" } as CartItem;
    expect(refreshCartCatalogPrices([item], [])).toEqual([item]);
  });
});
