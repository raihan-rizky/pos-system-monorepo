import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProductCatalogDetails, getProductUnitBadges } from "@/components/inventory/ProductCatalogDetails";
import ProductTable from "@/components/inventory/ProductTable";
import type { Product } from "@/hooks/useProducts";

const product = {
  id: "coffee", name: "Kopi", sku: "KOPI", unit: "pcs", price: 2000, costPrice: null,
  stock: 0, minStock: 1, isActive: true, description: "Kopi bubuk untuk sehari-hari",
  category: { id: "food", name: "Makanan", icon: null, color: null },
  variants: [ { id: "pack", unit: "pak", stock: 0 }, { id: "box", unit: "dus", stock: 12 }, { id: "piece", unit: " PCS ", stock: 0 } ],
} as Product;

describe("Product catalog details", () => {
  it("includes all units even with empty stock and removes duplicates", () => {
    expect(getProductUnitBadges(product).map(badge => badge.unit).sort()).toEqual(["dus", "pak", "pcs"]);
  });
  it("keeps colors stable when variants are reordered and gives every unit a distinct color", () => {
    const badges = getProductUnitBadges(product);
    expect(new Set(badges.map(b => b.backgroundColor)).size).toBe(3);
    expect(getProductUnitBadges({ ...product, variants: [...product.variants!].reverse() })).toEqual(badges);
    for (const badge of badges) {
      expect(getProductUnitBadges({ unit: badge.unit })[0].backgroundColor).toBe(badge.backgroundColor);
    }
  });
  it("handles single units and ignores blank labels", () => {
    expect(getProductUnitBadges({ unit: " rim " }).map(b => b.unit)).toEqual(["rim"]);
    expect(getProductUnitBadges({ unit: " ", variants: [{ unit: "" }] })).toEqual([]);
  });
  it("supports custom unit names without treating them as object properties", () => {
    for (const unit of ["constructor", "toString", "__proto__", "karung"]) {
      expect(getProductUnitBadges({ unit })[0].backgroundColor).toMatch(/^hsl\([\d.]+ 80% 94%\)$/);
    }
  });
  it("renders clamped description, named badges and wrapping", () => {
    const html = renderToStaticMarkup(<ProductCatalogDetails product={product} />);
    expect(html).toContain(product.description);
    expect(html).toContain("line-clamp-2");
    expect(html).toContain('aria-label="Satuan tersedia"');
    expect(html).toContain("flex-wrap");
    for (const unit of ["pcs", "pak", "dus"]) expect(html).toContain(`>${unit}</span>`);
  });
  it("renders details in both desktop table and mobile list without description for empty text", () => {
    const html = renderToStaticMarkup(<ProductTable products={[product]} isLoading={false} onEdit={vi.fn()} canUpdateProduct={false} />);
    expect(html.match(/aria-label="Satuan tersedia"/g)).toHaveLength(2);
    expect(html.match(/aria-label="Deskripsi produk"/g)).toHaveLength(2);
    expect(renderToStaticMarkup(<ProductCatalogDetails product={{ ...product, description: " " }} />)).not.toContain('aria-label="Deskripsi produk"');
  });
});
