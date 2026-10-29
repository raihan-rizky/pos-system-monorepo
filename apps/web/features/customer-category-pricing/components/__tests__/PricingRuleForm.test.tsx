import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PricingRuleForm } from "../PricingRuleForm";
import { CustomerCategoryPricingRulesTab } from "../CustomerCategoryPricingRulesTab";
import type { PricingPreviewProduct } from "../../helpers/pricing-form";

const queryState = vi.hoisted(() => ({
  unitsPending: false,
  unitsError: false,
  previewPending: false,
  units: ["pcs", "rim"],
  previewRequests: [] as unknown[][],
  savedRules: [] as Array<{ categoryId: string; unit: string }>,
  previewProducts: null as PricingPreviewProduct[] | null,
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
    data: queryState.unitsPending || queryState.unitsError ? undefined : queryState.units,
    isPending: queryState.unitsPending,
    isFetching: queryState.unitsPending,
    isError: queryState.unitsError,
    refetch: vi.fn(),
  }),
  usePricingScopeOptions: (...args: unknown[]) => {
    queryState.previewRequests.push(args);
    return queryState.previewPending ? ({
    data: undefined,
    isPending: true,
    isFetching: true,
    isError: false,
  }) : ({
    data: {
      units: ["pcs", "rim"],
      products: queryState.previewProducts ?? [
        {
          id: "p",
          name: "Kertas A4",
          unit: "rim",
          price: 5000,
          costPrice: 5400,
          baseCostPrice: 700,
          baseCostUnit: "pcs",
          brandId: null,
        },
      ],
    },
    isPending: false,
    isFetching: false,
    isError: false,
  });
  },
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
  it("restores both percentages and previews using the selected unit modal", () => {
    const html = renderToStaticMarkup(<PricingRuleForm initialRule={{ ...initialRule, mode: "UNIT_COST_PLUS_PERCENT_DISCOUNT", value: 10, discountPercent: 5 }} onSave={vi.fn()} onClose={vi.fn()} isSaving={false} />);
    expect(html).toContain('name="discountPercent"');
    expect(html).toContain('value="5"');
    expect(html).toContain("5.643");
  });
  beforeEach(() => {
    queryState.unitsPending = false;
    queryState.unitsError = false;
    queryState.previewPending = false;
    queryState.units = ["pcs", "rim"];
    queryState.previewRequests = [];
    queryState.savedRules = [];
    queryState.previewProducts = null;
  });
  it("starts with a compact rule list and an add action, without the permanent editor", () => {
    const html = renderToStaticMarkup(<CustomerCategoryPricingRulesTab />);
    expect(html).toContain("Tambah aturan");
    expect(html).not.toContain("<table");
    expect(html).not.toContain('type="number"');
  });
  it("shows grouped native customer checkboxes and five visible pricing methods", () => {
    const html = renderToStaticMarkup(
      <PricingRuleForm
        initialRule={initialRule}
        onSave={vi.fn()}
        onClose={vi.fn()}
        isSaving={false}
      />,
    );
    expect(html).toContain("<fieldset");
    expect(html.match(/type="radio"/g)).toHaveLength(5);
    expect(html.match(/name="customerTypes"/g)).toHaveLength(5);
    expect(html).toContain("HPP satuan terkecil + rupiah");
    expect(html).toContain("HPP masing-masing satuan + persen");
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
  it("rounds the completed formula and previews the current rounding policy", () => {
    const html = renderToStaticMarkup(<PricingRuleForm initialRule={initialRule} onSave={vi.fn()} onClose={vi.fn()} isSaving={false} />);
    expect(html).toContain("Dibulatkan ke atas");
    expect(html).toContain("5.000");
    const disabled = renderToStaticMarkup(<PricingRuleForm initialRule={initialRule} onSave={vi.fn()} onClose={vi.fn()} isSaving={false} roundingSettings={{ enabled: false, increment: 500, threshold: 50 }} />);
    expect(disabled).toContain("4.700");
    expect(disabled).not.toContain("Dibulatkan ke atas");
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
    expect(html).toMatch(/<input(?=[^>]*name="units")(?=[^>]*value="box")(?=[^>]*checked)[^>]*>/);
  });
  it("keeps all unit choices available while a preview is loading", () => {
    queryState.previewPending = true;
    const html = renderToStaticMarkup(<PricingRuleForm initialRule={initialRule} onSave={vi.fn()} onClose={vi.fn()} isSaving={false} />);
    expect(html).toContain('value="pcs"');
    expect(html).toContain('value="rim"');
    expect(html).toContain("Memuat contoh produk");
  });
  it("keeps all units selectable while individual units are loading", () => {
    queryState.unitsPending = true;
    const html = renderToStaticMarkup(<PricingRuleForm initialRule={{ ...initialRule, unit: "" }} onSave={vi.fn()} onClose={vi.fn()} isSaving={false} />);
    expect(html).toContain("Memuat satuan");
    expect(html).toMatch(/type="checkbox"[^>]*checked=""[^>]*\/>Semua satuan/);
    expect(html).not.toMatch(/id="pricing-unit"[^>]*disabled=""/);
  });
  it.each(["COST_PLUS_FLAT", "COST_PLUS_PERCENT"])("shows and previews all units for %s", (mode) => {
    const html = renderToStaticMarkup(<PricingRuleForm initialRule={{ ...initialRule, mode, unit: null }} onSave={vi.fn()} onClose={vi.fn()} isSaving={false} />);
    expect(html).toMatch(/type="checkbox"[^>]*checked=""[^>]*\/>Semua satuan/);
    expect(html).toContain("Aturan berlaku pada semua satuan dalam kategori ini, termasuk satuan yang ditambahkan nanti.");
    expect(html).not.toContain("Pilih satuan untuk melihat contoh harga.");
    expect(html).toContain("/rim");
    expect(queryState.previewRequests.at(-1)).toEqual(["paper", null, null, { enabled: true }]);
  });
  it("keeps all units selectable when the category has no unit options", () => {
    queryState.units = [];
    const html = renderToStaticMarkup(<PricingRuleForm initialRule={{ ...initialRule, unit: null }} onSave={vi.fn()} onClose={vi.fn()} isSaving={false} />);
    expect(html).toMatch(/type="checkbox"[^>]*checked=""[^>]*\/>Semua satuan/);
    expect(html).not.toMatch(/id="pricing-unit"[^>]*disabled=""/);
    expect(html).toContain("Belum ada satuan yang tersedia untuk kategori ini.");
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
  it("compares selling-unit HPP, profit and margin across units and flags losses", () => {
    queryState.previewProducts = [
      { id: "dus", name: "Contoh Dus", unit: "dus", price: 12000, costPrice: 7600, baseCostPrice: 7600, baseCostUnit: "dus", brandId: null },
      { id: "pak", name: "Contoh Pak", unit: "pak", price: 108000, costPrice: 76000, baseCostPrice: 7600, baseCostUnit: "dus", brandId: null },
    ];
    const html = renderToStaticMarkup(<PricingRuleForm initialRule={{ ...initialRule, unit: null, mode: "COST_PLUS_PERCENT", value: 35 }} onSave={vi.fn()} onClose={vi.fn()} isSaving={false} />);
    expect(html).toContain("HPP satuan");
    expect(html).toContain("Harga aturan");
    expect(html).toContain("Laba");
    expect(html).toContain("Margin");
    expect(html).toContain("76.000");
    expect(html).toMatch(/-Rp\s65\.500/);
    expect(html).toContain("-623,81%");
    expect(html).toContain("Harga di bawah HPP satuan");
    expect(html).toMatch(/class="[^"]*text-red-700[^"]*"[^>]*>[^<]*Harga di bawah HPP satuan/);
  });
  it("previews a 35 percent markup using each unit's own cost", () => {
    queryState.previewProducts = [
      { id: "pak", name: "Contoh Pak", unit: "pak", price: 108000, costPrice: 76000, baseCostPrice: 7600, baseCostUnit: "dus", brandId: null },
    ];
    const html = renderToStaticMarkup(<PricingRuleForm initialRule={{ ...initialRule, unit: null, mode: "UNIT_COST_PLUS_PERCENT_DISCOUNT", value: 35, discountPercent: 0 }} onSave={vi.fn()} onClose={vi.fn()} isSaving={false} />);
    expect(html).toContain("102.600");
    expect(html).toContain("27.000");
    expect(html).toContain("26,21%");
    expect(html).toContain("tambahan 35% menghasilkan margin 25,93%");
    expect(html).not.toContain("Harga di bawah HPP satuan");
  });
  it("explains missing HPP without inventing a profit or margin", () => {
    queryState.previewProducts = [{ id: "p", name: "Tanpa HPP", unit: "pcs", price: 10000, costPrice: null, baseCostPrice: null, baseCostUnit: null, brandId: null }];
    const html = renderToStaticMarkup(<PricingRuleForm initialRule={{ ...initialRule, unit: null, mode: "PERCENT_DISCOUNT", value: 15 }} onSave={vi.fn()} onClose={vi.fn()} isSaving={false} />);
    expect(html).toContain("8.500");
    expect(html).toContain("HPP satuan belum tersedia; laba dan margin belum dapat dihitung.");
    expect(html).not.toContain("Harga di bawah HPP satuan");
    expect(html).not.toContain("NaN");
  });
});
