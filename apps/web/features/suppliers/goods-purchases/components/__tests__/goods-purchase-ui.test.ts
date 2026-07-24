import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(
    join(
      process.cwd(),
      "features/suppliers/goods-purchases/components",
      file,
    ),
    "utf8",
  );
}

const shell = readFileSync(
  join(
    process.cwd(),
    "features/suppliers/components/SupplierPageShell.tsx",
  ),
  "utf8",
);

describe("goods purchase supplier UI", () => {
  it("adds the Pembelian Barang tab and deep link", () => {
    expect(shell).toContain('requestedTab === "goods-purchases"');
    expect(shell).toContain("Pembelian Barang");
    expect(shell).toContain("GoodsPurchaseList");
    expect(shell).toContain("GoodsPurchaseCreateModal");
  });

  it("requires an approved shopping list before showing item inputs", () => {
    const modal = source("GoodsPurchaseCreateModal.tsx");
    expect(modal).toContain("Pilih Daftar Belanja yang sudah disetujui");
    expect(modal).toContain("selectedRequest");
    expect(modal).toContain("approvedQty");
    expect(modal).toContain("Harga Produk Terbaru");
    expect(modal).toContain("Total pengeluaran");
    expect(modal).toContain("Ajukan Pembelian Barang");
    expect(modal).toContain(
      "Update HPP master ke harga ini saat pembelian disetujui",
    );
  });

  it("shows history status and detail fields", () => {
    const list = source("GoodsPurchaseList.tsx");
    const detail = source("GoodsPurchaseDetailModal.tsx");
    expect(list).toContain("Buat Pembelian Barang");
    expect(list).toContain("Menunggu Persetujuan");
    expect(list).toContain("Disetujui");
    expect(list).toContain("Ditolak");
    expect(detail).toContain("Daftar Belanja");
    expect(detail).toContain("Total pengeluaran");
    expect(detail).toContain("Alasan penolakan");
  });

  it("connects approved purchases to receiving history and comparison", () => {
    const list = source("GoodsPurchaseList.tsx");
    const comparison = source(
      "GoodsPurchaseReceivingComparisonModal.tsx",
    );

    expect(list).toContain("BARANG DITERIMA SEBAGIAN");
    expect(list).toContain("BARANG DITERIMA");
    expect(list).toContain("Barang Sudah Diterima?");
    expect(list).toContain("Lihat Riwayat Penerimaan Barang");
    expect(list).toContain('canPerform("inventory", "update")');
    expect(comparison).toContain("Dipesan");
    expect(comparison).toContain("Diterima");
    expect(comparison).toContain("Pending");
    expect(comparison).toContain("Sisa");
    expect(shell).toContain("initialGoodsPurchaseId");
    expect(shell).toContain(
      "/inventory?tab=transactions&subtab=inbound&goodsPurchaseId=",
    );
  });

  it("reviews products individually and shows the pending counter", () => {
    const modal = source("GoodsPurchaseApprovalModal.tsx");
    expect(modal).toContain("Produk Belum Ada Aksi");
    expect(modal).toContain("Setujui");
    expect(modal).toContain("Edit");
    expect(modal).toContain("Hapus");
    expect(modal).toContain("Tambah Produk");
    expect(modal).toContain("useApproveGoodsPurchaseItem");
    expect(modal).toContain("useEditGoodsPurchaseItem");
    expect(modal).toContain("useRemoveGoodsPurchaseItem");
    expect(modal).toContain("useAddGoodsPurchaseItem");
  });

  it("confirms edits and removals of approved products", () => {
    const modal = source("GoodsPurchaseApprovalModal.tsx");
    expect(modal).toContain(
      "Barang ini sudah disetujui. Apakah ingin mengedit kembali?",
    );
    expect(modal).toContain(
      "Status akan kembali menjadi Belum Ada Aksi.",
    );
    expect(modal).toContain(
      "Produk yang sudah disetujui akan dihapus",
    );
  });

  it("closes approval and shows the exact final success copy", () => {
    const modal = source("GoodsPurchaseApprovalModal.tsx");
    const success = source("GoodsPurchaseApprovedDialog.tsx");
    expect(modal).toContain("result.finalized");
    expect(success).toContain("Pembelian Barang Telah Disetujui");
  });

  it("gates owner decisions with separate permissions", () => {
    const list = source("GoodsPurchaseList.tsx");
    expect(list).toContain("supplier.goods_purchase.approve");
    expect(list).toContain("supplier.goods_purchase.reject");
    expect(list).toContain('canPerform("supplier", "create")');
    expect(list).toContain("canCreate &&");
  });

  it("lets an approver search and switch to a large unit in the same stock group", () => {
    const editor = source("GoodsPurchaseItemEditor.tsx");
    expect(editor).toContain("Cari produk atau SKU");
    expect(editor).toContain("item.stockGroupId");
    expect(editor).toContain("stockGroupId === item.stockGroupId");
    expect(editor).toContain("<optgroup");
  });
});
