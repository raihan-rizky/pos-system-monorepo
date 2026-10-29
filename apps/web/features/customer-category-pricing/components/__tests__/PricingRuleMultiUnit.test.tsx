import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PricingRuleForm } from "../PricingRuleForm";

vi.mock("@/hooks/useProducts", () => ({ useCategories: () => ({ data: [{ id: "paper", name: "Kertas" }] }) }));
vi.mock("@/hooks/useBrands", () => ({ useBrands: () => ({ data: [] }), useCreateBrand: () => ({ isPending: false }) }));
vi.mock("@/hooks/useCustomerCategoryPricingRules", () => ({
  useCustomerCategoryPricingRules: () => ({ data: [] }),
  usePricingUnitOptions: () => ({ data: ["rim", "box", "pcs"], isPending: false, isError: false }),
  usePricingScopeOptions: () => ({ data: { products: [] }, isPending: false, isError: false }),
}));

describe("pilihan satuan aturan harga", () => {
  it("shows all saved unit selections as independently checked choices", () => {
    const initialRule = { id: "r", categoryId: "paper", customerType: "ALL", unit: null, units: ["rim", "box"], mode: "FLAT_DISCOUNT", value: 500, isActive: true } as never;
    const html = renderToStaticMarkup(<PricingRuleForm initialRule={initialRule} onSave={vi.fn()} onClose={vi.fn()} isSaving={false} />);
    expect(html).toMatch(/<input(?=[^>]*name="units")(?=[^>]*value="rim")(?=[^>]*checked)[^>]*>/);
    expect(html).toMatch(/<input(?=[^>]*name="units")(?=[^>]*value="box")(?=[^>]*checked)[^>]*>/);
    expect(html).toMatch(/name="units"[^>]*value="pcs"/);
  });
});
