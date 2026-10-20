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
  it("offers labelled inline fields on both continuation pages and one overall total", () => {
    const html = renderToStaticMarkup(<PrintingReceiptView receipt={receipt()} editable onChange={() => {}} />);
    expect(html.match(/aria-label="Halaman nota /g)).toHaveLength(2);
    expect(html).toContain('aria-label="Nama item baris 7"');
    expect(html).toContain('aria-label="Nomor nota"');
    expect(html.match(/aria-label="Jumlah nota"/g)).toHaveLength(1);
    expect(html).toContain("210.000");
  });
  it("keeps processed snapshots read only even if a caller requests editing", () => {
    const html = renderToStaticMarkup(<PrintingReceiptView receipt={receipt(true)} editable onChange={() => {}} />);
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
    expect(html).toContain("SP-108");
    expect(html).toContain("Spanduk 7");
  });
});
