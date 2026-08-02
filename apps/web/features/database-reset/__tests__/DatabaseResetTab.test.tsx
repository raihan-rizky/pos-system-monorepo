import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DatabaseResetView,
  type DatabaseResetViewProps,
} from "@/components/settings/DatabaseResetTab";

const defaultProps: DatabaseResetViewProps = {
  selectedDomains: ["productCatalog"],
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
  onPreview: vi.fn(),
  onConfirmationChange: vi.fn(),
  onExecute: vi.fn(),
};

describe("DatabaseResetView", () => {
  it("renders the danger zone, domain choices, and shared-data warning", () => {
    const html = renderToStaticMarkup(<DatabaseResetView {...defaultProps} />);

    expect(html).toContain("Reset Database");
    expect(html).toContain("RESET DATABASE");
    expect(html).toContain("Kategori global dipertahankan");
    expect(html).toContain("Cascade");
    expect(html).toContain("Wajib dipilih");
    expect(html).toContain("Katalog Produk");
    expect(html).toContain("Notifikasi Store");
  });

  it("does not enable execution while a required dependency is blocking", () => {
    const html = renderToStaticMarkup(<DatabaseResetView {...defaultProps} />);

    expect(html).toContain("Pilih domain yang diwajibkan terlebih dahulu");
    expect(html).toContain('disabled=""');
    expect(html).toContain("Reset Data Terpilih");
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
    expect(html).toContain("Transaction");
    expect(html).toContain("2");
  });
});
