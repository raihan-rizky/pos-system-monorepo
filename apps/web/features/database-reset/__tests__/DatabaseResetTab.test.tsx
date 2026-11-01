import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DatabaseResetView,
  type DatabaseResetViewProps,
} from "@/components/settings/DatabaseResetTab";

const defaultProps: DatabaseResetViewProps = {
  selectedModels: ["Product"],
  preview: {
    storeId: "store-a",
    domains: ["productCatalog"],
    operations: [],
    cascades: [{
      model: "ProductSupplier",
      count: 4,
      reason: "Link supplier produk ikut terhapus bersama katalog",
      sourceDomain: "productCatalog",
    }],
    requiredDependencies: [{
      domain: "salesFinance",
      reason: "Item transaksi masih mereferensikan produk yang dipilih.",
      blocking: true,
    }],
    preserved: [{ model: "Category", reason: "Kategori bersifat global." }],
    canExecute: false,
  },
  confirmation: "",
  isPreviewing: false,
  isExecuting: false,
  error: null,
  success: null,
  onToggleDomain: vi.fn(),
  onToggleModel: vi.fn(),
  onSelectAll: vi.fn(),
  onClearSelection: vi.fn(),
  onPreview: vi.fn(),
  onConfirmationChange: vi.fn(),
  onExecute: vi.fn(),
};

describe("DatabaseResetView", () => {
  it("shows independent sub-data and a partial category selection", () => {
    const html = renderToStaticMarkup(<DatabaseResetView {...defaultProps} selectedModels={["ProductPriceLog"]} />);
    expect(html).toContain("Riwayat Harga");
    expect(html).toContain('aria-checked="mixed"');
    expect(html).toContain("Pilih Semua");
    expect(html).toContain("Hapus Semua Pilihan");
    expect(html).toContain('aria-label="Riwayat Harga"');
    expect(html).toContain('aria-label="Nota Percetakan"');
  });

  it("disables preview when no sub-data is selected", () => {
    const html = renderToStaticMarkup(<DatabaseResetView {...defaultProps} selectedModels={[]} preview={null} />);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Lihat Dampak Reset<\/button>/);
  });

  it("marks a cascade as mandatory even when it was also checked explicitly", () => {
    const html = renderToStaticMarkup(<DatabaseResetView {...defaultProps} preview={{ ...defaultProps.preview!, operations: [{ model: "ProductPriceLog", domain: "productCatalog", mode: "selected", count: 2, reason: "Riwayat harga", where: {} }], cascades: [{ model: "ProductPriceLog", sourceDomain: "productCatalog", count: 2, reason: "Wajib bersama produk" }] }} />);
    expect(html).toContain("lucide-lock");
  });

  it("renders the danger zone, domain choices, and shared-data warning", () => {
    const html = renderToStaticMarkup(<DatabaseResetView {...defaultProps} />);

    expect(html).toContain("Reset Database");
    expect(html).toContain("RESET DATABASE");
    expect(html).toContain("Kategori global dipertahankan");
    expect(html).toContain("Cascade");
    expect(html).toContain("Reset belum dapat dilanjutkan");
    expect(html).toContain("Katalog Produk");
    expect(html).toContain("Notifikasi Store");
  });

  it("does not enable execution while a required dependency is blocking", () => {
    const html = renderToStaticMarkup(<DatabaseResetView {...defaultProps} />);

    expect(html).toContain("Periksa alasan di bawah, lalu ubah pilihan dan lihat dampaknya lagi.");
    expect(html).toContain('disabled=""');
    expect(html).toContain("Reset Data Terpilih");
  });

  it("shows why protected giro data cannot be reset", () => {
    const preview = { ...defaultProps.preview!, requiredDependencies: [{ domain: "salesFinance" as const, model: "Expense" as const, blocking: true, reason: "Pengeluaran giro dilindungi dan tidak dapat di-reset." }] };
    const html = renderToStaticMarkup(<DatabaseResetView {...defaultProps} preview={preview} />);
    expect(html).toContain("Pengeluaran giro dilindungi dan tidak dapat di-reset.");
    expect(html).not.toContain("Pilih sub-data yang diwajibkan terlebih dahulu");
  });

  it("renders a successful deletion summary", () => {
    const html = renderToStaticMarkup(
      <DatabaseResetView
        {...defaultProps}
        preview={{ ...defaultProps.preview!, requiredDependencies: [], canExecute: true }}
        confirmation="RESET DATABASE"
        success={{
          deleted: [{ model: "Transaction", count: 2 }],
          executedAt: "2026-08-02T00:00:00.000Z",
        }}
      />,
    );

    expect(html).toContain("Reset berhasil");
    expect(html).toContain("Transaksi Penjualan");
    expect(html).toContain("2");
  });
});
