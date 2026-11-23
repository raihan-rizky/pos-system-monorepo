import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrintingReceiptView } from "../components/PrintingReceiptView";
import type { PrintingReceipt } from "../types";

const receipt = (processed = false): PrintingReceipt => ({
  id: "receipt", storeId: "store", number: "SP-108", revision: 1, subcategory: "SPANDUK", transactionId: processed ? "sale" : null,
  createdAt: "2026-10-20", updatedAt: "2026-10-20",
  document: { customerName: "Toko Contoh", customerPhone: "081234", customerId: null, date: "2026-10-20", note: "Selesai sore", completionDate: "Selasa", completionTime: "16:00", receiver: "Sari", setter: "", signatory: "", lines: Array.from({ length: 7 }, (_, i) => ({ id: String(i), name: `Spanduk ${i + 1}`, material: "Flexi", quantity: 2, price: 15000, stockLink: null })) },
});
describe("printing receipt sheet", () => {
  it.each(["SPANDUK", "PRINT"] as const)("keeps the first omitted blank line editable outside %s paper without creating an empty page", subcategory => {
    const record = receipt();
    record.subcategory = subcategory;
    const count = subcategory === "SPANDUK" ? 6 : 13;
    record.document.lines = Array.from({ length: count + 2 }, (_, index) => ({ id: String(index), name: index < count ? "Cetak" : "", material: "", quantity: null, price: null, stockLink: null }));
    const html = renderToStaticMarkup(<PrintingReceiptView receipt={record} editable onChange={() => {}} />);
    expect(html.match(/aria-label="Halaman nota /g)).toHaveLength(1);
    expect(html).toContain('data-receipt-next-line="true"');
    expect(html).toContain(`aria-label="Nama item baris ${count + 1}"`);
    expect(html).toContain(`data-receipt-field="${count}-name"`);
    if (subcategory === "SPANDUK") {
      expect(html).toMatch(new RegExp(`<textarea[^>]*aria-label="Bahan baris ${count + 1}"`));
    } else {
      expect(new RegExp(`<textarea[^>]*aria-label="Bahan baris ${count + 1}"`).test(html)).toBe(false);
    }
    expect(html).not.toContain(`aria-label="Nama item baris ${count + 2}"`);
    expect(renderToStaticMarkup(<PrintingReceiptView receipt={record} />)).not.toContain("data-receipt-next-line");
    record.transactionId = "sale";
    expect(renderToStaticMarkup(<PrintingReceiptView receipt={record} editable onChange={() => {}} />)).not.toContain("data-receipt-next-line");
    expect(renderToStaticMarkup(<PrintingReceiptView receipt={record} editable allowProcessedEdit onChange={() => {}} />)).toContain('data-receipt-next-line="true"');
  });
  it("opens processed fields only in an explicitly authorized correction session and preserves the invoice number", () => {
    const html = renderToStaticMarkup(<PrintingReceiptView receipt={receipt(true)} editable allowProcessedEdit onChange={() => {}} />);
    expect(html).toMatch(/<input[^>]*aria-label="Harga satuan baris 1"/);
    expect(html).not.toMatch(/<input[^>]*aria-label="Nomor nota"/);
    expect(html).toContain("SP-108");
  });
  it("renders the payment line as inline text with a distinct color for each method", () => {
    const html = renderToStaticMarkup(<PrintingReceiptView receipt={receipt()} transaction={{
      total: 60_000, amountPaid: 60_000, paymentMethod: "CASH",
      payments: [{ method: "CASH" }, { method: "DEBIT" }, { method: "CREDIT" }, { method: "QRIS" }, { method: "TRANSFER" }],
    }} />);

    expect(html).toContain('aria-label="Metode pembayaran"');
    expect(html).toContain('<span style="color:#373396">Metode pembayaran: </span>');
    expect(html).toContain('<span style="color:#15803d">Tunai</span>');
    expect(html).toContain('<span style="color:#a16207">Debit</span>');
    expect(html).toContain('<span style="color:#7c3aed">Kartu kredit</span>');
    expect(html).toContain('<span style="color:#111827">QRIS</span>');
    expect(html).toContain('<span style="color:#2563eb">Transfer</span>');
  });
  it("offers labelled inline fields on both continuation pages and one overall total", () => {
    const html = renderToStaticMarkup(<PrintingReceiptView receipt={receipt()} editable onChange={() => {}} />);
    expect(html.match(/aria-label="Halaman nota /g)).toHaveLength(2);
    expect(html).toContain('aria-label="Nama item baris 7"');
    expect(html).toContain('aria-label="Nomor nota"');
    expect(html.match(/aria-label="Jumlah nota"/g)).toHaveLength(1);
    expect(html).toContain("210.000");
  });
  it("keeps one wrapping A5 Nama Barang input and displays Bahan read-only", () => {
    const record = receipt();
    record.subcategory = "PRINT";
    const longName = "Nama barang dengan teks panjang yang tetap membungkus di satu kolom";
    record.document.lines = [{ id: "item", name: longName, material: "Kertas HVS 80 gsm", quantity: 2, price: 15_000, stockLink: null }];
    const html = renderToStaticMarkup(<PrintingReceiptView receipt={record} editable onChange={() => {}} />);

    expect(html.match(/<textarea[^>]*aria-label="Nama item baris 1"/g)).toHaveLength(1);
    expect(html).toMatch(/<textarea[^>]*aria-label="Nama item baris 1"[^>]*rows="1"/);
    const nameField = html.match(/<textarea[^>]*aria-label="Nama item baris 1"[^>]*>/)?.[0] ?? "";
    expect(nameField).toContain("text-align:left");
    expect(html).toContain(longName);
    expect(html).not.toContain("data-top-aligned");
    expect(/<(?:input|textarea)[^>]*aria-label="Bahan baris 1"/.test(html)).toBe(false);
    expect(/<span[^>]*aria-label="Bahan baris 1"/.test(html)).toBe(true);
    expect(html).toContain("Kertas HVS 80 gsm");
  });
  it.each(["SPANDUK", "PRINT"] as const)("shows the %s customer and signatory names without editable controls", subcategory => {
    const record = receipt();
    record.subcategory = subcategory;
    record.document.customerName = "Pelanggan Pilihan";
    record.document.receiver = "Penerima Pilihan";
    record.document.signatory = "Sales Pilihan";
    record.document.lines = [{ id: "item", name: "Nama barang", material: "Bahan", quantity: 1, price: 10_000, stockLink: null }];
    const html = renderToStaticMarkup(<PrintingReceiptView receipt={record} editable onChange={() => {}} />);

    expect(/<(?:input|textarea)[^>]*aria-label="Nama pelanggan"/.test(html)).toBe(false);
    expect(/<(?:input|textarea)[^>]*aria-label="Hormat kami"/.test(html)).toBe(false);
    expect(html).toContain("Pelanggan Pilihan");
    expect(html).toContain("Sales Pilihan");
    if (subcategory === "SPANDUK") {
      expect(/<(?:input|textarea)[^>]*aria-label="Penerima"/.test(html)).toBe(false);
      expect(html).toContain("Penerima Pilihan");
    }
  });
  it("keeps processed snapshots read only even if a caller requests editing", () => {
    const html = renderToStaticMarkup(<PrintingReceiptView receipt={receipt(true)} editable onChange={() => {}} />);
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
    expect(html).toContain("SP-108");
    expect(html).toContain("Spanduk 7");
  });
});
