import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(join(process.cwd(), "features/suppliers/shopping-requests/components", file), "utf8");
}

function featureSource(file: string) {
  return readFileSync(
    join(process.cwd(), "features/suppliers/shopping-requests", file),
    "utf8",
  );
}

describe("Permohonan Belanja UI", () => {
  it("requires the reusable supplier selector and persists a stock mode per item", () => {
    const content = source("ShoppingRequestCreateModal.tsx");

    expect(content).toContain("SupplierSelector");
    expect(content).toContain("stockMode");
    expect(content).toContain("Stok Bersama");
    expect(content).toContain("Stok Produk Ini");
    expect(content).toContain("Simpan Permohonan Belanja");
  });

  it("shows thumbnails in product search, selected cards, and stock preview", () => {
    expect(source("ProductAutocomplete.tsx")).toContain("ProductStockThumbnail");
    expect(source("ShoppingRequestCreateModal.tsx")).toContain("ProductStockThumbnail");
    expect(source("ShoppingRequestStockPreview.tsx")).toContain("ProductStockThumbnail");
  });

  it("shows each shared-stock variant change in an expandable product detail", () => {
    const content = source("ShoppingRequestStockPreview.tsx");

    expect(content).toContain("aria-expanded");
    expect(content).toContain("row.variants.map");
    expect(content).toContain("Perubahan varian");
    expect(content).toContain("variant.beforeStock");
    expect(content).toContain("variant.afterStock");
    expect(content).toContain("variant.delta");
  });

  it("lets the approver edit final modes and renders live stock impact", () => {
    const content = source("ShoppingRequestApproveModal.tsx");

    expect(content).toContain("previewShoppingRequestStock");
    expect(content).toContain("stockMode");
    expect(content).toContain("Jumlah yang Di-ACC");
    expect(content).toContain("Setujui Permohonan");
  });

  it("offers separate edit and approved-quantity actions beside approval", () => {
    const content = source("ShoppingRequestList.tsx");

    expect(content).toContain("ShoppingRequestEditModal");
    expect(content).toContain("ShoppingRequestApprovedQtyModal");
    expect(content).toContain("Isi Jumlah yang Di-ACC");
    expect(content).toContain("supplier.shopping_request.edit");
    expect(content).toContain("supplier.shopping_request.set_approved_qty");
  });

  it("shows per-item decisions, progress, and individual approval", () => {
    const content = source("ShoppingRequestApproveModal.tsx");

    expect(content).toContain("Setujui Item");
    expect(content).toContain("Tidak Disetujui");
    expect(content).toContain("item diproses");
    expect(content).toContain("Setujui Semua Item Tersisa");
  });

  it("shows server-backed operational KPI cards above the shopping request list", () => {
    const content = source("ShoppingRequestList.tsx");

    expect(content).toContain("useShoppingRequestSummary");
    expect(content).toContain("Perlu Diproses");
    expect(content).toContain("Qty Menunggu");
    expect(content).toContain("Sudah Disetujui");
    expect(content).toContain("Rasio Qty Di-ACC");
  });

  it("shows the estimated expense and missing cost snapshots before approval", () => {
    const content = source("ShoppingRequestApproveModal.tsx");

    expect(content).toContain("Estimasi pengeluaran");
    expect(content).toContain("costPrice");
    expect(content).toContain("costPriceSnapshot");
    expect(content).toContain("Harga modal tidak tersedia saat approval");
    expect(content).toContain("mengikuti tanggal permohonan");
  });

  it("uses a save-only modal for approved quantities", () => {
    const path = join(
      process.cwd(),
      "features/suppliers/shopping-requests/components/ShoppingRequestApprovedQtyModal.tsx",
    );
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const content = source("ShoppingRequestApprovedQtyModal.tsx");

    expect(content).toContain("useSaveShoppingRequestApprovedQuantities");
    expect(content).toContain("Simpan Jumlah");
    expect(content).toContain("ProductStockThumbnail");
    expect(content).not.toContain("useApproveShoppingRequest");
  });

  it("edits supplier, items, quantities, modes, and notes in a dedicated modal", () => {
    const path = join(
      process.cwd(),
      "features/suppliers/shopping-requests/components/ShoppingRequestEditModal.tsx",
    );
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const content = source("ShoppingRequestEditModal.tsx");

    expect(content).toContain("useUpdateShoppingRequest");
    expect(content).toContain("SupplierSelector");
    expect(content).toContain("ProductAutocomplete");
    expect(content).toContain("Simpan Perubahan");
  });

  it("provides separate client mutations for edit, quantity preparation, and item approval", () => {
    const api = featureSource("api/shopping-requests-api.ts");
    const hooks = featureSource("hooks/useShoppingRequests.ts");

    expect(api).toContain("saveShoppingRequestApprovedQuantities");
    expect(api).toContain("approveShoppingRequestItem");
    expect(api).toContain("updateShoppingRequest");
    expect(hooks).toContain("useSaveShoppingRequestApprovedQuantities");
    expect(hooks).toContain("useApproveShoppingRequestItem");
    expect(hooks).toContain("useUpdateShoppingRequest");
  });
});
