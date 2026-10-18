import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Product } from "@/hooks/useProducts";
import { ProductCatalogDetails } from "@/components/inventory/ProductCatalogDetails";
import ProductTable from "@/components/inventory/ProductTable";

const stockGroup = { id: "paper", displayName: "Kertas", baseUnit: "pcs", baseStock: 390 };
const product: Product = {
  id: "dus", name: "Kertas", sku: "KERTAS", unit: "dus", price: 12000,
  costPrice: null, hargaAgen: null, hargaDinas: null, stock: 32.5, minStock: 5,
  size: null, material: null, imageUrl: null, isActive: true,
  category: { id: "atk", name: "ATK", icon: null, color: null },
  stockGroup, unitMultiplierToBase: 12,
  variants: [
    { id: "dus", unit: " Dus ", stock: 32.5, unitMultiplierToBase: 12 },
    { id: "pak", unit: "pak", stock: 65, unitMultiplierToBase: 6 },
    { id: "pcs", unit: "pcs", stock: 390, unitMultiplierToBase: 1 },
  ].map(variant => ({ ...variant, price: 12000, costPrice: null, hargaAgen: null, hargaDinas: null, sku: variant.id })),
};

const render = (value: Product) => renderToStaticMarkup(<ProductCatalogDetails product={value} />);

describe("Products stock unit badges", () => {
  it("shows each unit's stock and conversion without duplicating normalized units", () => {
    const html = render(product);
    for (const label of ["32 dus 6 pcs", "65 pak", "390 pcs"]) expect(html).toContain(`>${label}</span>`);
    expect(html.match(/>32 dus 6 pcs<\/span>/g)).toHaveLength(1);
    expect(html).toContain("1 dus = 12 pcs");
    expect(html).toContain("1 pak = 6 pcs");
    expect(html).not.toContain("1 pcs = 1 pcs");
  });

  it("shows zero stock for a single product and preserves its conversion", () => {
    const html = render({ ...product, stock: 0, variants: undefined });
    expect(html).toContain(">0 dus</span>");
    expect(html).toContain("1 dus = 12 pcs");
  });

  it("uses a variant's stock group and multiplier instead of the root metadata", () => {
    const html = render({ ...product, variants: product.variants?.map(variant => variant.id === "pak"
      ? { ...variant, stock: 1.5, unitMultiplierToBase: 10, stockGroup: { ...stockGroup, baseUnit: "lembar" } }
      : variant) });
    expect(html).toContain(">1 pak 5 lembar</span>");
    expect(html).toContain("1 pak = 10 lembar");
  });

  it("does not borrow the root multiplier for a different unit missing conversion data", () => {
    const html = render({ ...product, variants: product.variants?.map(variant => ({ ...variant, unitMultiplierToBase: undefined })) });
    expect(html).toContain("1 dus = 12 pcs");
    expect(html).toContain(">65 pak</span>");
    expect(html).not.toContain("1 pak =");
  });

  it.each([undefined, 0, -12, Number.NaN, Number.POSITIVE_INFINITY])("hides unavailable or invalid conversion factor %s", factor => {
    const html = render({ ...product, unitMultiplierToBase: factor, variants: undefined });
    expect(html).not.toContain('aria-label="Konversi satuan"');
  });

  it("hides conversion without a base unit", () => {
    const html = render({ ...product, stockGroup: undefined });
    expect(html).not.toContain('aria-label="Konversi satuan"');
    expect(html).toContain(">32.5 dus</span>");
  });

  it("hides conversion when the base unit differs only in casing and spacing", () => {
    const html = render({ ...product, unit: "pcs", stock: 390, unitMultiplierToBase: 1,
      stockGroup: { ...stockGroup, baseUnit: " PCS " }, variants: undefined });
    expect(html).toContain(">390 pcs</span>");
    expect(html).not.toContain('aria-label="Konversi satuan"');
  });

  it.each([[2.5, "2,5"], [1, "1"]])("formats valid conversion factor %s", (factor, label) => {
    const html = render({ ...product, variants: undefined, unitMultiplierToBase: Number(factor) });
    expect(html).toContain(`1 dus = ${label} pcs`);
  });

  it("renders stock and conversion in desktop table and mobile list", () => {
    const html = renderToStaticMarkup(<ProductTable products={[product]} isLoading={false} onEdit={vi.fn()} canUpdateProduct={false} />);
    const badgeRows = html.match(/aria-label="Satuan tersedia"[^>]*>.*?<\/div>/g);
    expect(badgeRows).toHaveLength(2);
    for (const row of badgeRows ?? []) expect(row).toContain(">32 dus 6 pcs</span>");
    expect(html.match(/1 dus = 12 pcs/g)).toHaveLength(2);
    expect(html.match(/1 pak = 6 pcs/g)).toHaveLength(2);
  });
});
