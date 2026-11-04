import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomerCategoryPricingRulesTab } from "../CustomerCategoryPricingRulesTab";

const state = vi.hoisted(() => ({ active: true, enabled: true as boolean | undefined, loading: false, fetched: true, error: false, role: "OWNER", refetch: vi.fn() }));
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
vi.mock("@/features/customer-category-pricing/hooks/useSpecialPricingSettings", () => ({
  useSpecialPricingSettings: () => ({ data: state.enabled, isPending: state.loading, isFetchedAfterMount: state.fetched, isError: state.error, refetch: state.refetch }),
}));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ role: state.role }) }));

describe("pricing rule status actions", () => {
  beforeEach(() => { Object.assign(state, { active: true, enabled: true, loading: false, fetched: true, error: false, role: "OWNER" }); state.refetch.mockReset(); });
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
  it("locks and blurs the rules when disabled and directs an owner to the setting", () => {
    state.enabled = false;
    const html = renderToStaticMarkup(<CustomerCategoryPricingRulesTab />);
    expect(html).toContain('inert=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("blur-");
    expect(html).toContain("Fitur Harga Khusus dinonaktifkan");
    expect(html).toContain('href="/settings?tab=special-pricing"');
    expect(html).toContain("Buka Pengaturan");
  });
  it("asks other roles to contact the owner instead of linking to owner settings", () => {
    state.enabled = false;
    state.role = "ADMIN";
    const html = renderToStaticMarkup(<CustomerCategoryPricingRulesTab />);
    expect(html).toContain("Hubungi Owner");
    expect(html).not.toContain('href="/settings?tab=special-pricing"');
  });
  it("keeps the rules locked while the feature setting loads", () => {
    state.enabled = undefined;
    state.loading = true;
    const html = renderToStaticMarkup(<CustomerCategoryPricingRulesTab />);
    expect(html).toContain('inert=""');
    expect(html).toContain("Memuat pengaturan Harga Khusus");
  });
  it("keeps rules locked until a cached enabled setting has been checked", () => {
    state.fetched = false;
    const html = renderToStaticMarkup(<CustomerCategoryPricingRulesTab />);
    expect(html).toContain('inert=""');
    expect(html).toContain("Memuat pengaturan Harga Khusus");
  });
  it("keeps rules locked when loading the setting fails, even with cached data", () => {
    state.error = true;
    const html = renderToStaticMarkup(<CustomerCategoryPricingRulesTab />);
    expect(html).toContain('inert=""');
    expect(html).toContain("Pengaturan Harga Khusus belum dapat dimuat");
    expect(html).toContain("Coba lagi");
  });
  it("does not lock the rules when the feature is enabled", () => {
    const html = renderToStaticMarkup(<CustomerCategoryPricingRulesTab />);
    expect(html).not.toContain('inert=""');
    expect(html).not.toContain("Fitur Harga Khusus dinonaktifkan");
    expect(html).toContain("Tambah aturan");
  });
});
