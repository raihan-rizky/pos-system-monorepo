import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProductTable from "@/components/inventory/ProductTable";
import type { Product } from "@/hooks/useProducts";

describe("catalog effective price display", () => {
  it("shows the special price, badge and margin computed from that displayed price", () => {
    const product = { id: "rim", name: "Kertas", sku: "RIM", unit: "rim", stock: 5, minStock: 1, price: 10000, displayPrice: 4700, costPrice: 9000, category: { id: "paper", name: "Kertas", icon: null, color: null }, appliedPricing: { ruleId: "rule", customerType: "UMUM", mode: "COST_PLUS_FLAT", value: 4000, originalUnitPrice: 10000, appliedUnitPrice: 4700, categoryId: "paper", categoryName: "Kertas" } } as Product;
    const html = renderToStaticMarkup(<ProductTable products={[product]} isLoading={false} onEdit={() => {}} canUpdateProduct={false} canChangePrice />);
    expect(html).toContain("4.700");
    expect(html).toContain("Harga Khusus");
    expect(html).toContain("-4.300");
    expect(html).toContain("text-emerald-800");
  });
});
