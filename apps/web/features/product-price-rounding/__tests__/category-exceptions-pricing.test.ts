import { describe, expect, it } from "vitest";
import type { Product } from "@/hooks/useProducts";
import type { ProductCartItem } from "@/hooks/useCart";
import { priceCatalogProductForCustomer, priceCatalogVariantForCustomer } from "@/features/customer-category-pricing/helpers/product-pricing";
import { priceCartItemsForCheckout } from "@/features/pos-checkout/helpers/checkout-pricing";

const settings = { enabled: true, increment: 500, threshold: 50, excludedCategoryIds: ["paper"] };
const product = {
  id: "paper-product", name: "Kertas", price: 4050, unit: "lembar", costPrice: 3000,
  hargaAgen: 4049, hargaDinas: 4549, category: { id: "paper", name: "Kertas" },
  variants: [{ id: "rim", price: 4550, unit: "rim", costPrice: 3000, hargaAgen: null, hargaDinas: null }],
} as Product;
const item: ProductCartItem = {
  cartLineId: "paper-line", lineType: "PRODUCT", productId: "paper-product", name: "Kertas",
  price: 4050, catalogPrice: 4050, costPrice: 3000, quantity: 1,
  unit: "lembar", stock: 50, categoryId: "paper", categoryName: "Kertas",
};

describe("harga produk pada kategori yang dikecualikan", () => {
  it("mempertahankan harga reguler dan varian di katalog", () => {
    const priced = priceCatalogProductForCustomer(product, "UMUM", [], settings);
    expect(priced.displayPrice).toBe(4050);
    expect(priced.priceRounding).toBeNull();
    expect(priced.variants?.[0].displayPrice).toBe(4550);
    expect(priced.variants?.[0].priceRounding).toBeNull();
  });

  it("mempertahankan harga agen, dinas, dan hasil aturan khusus", () => {
    expect(priceCatalogVariantForCustomer(product, undefined, "AGEN", [], settings).unitPrice).toBe(4049);
    expect(priceCatalogVariantForCustomer(product, undefined, "PEMERINTAH", [], settings).unitPrice).toBe(4549);
    const discounted = priceCatalogVariantForCustomer(product, undefined, "UMUM", [{
      id: "discount", categoryId: "paper", customerType: "ALL", mode: "PERCENT_DISCOUNT", value: 10, isActive: true,
    }], settings);
    expect(discounted.unitPrice).toBe(3645);
    expect(discounted.priceRounding).toBeNull();
  });

  it("menghitung keranjang campuran dan harga khusus berdasarkan kategori masing-masing", () => {
    const [exempt, normal] = priceCartItemsForCheckout({
      items: [
        { ...item, transactionPrice: 4050 },
        { ...item, cartLineId: "ink-line", productId: "ink-product", categoryId: "ink", categoryName: "Tinta" },
      ],
      customerType: "UMUM", pricingRules: [], manualPrices: {}, role: "OWNER", roundingSettings: settings,
    });
    expect(exempt.price).toBe(4050);
    expect(normal.price).toBe(4500);
    if (exempt.lineType !== "PRODUCT") throw new Error("Expected product");
    expect(exempt.priceRounding).toBeNull();
  });

  it("menggunakan kategori setiap pilihan satuan", () => {
    const [priced] = priceCartItemsForCheckout({
      items: [{ ...item, unitOptions: [
        { ...item, catalogPrice: 4050 },
        { ...item, productId: "ink-product", categoryId: "ink", categoryName: "Tinta", catalogPrice: 4050 },
      ] }],
      customerType: "UMUM", pricingRules: [], manualPrices: {}, role: "OWNER", roundingSettings: settings,
    });
    if (priced.lineType !== "PRODUCT") throw new Error("Expected product");
    expect(priced.unitOptions?.map((option) => option.price)).toEqual([4050, 4500]);
  });
});
