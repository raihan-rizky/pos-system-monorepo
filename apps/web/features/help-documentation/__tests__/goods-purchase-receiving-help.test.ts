import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readWebFile = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

describe("Bantuan penerimaan Pembelian Barang", () => {
  it("documents the current receiving, approval, stock, and navigation workflow", () => {
    const helpContent = readWebFile(
      "features/help-documentation/components/HelpContent.tsx",
    );
    const inventoryPreview = readWebFile(
      "features/help-documentation/components/app-shell-preview/pages/InventoryPreview.tsx",
    );
    const workflowCatalog = readWebFile(
      "features/ai-assistant/workflows/workflow-catalog.ts",
    );
    const inventoryHelp = readWebFile(
      "features/ai-assistant/docs/help/inventory.md",
    );
    const faq = readWebFile("features/ai-assistant/docs/help/faq.md");
    const combined = [
      helpContent,
      inventoryPreview,
      workflowCatalog,
      inventoryHelp,
      faq,
    ].join("\n");

    expect(combined).toContain("Pilih Pembelian Barang");
    expect(combined).toContain("Sesuai");
    expect(combined).toContain("Tidak Sesuai");
    expect(combined).toContain("Barang Sudah Diterima?");
    expect(combined).toContain("Lihat Riwayat Penerimaan Barang");
    expect(combined).toContain("stok bersama");
    expect(combined).toContain("bundle");
    expect(combined).toContain("penerimaan lain yang masih PENDING");
    expect(combined).toContain("inventory.inbound_receipt.approve");
    expect(combined).toContain("inventory.inbound_receipt.reject");
    expect(combined).toContain("inventory.inbound_receipt.edit");
    expect(combined).not.toContain("Pilih invoice daftar belanja");
    expect(combined).not.toContain("Minta Revisi");
  });
});
