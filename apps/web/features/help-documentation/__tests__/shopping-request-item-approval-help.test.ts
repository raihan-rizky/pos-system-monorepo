import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Bantuan persetujuan Daftar Belanja", () => {
  it("explains unified approval, unit changes, actual prices, permissions, and stock timing", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "features/help-documentation/components/HelpContent.tsx",
      ),
      "utf8",
    );

    const approvalGuide = source.slice(
      source.indexOf('id: "owner-approval-belanja"'),
      source.indexOf('id: "owner-goods-purchase"'),
    );
    expect(approvalGuide).toContain("supplier.shopping_request.edit:update");
    expect(approvalGuide).toContain("12 pcs menjadi 12 dus");
    expect(approvalGuide).toContain("supplier.goods_purchase.approve:update");
    expect(approvalGuide).toContain("Jumlah, Satuan, dan Harga Beli aktual");
    expect(approvalGuide).toContain("Jumlah nol berarti barang tidak disetujui");
    expect(approvalGuide).toContain("Setujui dan Catat Pembelian");
    expect(approvalGuide).toContain("satu Pengeluaran kategori Bahan");
    expect(approvalGuide).toContain("Jumlah di atas kebutuhan perlu konfirmasi");
    expect(approvalGuide).toContain("Persetujuan tidak mengubah stok");
    expect(approvalGuide).toContain("stok bertambah setelah Penerimaan Barang disetujui");
    expect(approvalGuide).toContain("supplier.goods_purchase.reject:update");
    expect(approvalGuide).toContain("Penolakan tidak mencatat pembelian atau Pengeluaran");
    expect(approvalGuide).not.toContain("Setujui Item");
    expect(source).toContain("Lengkapi Pembelian Lama");
    expect(source).toContain("Pembelian Barang lama berstatus PENDING");
    expect(source).toContain("Review per produk");
  });
});
