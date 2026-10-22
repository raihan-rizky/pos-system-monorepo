import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StockGroupWorkspaceContent, type StockGroupWorkspaceContentProps } from "../StockGroupWorkspace";
import { treeDetail } from "./stock-group-tree-fixture";

function summary(overrides: Partial<StockGroupWorkspaceContentProps> = {}) {
  const noop = () => undefined;
  return renderToStaticMarkup(<StockGroupWorkspaceContent
    detail={treeDetail} canUpdateStock={false} canUpdateProducts canCreateProducts
    sharedStock="2500" stockInputMode="BASE" stockVariantProductId="lembar"
    note="" isSaving={false} onClose={noop} onSharedStockChange={noop}
    onStockInputModeChange={noop} onStockVariantProductIdChange={noop}
    onNoteChange={noop} onSaveSharedStock={noop} onActiveTabChange={noop}
    {...overrides}
  />);
}

describe("product group stock tree", () => {
  it("exposes one shared stock root and a labelled list of connected units", () => {
    const html = summary();
    expect(html).toContain('<figure');
    expect(html).toContain('aria-label="Pohon persediaan"');
    expect(html).toContain('aria-label="Stok bersama"');
    expect(html).toContain('aria-label="Satuan dalam grup"');
    for (const unit of ["lembar", "rim", "dus"]) {
      expect(html).toContain(`aria-label="Satuan ${unit}"`);
    }
  });

  it("labels each connection against the shared base and keeps saved pair context", () => {
    const html = summary();
    expect(html).toContain("1 rim = 500 lembar");
    expect(html).toContain("1 dus = 2.500 lembar");
    expect(html).toContain("1 dus = 5 rim");
    expect(html).toContain("Satuan acuan");
    expect(html).toContain("CONTOH-A4-DUS");
    expect(html).toMatch(/Rp\s*520\.000/);
  });

  it.each([
    { unit: "Bh", baseUnit: "Bh", multiplier: 1 },
    { unit: "Dus", baseUnit: "Dus", multiplier: 10 },
    { unit: " dus ", baseUnit: "DUS", multiplier: 10 },
  ])("hides same-unit conversion text for $unit with multiplier $multiplier", ({ unit, baseUnit, multiplier }) => {
    const html = summary({ detail: {
      ...treeDetail, baseUnit, conversionPairs: [],
      variants: [{ ...treeDetail.variants[0], unit, unitMultiplierToBase: multiplier }],
    } });
    expect(html).not.toContain(" = ");
    expect(html).toContain("Stok setara");
    expect(html).toContain("CONTOH-A4-LBR");
    expect(html).toContain("Harga jual");
  });

  it("omits saved same-unit pairs while retaining conversions between different units", () => {
    const html = summary({ detail: {
      ...treeDetail, conversionPairs: [
        treeDetail.conversionPairs![0],
        { fromProductId: "dus-a", fromUnit: "Dus", fromQuantity: 1,
          toProductId: "dus-b", toUnit: " dus ", toQuantity: 10, label: "1 Dus = 10 dus" },
      ],
    } });
    expect(html).not.toContain("1 Dus = 10 dus");
    expect(html).toContain("1 dus = 5 rim");
    expect(html).toContain("1 rim = 500 lembar");
  });

  it("keeps invalid-conversion warnings visible for the same unit", () => {
    const html = summary({ detail: {
      ...treeDetail, conversionPairs: [],
      variants: [{ ...treeDetail.variants[0], unitMultiplierToBase: 0, stock: Infinity }],
    } });
    expect(html).toContain("Konversi belum valid");
    expect(html).toContain("Periksa konversi");
    expect(html).not.toContain("Infinity");
  });

  it("does not offer unavailable navigation actions to a read-only user", () => {
    const html = summary({ canUpdateProducts: false, canCreateProducts: false });
    expect(html).not.toContain('aria-label="Atur konversi satuan"');
    expect(html).not.toContain('aria-label="Tambah satuan ke grup"');
    expect(html).not.toContain('aria-label="Atur harga satuan"');
  });

  it("offers shortcuts only when there is a working tab navigator", () => {
    const html = summary();
    expect(html).toContain('aria-label="Atur konversi satuan"');
    expect(html).toContain('aria-label="Tambah satuan ke grup"');
    expect(html).toContain('aria-label="Atur harga satuan"');
    const standalone = summary({ onActiveTabChange: undefined });
    expect(standalone).not.toContain('aria-label="Atur konversi satuan"');
    expect(standalone).not.toContain('aria-label="Tambah satuan ke grup"');
  });

  it("never presents an invalid conversion as a usable stock amount", () => {
    const html = summary({ detail: { ...treeDetail, variants: [{
      ...treeDetail.variants[1], unitMultiplierToBase: 0,
      stock: Infinity, conversionNeedsReview: true,
    }] } });
    expect(html).toContain("Konversi belum valid");
    expect(html).toContain("Periksa konversi");
    expect(html).not.toContain("Infinity");
    expect(html).not.toContain("1 rim = 0 lembar");
  });

  it("provides an empty state while keeping the shared stock visible", () => {
    const html = summary({ detail: { ...treeDetail, variants: [], conversionPairs: [] } });
    expect(html).toContain("Belum ada satuan dalam grup ini");
    expect(html).toContain('aria-label="Stok bersama"');
  });

  it("preserves negative, duplicate-unit and conversion-review warnings", () => {
    const html = summary({ detail: {
      ...treeDetail, baseStock: -500, hasNegativeStock: true, hasDuplicateUnits: true,
      variants: [{ ...treeDetail.variants[1], stock: -1, conversionNeedsReview: true }],
    } });
    expect(html).toContain("Stok bersama saat ini negatif");
    expect(html).toContain("Ada satuan duplikat");
    expect(html).toContain("Konversi perlu diperiksa");
  });
});
