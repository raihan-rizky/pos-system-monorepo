import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PricingRuleForm } from "../PricingRuleForm";
import { CustomerCategoryPricingRulesTab } from "../CustomerCategoryPricingRulesTab";

const queryState = vi.hoisted(() => ({
  unitsPending: false,
  unitsError: false,
  previewPending: false,
  savedRules: [] as Array<{ categoryId: string; unit: string }>,
}));

vi.mock("@/hooks/useProducts", () => ({
  useCategories: () => ({ data: [{ id: "paper", name: "Kertas" }] }),
  useProductsPage: () => ({ data: { data: [] } }),
}));
vi.mock("@/hooks/useBrands", () => ({
  useBrands: () => ({ data: [] }),
  useCreateBrand: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useCustomerCategoryPricingRules", () => ({
  useCustomerCategoryPricingRules: () => ({
    data: queryState.savedRules,
    isPending: false,
    isError: false,
  }),
  useCreateCustomerCategoryPricingRule: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useUpdateCustomerCategoryPricingRule: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useDeleteCustomerCategoryPricingRule: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  usePricingUnitOptions: () => ({
    data: queryState.unitsPending || queryState.unitsError ? undefined : ["pcs", "rim"],
    isPending: queryState.unitsPending,
    isFetching: queryState.unitsPending,
    isError: queryState.unitsError,
    refetch: vi.fn(),
  }),
  usePricingScopeOptions: () => queryState.previewPending ? ({
    data: undefined,
    isPending: true,
    isFetching: true,
    isError: false,
  }) : ({
    data: {
      units: ["pcs", "rim"],
      products: [
        {
          id: "p",
          name: "Kertas A4",
          unit: "rim",
          price: 5000,
          baseCostPrice: 700,
          baseCostUnit: "pcs",
          brandId: null,
        },
      ],
    },
    isPending: false,
    isFetching: false,
    isError: false,
  }),
}));
const initialRule = {
  id: "r",
  categoryId: "paper",
  customerType: "ALL",
  customerTypes: ["UMUM", "AGEN"],
  unit: "rim",
  brandId: null,
  mode: "COST_PLUS_FLAT",
  value: 4000,
  isActive: true,
} as any;

describe("Harga Khusus editor", () => {
  beforeEach(() => {
    queryState.unitsPending = false;
    queryState.unitsError = false;
    queryState.previewPending = false;
    queryState.savedRules = [];
  });
  it("starts with a compact rule list and an add action, without the permanent editor", () => {
    const html = renderToStaticMarkup(<CustomerCategoryPricingRulesTab />);
    expect(html).toContain("Tambah aturan");
    expect(html).not.toContain("<table");
    expect(html).not.toContain('type="number"');
  });
  it("shows grouped native customer checkboxes and four visible pricing methods", () => {
    const html = renderToStaticMarkup(
      <PricingRuleForm
        initialRule={initialRule}
        onSave={vi.fn()}
        onClose={vi.fn()}
        isSaving={false}
      />,
    );
    expect(html).toContain("<fieldset");
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    expect(html.match(/type="checkbox"/g)).toHaveLength(6);
    expect(html).toContain("Modal + rupiah");
    expect(html).toContain("Modal + persen");
    expect(html).toContain("Pengaturan tambahan");
  });
  it("explains base modal and renders the formula result in its selected unit", () => {
    const html = renderToStaticMarkup(
      <PricingRuleForm
        initialRule={initialRule}
        onSave={vi.fn()}
        onClose={vi.fn()}
        isSaving={false}
      />,
    );
    expect(html).toContain("700");
    expect(html).toContain("/pcs");
    expect(html).toContain("4.700");
    expect(html).toContain("/rim");
    expect(html).toContain('aria-live="polite"');
  });
  it("preserves a saved unit absent from current category options", () => {
    const html = renderToStaticMarkup(
      <PricingRuleForm
        initialRule={{ ...initialRule, unit: "box" }}
        onSave={vi.fn()}
        onClose={vi.fn()}
        isSaving={false}
      />,
    );
    expect(html).toContain('value="box" selected=""');
  });
  it("keeps all unit choices available while a preview is loading", () => {
    queryState.previewPending = true;
    const html = renderToStaticMarkup(<PricingRuleForm initialRule={initialRule} onSave={vi.fn()} onClose={vi.fn()} isSaving={false} />);
    expect(html).toContain('value="pcs"');
    expect(html).toContain('value="rim"');
    expect(html).toContain("Memuat contoh produk");
  });
  it("shows a loading state instead of an apparently empty unit picker", () => {
    queryState.unitsPending = true;
    const html = renderToStaticMarkup(<PricingRuleForm initialRule={{ ...initialRule, unit: "" }} onSave={vi.fn()} onClose={vi.fn()} isSaving={false} />);
    expect(html).toContain("Memuat satuan");
    expect(html).toMatch(/id="pricing-unit"[^>]*disabled=""/);
  });
  it("offers a unit-specific retry when loading fails", () => {
    queryState.unitsError = true;
    const html = renderToStaticMarkup(<PricingRuleForm initialRule={initialRule} onSave={vi.fn()} onClose={vi.fn()} isSaving={false} />);
    expect(html).toContain("Satuan belum berhasil dimuat");
    expect(html).toContain("Coba muat satuan");
  });
  it("immediately offers known category units from cached rules", () => {
    queryState.unitsPending = true;
    queryState.savedRules = [{ categoryId: "paper", unit: " Dus " }, { categoryId: "other", unit: "kg" }];
    const html = renderToStaticMarkup(<PricingRuleForm initialRule={{ ...initialRule, unit: "" }} onSave={vi.fn()} onClose={vi.fn()} isSaving={false} />);
    expect(html).toContain('value="dus"');
    expect(html).not.toContain('value="kg"');
    expect(html).not.toMatch(/id="pricing-unit"[^>]*disabled=""/);
  });
});
