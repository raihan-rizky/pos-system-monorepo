import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Bantuan Daftar Belanja terpadu", () => {
  it("explains one approval, editable units, old purchases, finance, and no stock impact", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "features/help-documentation/components/HelpContent.tsx",
      ),
      "utf8",
    );

    expect(source).toContain('id: "owner-goods-purchase"');
    expect(source).toContain("Lengkapi Pembelian Lama");
    expect(source).toContain("Pembelian Barang lama");
    expect(source).toContain("harga modal produk saat ini");
    expect(source).toContain("tidak mengubah HPP master");
    expect(source).toContain("supplier.goods_purchase.approve");
    expect(source).toContain("supplier.goods_purchase.reject");
    expect(source).toContain("Pengeluaran kategori Bahan");
    expect(source).toContain("tidak mengubah stok");
    expect(source).toContain("Setujui dan Catat Pembelian");
    expect(source).toContain("12 pcs menjadi 12 dus");
    expect(source).toContain("Pembelian Barang lama");
  });
});
