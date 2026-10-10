import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomerCategoryPricingRulesTab } from "../CustomerCategoryPricingRulesTab";

const state = vi.hoisted(() => ({ active: true }));
vi.mock("@/hooks/useCustomerCategoryPricingRules", () => ({
  useCustomerCategoryPricingRules: () => ({ data: [{
    id: "rule", category: { name: "Kertas" }, unit: "rim", customerTypes: ["UMUM", "AGEN"],
    mode: "COST_PLUS_FLAT", value: 4000, isActive: state.active,
  }] }),
  useCreateCustomerCategoryPricingRule: () => ({ isPending: false }),
  useUpdateCustomerCategoryPricingRule: () => ({ isPending: false }),
  useDeleteCustomerCategoryPricingRule: () => ({ isPending: false }),
}));
vi.mock("@pos/ui", () => ({ Modal: () => null }));
vi.mock("../PricingRuleForm", () => ({ PricingRuleForm: () => null }));

describe("pricing rule status actions", () => {
  beforeEach(() => { state.active = true; });
  it("explains that the action disables an active rule", () => {
    const html = renderToStaticMarkup(<CustomerCategoryPricingRulesTab />);
    expect(html).toContain("Nonaktifkan aturan Kertas rim");
    expect(html).not.toContain("Hapus aturan");
  });
  it("keeps inactive rules editable without offering to disable them again", () => {
    state.active = false;
    const html = renderToStaticMarkup(<CustomerCategoryPricingRulesTab />);
    expect(html).toContain("Ubah aturan Kertas rim");
    expect(html).toContain("Nonaktif");
    expect(html).not.toContain("Nonaktifkan aturan");
    expect(html).not.toContain("Hapus aturan");
  });
});
