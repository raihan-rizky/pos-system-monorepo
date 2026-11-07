import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReceiptSnapshot } from "../components/ReceiptSnapshot";
import { receiptSnapshot } from "./receipt-change-fixture";

describe("lembar rincian nota tersimpan", () => {
  it("menyusun rincian barang dan pembayaran dengan istilah Indonesia", () => {
    const html = renderToStaticMarkup(
      <ReceiptSnapshot
        snapshot={receiptSnapshot}
        title="Nota asli sebelum perubahan Sales pertama"
      />,
    );
    for (const label of [
      "Nota asli sebelum perubahan Sales pertama",
      "Pelanggan contoh",
      "Cetak banner",
      "2 meter",
      "Tunai",
      "Lunas",
      "Ambil di toko",
    ])
      expect(html).toContain(label);
    expect(html).not.toContain("COMPLETED");
    expect(html).not.toContain("CASH");
    expect(html).toContain("<dl");
    expect(html).toContain("<details");
    expect(html).toContain("customer-demo");
    expect(html).toContain("Identitas data");
  });
  it("mempertahankan penjelasan pada nota tanpa barang", () => {
    const html = renderToStaticMarkup(
      <ReceiptSnapshot
        snapshot={{ ...receiptSnapshot, items: [] }}
        title="Nota sebelum"
      />,
    );
    expect(html).toContain("Tidak ada barang");
    expect(html).toContain("Subtotal");
  });
  it("tetap menampilkan label rincian yang belum diisi", () => {
    const html = renderToStaticMarkup(<ReceiptSnapshot snapshot={{ ...receiptSnapshot, customerName: null, note: null }} title="Versi lengkap" />);
    expect(html).toContain("Pelanggan");
    expect(html).toContain("Catatan transaksi");
    expect(html).toContain("Tidak ada");
  });
});
