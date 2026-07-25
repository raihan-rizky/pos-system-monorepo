import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Bantuan Pembelian Barang", () => {
  it("explains submission, per-product approval, RBAC, finance, and no stock impact", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "features/help-documentation/components/HelpContent.tsx",
      ),
      "utf8",
    );

    expect(source).toContain('id: "owner-goods-purchase"');
    expect(source).toContain("Buat Pembelian Barang");
    expect(source).toContain("Daftar Belanja yang sudah disetujui");
    expect(source).toContain("⚠ LAMA");
    expect(source).toContain("expense lama");
    expect(source).toContain("harga produk terbaru");
    expect(source).toContain("update HPP");
    expect(source).toContain("Belum Ada Aksi");
    expect(source).toContain("supplier.goods_purchase.approve");
    expect(source).toContain("supplier.goods_purchase.reject");
    expect(source).toContain("Pengeluaran kategori Bahan");
    expect(source).toContain("tidak mengubah stok");
  });
});
