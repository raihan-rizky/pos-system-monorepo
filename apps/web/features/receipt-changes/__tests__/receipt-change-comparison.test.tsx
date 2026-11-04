import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReceiptChangeComparison } from "../components/ReceiptChangeComparison";
import { receiptChanges } from "./receipt-change-fixture";

const original = {
  invoiceNumber: "INV-001",
  invoiceDate: "2026-11-04T02:00:01Z",
  customerId: "customer-1",
  customerName: "Nama asli",
  salespersonId: null,
  salesName: "Sales",
  note: "Catatan asli",
  status: "COMPLETED",
  paymentMethod: "CASH",
  subtotal: 10000,
  discount: 0,
  tax: 0,
  taxRate: null,
  taxMethod: "EXCLUSIVE",
  total: 10000,
  amountPaid: 10000,
  change: 0,
  payments: [{ method: "CASH", amount: 10000 }],
  debtPayments: [],
  items: [],
  printingReceipt: null,
};
const changes = [
  {
    id: "first",
    actorName: "Sales satu",
    createdAt: "2026-11-04T03:00:00Z",
    before: original,
    after: { ...original, note: "Koreksi pertama", total: 12000 },
  },
  {
    id: "second",
    actorName: "Sales dua",
    createdAt: "2026-11-04T04:00:00Z",
    before: { ...original, note: "Koreksi pertama", total: 12000 },
    after: { ...original, note: "Koreksi terbaru", total: 14000 },
  },
];

describe("perbandingan versi nota", () => {
  it("menampilkan revisi terbaru dengan akses ke nota asli dan kedua versi lengkap", () => {
    const html = renderToStaticMarkup(
      <ReceiptChangeComparison changes={changes} />,
    );
    expect(html).toContain("Nota asli");
    expect(html).toContain("Versi lengkap");
    expect(html).toContain("Koreksi pertama");
    expect(html).toContain("Koreksi terbaru");
    expect(html).toContain("Sebelum");
    expect(html).toContain("Sesudah");
    expect(html).toContain('for="receipt-change"');
    expect(html).toContain("Jejak perubahan");
    expect(html).toContain("Yang berubah");
    expect(html).toContain("Total sebelum");
    expect(html).toContain("Total sesudah");
  });
  it("membuka perubahan yang dituju notifikasi walaupun sudah ada perubahan berikutnya", () => {
    const html = renderToStaticMarkup(
      <ReceiptChangeComparison changes={changes} initialChangeId="first" />,
    );
    expect(html).toContain("Koreksi pertama");
    expect(html).not.toContain("Koreksi terbaru");
    expect(html).toContain('value="first" selected=""');
  });
  it("memberi penjelasan bila belum ada versi tersimpan", () => {
    const html = renderToStaticMarkup(<ReceiptChangeComparison changes={[]} />);
    expect(html).toContain("Belum ada perubahan Sales yang tercatat");
  });
  it("memberi penjelasan saat ID notifikasi tidak ditemukan", () => {
    const html = renderToStaticMarkup(
      <ReceiptChangeComparison changes={changes} initialChangeId="missing" />,
    );
    expect(html).toContain("Perubahan yang diminta tidak ditemukan");
    expect(html).toContain("Koreksi terbaru");
  });
  it("membedakan tanggal nota yang berubah dalam menit yang sama", () => {
    const change = {
      ...changes[0],
      after: { ...original, invoiceDate: "2026-11-04T02:00:02Z" },
    };
    const html = renderToStaticMarkup(
      <ReceiptChangeComparison changes={[change]} />,
    );
    expect(html).toContain("Rincian yang berubah");
    expect(html).not.toContain("Tidak ada perbedaan rincian");
    expect(html).toContain("09.00.01");
    expect(html).toContain("09.00.02");
  });
  it("menyajikan perubahan barang per rincian dengan konteks revisi dan selisih total", () => {
    const html = renderToStaticMarkup(
      <ReceiptChangeComparison changes={receiptChanges} />,
    );
    expect(html).toContain("Jejak perubahan");
    expect(html).toContain("Revisi 2 dari 2");
    expect(html).toContain("Cetak banner");
    expect(html).toContain("3 meter");
    expect(html).toContain("Naik");
    expect(html).toContain('scope="row"');
    expect(html).toContain('aria-current="step"');
    expect(html).not.toContain("Harga awal:");
  });
  it("menjelaskan nilai tetap dengan netral saat hanya catatan berubah", () => {
    const html = renderToStaticMarkup(
      <ReceiptChangeComparison
        changes={receiptChanges}
        initialChangeId="revision-1"
      />,
    );
    expect(html).toContain("Total tetap");
    expect(html).toContain("Ambil di toko");
    expect(html).toContain("Ambil pukul 16.00");
    expect(html).not.toContain("3 meter");
  });
});
