import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProductTable from "@/components/inventory/ProductTable";
import type { Product } from "@/hooks/useProducts";

describe("catalog effective price display", () => {
  it("shows the special price, badge and markup computed from that displayed price", () => {
    const product = { id: "rim", name: "Kertas", sku: "RIM", unit: "rim", stock: 5, minStock: 1, price: 10000, displayPrice: 4700, costPrice: 9000, category: { id: "paper", name: "Kertas", icon: null, color: null }, appliedPricing: { ruleId: "rule", customerType: "UMUM", mode: "COST_PLUS_FLAT", value: 4000, originalUnitPrice: 10000, appliedUnitPrice: 4700, categoryId: "paper", categoryName: "Kertas" } } as Product;
    const html = renderToStaticMarkup(<ProductTable products={[product]} isLoading={false} onEdit={() => {}} canUpdateProduct={false} canChangePrice />);
    expect(html).toContain("4.700");
    expect(html).toContain("Harga Khusus");
    expect(html.match(/MU : -Rp\s*4\.300 \(-47,8%\)/g)).toHaveLength(2);
    expect(html).toContain("text-emerald-800");
    const markups = [...html.matchAll(/<p class="([^"]*)">\s*MU : ([\s\S]*?)<\/p>/g)];
    expect(markups).toHaveLength(2);
    for (const [, classes, text] of markups) {
      expect(classes).toContain("text-red-700");
      expect(text).toContain("-47,8%");
      expect(text).toContain("Di bawah HPP");
    }
  });
  it("shows zero-cost profit without a markup percentage and hides costs from others", () => {
    const product = { id: "pcs", name: "Contoh", sku: "PCS", unit: "pcs", stock: 5, minStock: 1, price: 10000, costPrice: 0, category: { id: "paper", name: "Kertas", icon: null, color: null } } as Product;
    const props = { products: [product], isLoading: false, onEdit: () => {}, canUpdateProduct: false };
    const html = renderToStaticMarkup(<ProductTable {...props} canChangePrice />);
    expect(html.match(/MU : Rp\s*10\.000 \(—\)/g)).toHaveLength(2);
    expect(html).not.toMatch(/Infinity|NaN/);
    expect(html).not.toContain("Di bawah HPP");
    const restricted = renderToStaticMarkup(<ProductTable {...props} canChangePrice={false} />);
    expect(restricted).not.toContain("HPP:");
    expect(restricted).not.toContain("MU :");
  });
});
