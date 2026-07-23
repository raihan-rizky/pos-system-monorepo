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

describe("Daftar Belanja UI", () => {
  it("uses the reusable supplier selector without exposing stock controls", () => {
    const content = source("ShoppingRequestCreateModal.tsx");

    expect(content).toContain("SupplierSelector");
    expect(content).not.toContain("stockMode");
    expect(content).not.toContain("StockModeSelector");
    expect(content).not.toContain("ShoppingRequestStockPreviewPanel");
    expect(content).not.toContain("previewShoppingRequestStock");
    expect(content).toContain("Simpan Daftar Belanja");
  });

  it("shows thumbnails in product search and selected cards", () => {
    expect(source("ProductAutocomplete.tsx")).toContain("ProductStockThumbnail");
    expect(source("ShoppingRequestCreateModal.tsx")).toContain("ProductStockThumbnail");
  });

  it("only offers large-unit products in the shared shopping-request picker", () => {
    const content = source("ProductAutocomplete.tsx");

    expect(content).toContain("getLargeUnitShoppingProducts");
    expect(content).toContain("getLargeUnitShoppingProducts(products.data ?? [])");
    expect(content).toContain("Produk unit besar tidak ditemukan");
  });

  it("shows expense impact without stock mode or live stock preview", () => {
    const content = source("ShoppingRequestApproveModal.tsx");

    expect(content).not.toContain("previewShoppingRequestStock");
    expect(content).not.toContain("stockMode");
    expect(content).not.toContain("ShoppingRequestStockPreviewPanel");
    expect(content).not.toContain("StockModeSelector");
    expect(content).toContain("Jumlah yang Di-ACC");
    expect(content).toContain("Estimasi pengeluaran");
    expect(content).toContain("tidak mengubah stok");
    expect(content).toContain("Setujui Daftar Belanja");
  });

  it("lets authorized approvers input an approved quantity beside its requirement", () => {
    const content = source("ShoppingRequestApproveModal.tsx");

    expect(content).toContain("Kebutuhan Belanja");
    expect(content).toContain('placeholder="Masukkan jumlah"');
    expect(content).toContain(
      'canPerform("supplier.shopping_request.set_approved_qty", "update")',
    );
    expect(content).toContain("useSaveShoppingRequestApprovedQuantities");
    expect(content).toContain("approvedQtyInput");
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
    expect(content).not.toContain("fullDetail.refetch()");
  });

  it("shows server-backed operational KPI cards above the shopping request list", () => {
    const content = source("ShoppingRequestList.tsx");

    expect(content).toContain("useShoppingRequestSummary");
    expect(content).toContain("Perlu Diproses");
    expect(content).toContain("Qty Menunggu");
    expect(content).toContain("Sudah Disetujui");
    expect(content).toContain("Rasio Qty Di-ACC");
  });

  it("shows a non-posting expense estimate and missing cost snapshots before approval", () => {
    const content = source("ShoppingRequestApproveModal.tsx");

    expect(content).toContain("Estimasi pengeluaran");
    expect(content).toContain("costPrice");
    expect(content).toContain("costPriceSnapshot");
    expect(content).toContain("Harga modal tidak tersedia saat approval");
    expect(content).toContain("Estimasi saja, belum menjadi pengeluaran tercatat");
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

  it("edits supplier, items, quantities, and notes without stock mode", () => {
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
    expect(content).not.toContain("stockMode");
    expect(content).not.toContain("EditStockMode");
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

  it("opens the shopping-request tab from a notification deep link", () => {
    const shell = readFileSync(
      join(process.cwd(), "features/suppliers/components/SupplierPageShell.tsx"),
      "utf8",
    );

    expect(shell).toContain("useSearchParams");
    expect(shell).toContain('searchParams.get("tab")');
    expect(shell).toContain('requestedTab === "shopping-requests"');
  });

  it("uses the Daftar Belanja name across the Supplier page", () => {
    const files = [
      "ShoppingRequestCreateModal.tsx",
      "ShoppingRequestApproveModal.tsx",
      "ShoppingRequestEditModal.tsx",
      "ShoppingRequestPrintModal.tsx",
      "ShoppingRequestList.tsx",
    ];
    const content = files.map(source).join("\n");
    const shell = readFileSync(
      join(process.cwd(), "features/suppliers/components/SupplierPageShell.tsx"),
      "utf8",
    );

    expect(`${shell}\n${content}`).toContain("Daftar Belanja");
    expect(`${shell}\n${content}`).not.toContain("Permohonan Belanja");
  });

  it("uses a wider responsive layout for every main Daftar Belanja modal", () => {
    const modalFiles = [
      "ShoppingRequestCreateModal.tsx",
      "ShoppingRequestApproveModal.tsx",
      "ShoppingRequestApprovedQtyModal.tsx",
      "ShoppingRequestEditModal.tsx",
      "ShoppingRequestPrintModal.tsx",
    ];

    for (const file of modalFiles) {
      expect(source(file), file).toContain('size="6xl"');
    }
  });

  it("keeps the Daftar Belanja list comfortable on mobile and tablet widths", () => {
    const content = source("ShoppingRequestList.tsx");
    const shell = readFileSync(
      join(process.cwd(), "features/suppliers/components/SupplierPageShell.tsx"),
      "utf8",
    );

    expect(shell).toContain(
      'className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"',
    );
    expect(content).toContain('className="space-y-3 p-3 sm:p-4"');
    expect(content).toContain(
      "min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm sm:w-auto",
    );
    expect(content).toContain('className="w-full sm:ml-auto sm:w-auto"');
    expect(content).toContain("xl:flex-row xl:items-center");
    expect(content).toContain("[&>*]:w-full sm:[&>*]:w-auto");
    expect(content).not.toContain("md:flex-row md:items-center");
  });
});
