import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildUnitManagementDraft,
  StockGroupWorkspaceContent,
} from "../StockGroupWorkspace";

const detail = {
  id: "group-1",
  displayName: "HVS A4",
  baseUnit: "rim",
  baseStock: 10,
  hasNegativeStock: false,
  hasDuplicateUnits: false,
  conversionPairs: [
    {
      fromProductId: "dus",
      fromUnit: "dus",
      fromQuantity: 1,
      toProductId: "rim",
      toUnit: "rim",
      toQuantity: 5,
      label: "1 dus = 5 rim",
    },
  ],
  variants: [
    {
      id: "rim",
      name: "HVS A4",
      sku: "HVS-A4-RIM",
      unit: "rim",
      unitMultiplierToBase: 1,
      conversionNeedsReview: false,
      stock: 10,
      price: 45000,
      costPrice: 38000,
    },
    {
      id: "dus",
      name: "HVS A4",
      sku: "HVS-A4-DUS",
      unit: "dus",
      unitMultiplierToBase: 5,
      conversionNeedsReview: false,
      stock: 2,
      price: 220000,
      costPrice: 200000,
    },
  ],
};

describe("StockGroupWorkspaceContent", () => {
  it("defaults unit management pair fields from the current conversion pair", () => {
    expect(buildUnitManagementDraft(detail)).toEqual(
      expect.objectContaining({
        baseProductId: "rim",
        fromProductId: "dus",
        fromQuantity: "1",
        toProductId: "rim",
        toQuantity: "5",
      }),
    );
  });

  it("renders stock unit tabs, conversion info, pricing margin, add variant, and history tabs", () => {
    const summary = renderToStaticMarkup(
      <StockGroupWorkspaceContent
        detail={detail}
        canUpdateStock={true}
        sharedStock="10"
        stockInputMode="BASE"
        stockVariantProductId="rim"
        note=""
        isSaving={false}
        onClose={() => undefined}
        onSharedStockChange={() => undefined}
        onStockInputModeChange={() => undefined}
        onStockVariantProductIdChange={() => undefined}
        onNoteChange={() => undefined}
        onSaveSharedStock={() => undefined}
      />,
    );
    const pricing = renderToStaticMarkup(
      <StockGroupWorkspaceContent
        detail={detail}
        canUpdateStock={true}
        sharedStock="10"
        stockInputMode="BASE"
        stockVariantProductId="rim"
        note=""
        isSaving={false}
        activeTab="pricing"
        onClose={() => undefined}
        onSharedStockChange={() => undefined}
        onStockInputModeChange={() => undefined}
        onStockVariantProductIdChange={() => undefined}
        onNoteChange={() => undefined}
        onSaveSharedStock={() => undefined}
      />,
    );
    const addVariant = renderToStaticMarkup(
      <StockGroupWorkspaceContent
        detail={detail}
        canUpdateStock={true}
        sharedStock="10"
        stockInputMode="BASE"
        stockVariantProductId="rim"
        note=""
        isSaving={false}
        activeTab="newVariant"
        newVariantDraft={{
          unit: "rim",
          price: "",
          costPrice: "",
          stock: "0",
          minStock: "5",
          conversionFromQuantity: "1",
          conversionToProductId: "rim",
          conversionToQuantity: "1",
          note: "",
        }}
        onClose={() => undefined}
        onSharedStockChange={() => undefined}
        onStockInputModeChange={() => undefined}
        onStockVariantProductIdChange={() => undefined}
        onNoteChange={() => undefined}
        onSaveSharedStock={() => undefined}
      />,
    );
    const unitManagement = renderToStaticMarkup(
      <StockGroupWorkspaceContent
        detail={detail}
        canUpdateStock={true}
        sharedStock="10"
        stockInputMode="BASE"
        stockVariantProductId="rim"
        note=""
        isSaving={false}
        activeTab="unitManagement"
        conversionDraft={{
          editMode: "PAIR",
          baseProductId: "rim",
          fromProductId: "dus",
          fromQuantity: "1",
          toProductId: "rim",
          toQuantity: "5",
          mode: "KEEP_SHARED_STOCK",
          directMultipliers: { rim: "1", dus: "5" },
        }}
        onClose={() => undefined}
        onSharedStockChange={() => undefined}
        onStockInputModeChange={() => undefined}
        onStockVariantProductIdChange={() => undefined}
        onNoteChange={() => undefined}
        onSaveSharedStock={() => undefined}
      />,
    );
    const history = renderToStaticMarkup(
      <StockGroupWorkspaceContent
        detail={detail}
        canUpdateStock={true}
        sharedStock="10"
        stockInputMode="BASE"
        stockVariantProductId="rim"
        note=""
        isSaving={false}
        activeTab="history"
        onClose={() => undefined}
        onSharedStockChange={() => undefined}
        onStockInputModeChange={() => undefined}
        onStockVariantProductIdChange={() => undefined}
        onNoteChange={() => undefined}
        onSaveSharedStock={() => undefined}
      />,
    );
    const saving = renderToStaticMarkup(
      <StockGroupWorkspaceContent
        detail={detail}
        canUpdateStock={true}
        sharedStock="10"
        stockInputMode="BASE"
        stockVariantProductId="rim"
        note=""
        isSaving={true}
        savingMessage="Menambahkan varian baru..."
        activeTab="newVariant"
        newVariantDraft={{
          unit: "pack",
          price: "",
          costPrice: "",
          stock: "0",
          minStock: "5",
          conversionFromQuantity: "1",
          conversionToProductId: "rim",
          conversionToQuantity: "1",
          note: "",
        }}
        onClose={() => undefined}
        onSharedStockChange={() => undefined}
        onStockInputModeChange={() => undefined}
        onStockVariantProductIdChange={() => undefined}
        onNoteChange={() => undefined}
        onSaveSharedStock={() => undefined}
      />,
    );

    expect(summary).toContain("Ringkasan");
    expect(summary).toContain("Unit Management");
    expect(summary).toContain("Harga &amp; Margin");
    expect(summary).toContain("Tambah Varian");
    expect(summary).toContain("Riwayat Aktivitas");
    expect(summary).toContain("Konversi Saat Ini");
    expect(summary).toContain("1 dus = 5 rim");
    expect(unitManagement).toContain("Unit terkecil/base");
    expect(unitManagement).toContain("Pair conversion");
    expect(unitManagement).toContain("Stok setelah simpan");
    expect(pricing).toContain("Margin");
    expect(addVariant).toContain("Tambahkan varian baru");
    expect(addVariant).toContain("Unit sudah ada");
    expect(history).toContain("Riwayat Aktivitas Grup");
    expect(saving).toContain("Menambahkan varian baru...");
    expect(saving).toContain("Menambahkan varian...");
  });
});
