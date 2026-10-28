import { describe, expect, it } from "vitest";
import type { Product } from "@/hooks/useProducts";
import type { ProductCartItem, PrintingServiceCartItem } from "@/hooks/useCart";
import { priceCatalogProductForCustomer, priceCatalogVariantForCustomer } from "@/features/customer-category-pricing/helpers/product-pricing";
import { priceCartItemsForCheckout } from "@/features/pos-checkout/helpers/checkout-pricing";

const product = {
  id: "paper", name: "Kertas", price: 4490, unit: "lembar", costPrice: 3000,
  hargaAgen: 4050, hargaDinas: 4049, category: { id: "paper", name: "Kertas" },
  variants: [{ id: "rim", price: 4549, unit: "rim", costPrice: 2000, hargaAgen: null, hargaDinas: null }],
} as Product;
const cartItem: ProductCartItem = {
  cartLineId: "PRODUCT:paper", lineType: "PRODUCT", productId: "paper", name: "Kertas",
  price: 4490, catalogPrice: 4490, costPrice: 3000, quantity: 2,
  unit: "lembar", stock: 50, categoryId: "paper", categoryName: "Kertas",
};
const disabled = { enabled: false, increment: 500, threshold: 50 };

describe("harga efektif katalog dan checkout", () => {
  it.each([10_000_000_000, 9_999_999_999.99])("menandai harga khusus %s yang melebihi kapasitas tanpa merusak keranjang", price => {
    const [priced] = priceCartItemsForCheckout({
      items: [cartItem], customerType: "INDUSTRI", pricingRules: [],
      manualPrices: { [cartItem.cartLineId]: price }, role: "OWNER",
    });
    if (priced.lineType !== "PRODUCT") throw new Error("Expected product");
    expect(priced.priceError).toMatch(/kapasitas/);
    expect(priced.price).toBe(0);
  });
  it("membulatkan tiap satuan serta mempertahankan harga master dan HPP", () => {
    const priced = priceCatalogProductForCustomer(product, "UMUM", []);
    expect(priced.displayPrice).toBe(4500);
    expect(priced.price).toBe(4490);
    expect(priced.costPrice).toBe(3000);
    expect(priced.priceRounding).toMatchObject({ originalPrice: 4490, direction: "UP", difference: 10 });
    expect(priced.variants?.[0].displayPrice).toBe(4500);
    expect(priced.variants?.[0].priceRounding).toMatchObject({ originalPrice: 4549, direction: "DOWN", difference: -49 });
  });

  it("menggunakan aturan pada harga member yang dipilih", () => {
    expect(priceCatalogVariantForCustomer(product, undefined, "AGEN", []).unitPrice).toBe(4500);
    expect(priceCatalogVariantForCustomer(product, undefined, "PEMERINTAH", []).unitPrice).toBe(4000);
  });

  it("membulatkan setelah diskon selesai agar harga asal tidak terpotong lebih awal", () => {
    const priced = priceCatalogVariantForCustomer(product, undefined, "UMUM", [{
      id: "discount", categoryId: "paper", customerType: "ALL", mode: "PERCENT_DISCOUNT", value: 10, isActive: true,
    }]);
    expect(priced.unitPrice).toBe(4000);
    expect(priced.priceRounding?.originalPrice).toBe(4041);
    expect(priced.appliedPricing?.appliedUnitPrice).toBe(4000);
  });

  it("memulihkan harga asal ketika aturan dimatikan dan memakai parameter alternatif", () => {
    expect(priceCatalogProductForCustomer(product, "UMUM", [], disabled).displayPrice).toBe(4490);
    expect(priceCatalogProductForCustomer(product, "UMUM", [], { enabled: true, increment: 1000, threshold: 200 }).displayPrice).toBe(5000);
  });

  it("menyamakan harga keranjang, satuan alternatif, dan metadata", () => {
    const [priced] = priceCartItemsForCheckout({
      items: [{ ...cartItem, unitOptions: [{ ...cartItem, price: 4049, catalogPrice: 4049 }] }],
      customerType: "UMUM", pricingRules: [], manualPrices: {}, role: "CASHIER",
    });
    if (priced.lineType !== "PRODUCT") throw new Error("Expected product");
    expect(priced.price).toBe(4500);
    expect(priced.priceRounding?.originalPrice).toBe(4490);
    expect(priced.unitOptions?.[0].price).toBe(4000);
    expect(priced.unitOptions?.[0].priceRounding?.direction).toBe("DOWN");
    expect(priced.catalogPrice).toBe(4490);
  });

  it("membulatkan harga khusus transaksi pada tahap terakhir", () => {
    const [priced] = priceCartItemsForCheckout({
      items: [{ ...cartItem, transactionPrice: 4050 }], customerType: "UMUM",
      pricingRules: [], manualPrices: {}, role: "OWNER",
    });
    expect(priced.price).toBe(4500);
    if (priced.lineType !== "PRODUCT") throw new Error("Expected product");
    expect(priced.priceRounding?.originalPrice).toBe(4050);
    expect(priced.appliedPricing).toBeNull();
  });

  it("menghormati pengaturan mati pada checkout", () => {
    const [priced] = priceCartItemsForCheckout({
      items: [cartItem], customerType: "UMUM", pricingRules: [], manualPrices: {}, role: "OWNER", roundingSettings: disabled,
    });
    expect(priced.price).toBe(4490);
  });

  it("mempertahankan harga jasa percetakan", () => {
    const service: PrintingServiceCartItem = { cartLineId: "service", lineType: "PRINTING_SERVICE", printingServiceId: null, name: "Cetak", price: 4050, quantity: 1, unit: "lembar", needsMaterial: false };
    expect(priceCartItemsForCheckout({ items: [service], customerType: "UMUM", pricingRules: [], manualPrices: {}, role: "OWNER" })[0].price).toBe(4050);
  });
});
