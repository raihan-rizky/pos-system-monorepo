import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProductTable from "@/components/inventory/ProductTable";
import type { Product } from "@/hooks/useProducts";

const product: Product = {
  id: "mouse-pad", name: "Alas Mouse Pad", sku: "MOUSE-004", unit: "bh",
  price: 13500, costPrice: 10000, hargaAgen: null, hargaDinas: null,
  stock: 5, minStock: 1, isActive: true, size: null, material: null, imageUrl: null,
  category: { id: "atk", name: "ATK", icon: null, color: null },
};

function renderProduct(overrides: Partial<Product> = {}, canChangePrice = true) {
  const html = renderToStaticMarkup(
    <ProductTable products={[{ ...product, ...overrides }]} isLoading={false}
      onEdit={() => {}} canUpdateProduct={false} canChangePrice={canChangePrice} />,
  );
  return { html, text: html.replace(/<[^>]*>/g, " ").replace(/\s|&nbsp;/g, " ") };
}

describe("Inventory gross profit and markup", () => {
  it("shows Rp3.500 profit and 35% markup on cost in both table and cards", () => {
    const { text } = renderProduct();
    expect(text.match(/Markup: Rp\s*3\.500\s*\(35%\)/g)).toHaveLength(2);
    expect(text).not.toContain("Margin:");
    expect(text).not.toContain("25,9%");
  });

  it("uses the displayed selling price for profit and markup", () => {
    const { text } = renderProduct({ displayPrice: 12000 });
    expect(text.match(/Markup: Rp\s*2\.000\s*\(20%\)/g)).toHaveLength(2);
  });

  it("formats fractional markup with an Indonesian decimal separator", () => {
    const { text } = renderProduct({ price: 13555 });
    expect(text.match(/Markup: Rp\s*3\.555\s*\(35,6%\)/g)).toHaveLength(2);
  });

  it.each([
    { price: 8000, profit: /Markup: -Rp\s*2\.000\s*\(-20%\)/g },
    { price: 0, profit: /Markup: -Rp\s*10\.000\s*\(-100%\)/g },
  ])("keeps the loss warning and negative markup at selling price $price", ({ price, profit }) => {
    const { text, html } = renderProduct({ price });
    expect(text.match(profit)).toHaveLength(2);
    expect(text.match(/Di bawah HPP/g)).toHaveLength(2);
    expect(html.match(/text-red-700/g)).toHaveLength(2);
  });

  it("shows zero markup at break-even", () => {
    const { text } = renderProduct({ price: 10000 });
    expect(text.match(/Markup: Rp\s*0\s*\(0%\)/g)).toHaveLength(2);
    expect(text).not.toContain("Di bawah HPP");
  });

  it("shows profit but no calculable markup when HPP is zero", () => {
    const { text } = renderProduct({ costPrice: 0 });
    expect(text.match(/Markup: Rp\s*13\.500\s*\(—\)/g)).toHaveLength(2);
    expect(text).not.toMatch(/Infinity|NaN/);
  });

  it("hides cost and profit when HPP is missing", () => {
    const { text } = renderProduct({ costPrice: null });
    expect(text).not.toMatch(/HPP:|Laba kotor:|Markup/);
  });

  it("hides cost and profit without price permission", () => {
    const { text } = renderProduct({}, false);
    expect(text).not.toMatch(/HPP:|Laba kotor:|Markup/);
  });
});
