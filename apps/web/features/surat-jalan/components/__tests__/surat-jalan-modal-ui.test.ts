import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  join(process.cwd(), "features/surat-jalan/components/SuratJalanCreateModal.tsx"),
  "utf8",
);
const listSource = readFileSync(
  join(process.cwd(), "features/surat-jalan/components/SuratJalanList.tsx"),
  "utf8",
);
const quantityTableSource = readFileSync(
  join(process.cwd(), "features/surat-jalan/components/SuratJalanQuantityTable.tsx"),
  "utf8",
);
const inventorySource =
  readFileSync(
    join(
      process.cwd(),
      "features/inventory-management/components/InventorySuratJalanTab.tsx",
    ),
    "utf8",
  ) +
  readFileSync(
    join(
      process.cwd(),
      "features/inventory-management/components/InventoryWorkspace.tsx",
    ),
    "utf8",
  );

describe("SuratJalanCreateModal UI contract", () => {
  it("opens the receipt directly without the old summary and creation step", () => {
    expect(componentSource).toContain("<SuratJalanReceiptEditor");
    expect(componentSource).not.toContain("<SuratJalanStats");
    expect(componentSource).not.toContain("<SuratJalanHeader");
    expect(componentSource).not.toContain("<SuratJalanForm");
    expect(componentSource).not.toContain("setIsCreating");
  });

  it("opens the main receipt preview from grouped Surat Jalan rows without redirecting to history", () => {
    expect(listSource).toContain("Lihat Struk Utama");
    expect(listSource).toContain("onViewMainReceipt");
    expect(listSource).not.toContain("/history?search=");
  });

  it("uses existing permissions for creation and saved document editing", () => {
    expect(componentSource).toContain('canPerform("surat_jalan", "create")');
    expect(componentSource).toContain('canPerform("surat_jalan", "update")');
    expect(componentSource).toContain("expectedUpdatedAt");
    expect(componentSource).toContain("updateSuratJalanDocument");
  });

  it("keeps the selected saved document and approval action available", () => {
    expect(componentSource).toContain("initialRecordId");
    expect(componentSource).toContain("onApprove");
    const printSource = readFileSync(join(process.cwd(), "features/surat-jalan/components/SuratJalanPrintModal.tsx"), "utf8");
    expect(printSource).toContain("<SuratJalanCreateModal");
    expect(printSource).toContain("initialRecordId={suratJalan.id}");
  });

  it("describes pending approval as document-only for new transactions", () => {
    expect(inventorySource).toContain(
      "Approval dokumen tidak mengubah stok transaksi baru.",
    );
  });

  it("shows remaining quantity over invoice quantity in the sisa column", () => {
    expect(quantityTableSource).toContain(
      "{item.remainingQuantity}/{item.invoiceQuantity}",
    );
  });

  it("shows specific and localized error messages instead of generic one", () => {
    expect(quantityTableSource).not.toContain("Melebihi sisa/stok.");
    expect(quantityTableSource).toContain("Jumlah dikirim melebihi sisa barang.");
    expect(quantityTableSource).toContain("Stok gudang tidak mencukupi.");
  });
});
