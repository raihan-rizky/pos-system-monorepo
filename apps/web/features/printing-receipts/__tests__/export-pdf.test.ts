import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createPrintingReceiptPdf } from "../export-pdf";
import { buildPrintingReceiptPresentation } from "../presentation";
import type { PrintingReceipt } from "../types";

const receipt = (subcategory: PrintingReceipt["subcategory"]): PrintingReceipt => ({
  id: "nota", storeId: "store", number: "SP-20261020-009", revision: 1, subcategory,
  transactionId: "sale", createdAt: "2026-10-20", updatedAt: "2026-10-20",
  document: { customerName: "Pelanggan Contoh", customerPhone: "08123456789", customerId: null, date: "2026-10-20", note: "Warna sesuai contoh", completionDate: "Selasa", completionTime: "16:00", receiver: "Sari", setter: "Eka", signatory: "Teladan", lines: Array.from({ length: subcategory === "SPANDUK" ? 7 : 14 }, (_, i) => ({ id: String(i), name: `Cetak ${i + 1}`, material: "Flexi", quantity: 2, price: 15000, stockLink: null })) },
});

describe("printing receipt PDF", () => {
  it.each(["SPANDUK", "PRINT"] as const)("keeps the internal title out of %s paper and appendix pages", async subcategory => {
    const record = receipt(subcategory);
    record.document = { ...record.document, title: "INTERNAL_ONLY_BANNER_OKTOBER" };
    const asset = subcategory === "SPANDUK" ? "nota-spanduk.png" : "nota-percetakan.png";
    const artwork = `data:image/png;base64,${readFileSync(resolve("public/images/printing-receipts", asset)).toString("base64")}`;
    const pdf = await createPrintingReceiptPdf(record, null, artwork);
    expect(pdf.output()).not.toContain("INTERNAL_ONLY_BANNER_OKTOBER");
    expect(pdf.output()).toContain(record.number);
  });
  it("prints saved A5 supplemental details and keeps long titles and void status on every appendix", async () => {
    const record = receipt("PRINT");
    record.number = `PR-${"W".repeat(77)}`;
    record.document.lines = [];
    record.document.note = "Keterangan tambahan A5 lengkap AKHIR_TAMBAHAN";
    record.document.completionDate = "2026-10-21";
    const artwork = `data:image/png;base64,${readFileSync(resolve("public/images/printing-receipts/nota-percetakan.png")).toString("base64")}`;
    const pdf = await createPrintingReceiptPdf(record, { total: 75000, amountPaid: 75000, status: "VOIDED" }, artwork);
    const presentation = buildPrintingReceiptPresentation(record);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(presentation.appendixTitleFontSize);
    expect(presentation.appendixTitleLines.every(line => pdf.getTextWidth(line) <= 128.001)).toBe(true);
    expect(presentation.appendixTitleFontSize).toBeGreaterThanOrEqual(7);
    const output = pdf.output();
    expect(output.includes("AKHIR_TAMBAHAN")).toBe(true);
    expect(output.includes("21/10/2026")).toBe(true);
    expect(output.match(/\(DIBATALKAN\)/g)).toHaveLength(pdf.getNumberOfPages());
  });
  it("preserves extreme item values on receipt pages and other overflow in readable appendices", async () => {
    const record = receipt("SPANDUK");
    record.document.lines = [{ ...record.document.lines[0], name: `${"Nama cetakan panjang ".repeat(23)}AKHIR_NAMA`, material: `${"Bahan khusus ".repeat(22)}AKHIR_BAHAN` }];
    record.document.note = `${"Catatan pesanan panjang yang harus terbaca. ".repeat(115)}AKHIR_CATATAN`;
    const artwork = `data:image/png;base64,${readFileSync(resolve("public/images/printing-receipts/nota-spanduk.png")).toString("base64")}`;
    const pdf = await createPrintingReceiptPdf(record, null, artwork);
    const presentation = buildPrintingReceiptPresentation(record);
    expect(presentation.pages.flatMap(page => page.fields).every(field => field.textLines.length * field.fittedFontSize / 2.83465 * 1.12 <= field.height)).toBe(true);
    expect(presentation.pages.flatMap(page => page.fields).every(field => field.fittedFontSize >= 5)).toBe(true);
    expect(presentation.appendixPages.flatMap(page => page.lines).every(line => line.y <= 97)).toBe(true);
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    const output = pdf.output();
    const printedText = Array.from(output.matchAll(/\(([^()]*)\) Tj/g), match => match[1]).join("");
    for (const key of ["name", "material"] as const) {
      const fragments = presentation.pages.flatMap(page => page.fields.filter(field => field.lineId === record.document.lines[0].id && field.lineField === key));
      expect(fragments.flatMap(field => field.textLines).join("").replace(/\s/g, "")).toBe(record.document.lines[0][key].replace(/\s/g, ""));
    }
    expect(output.includes("Lampiran nota")).toBe(true);
    expect(printedText.includes("AKHIR_NAMA")).toBe(true);
    expect(printedText.includes("AKHIR_BAHAN")).toBe(true);
    expect(output.includes("AKHIR_CATATAN")).toBe(true);
    expect(output.includes("[1]")).toBe(true);
  });
  it.each(["SPANDUK", "PRINT"] as const)("exports %s with original paper size and all continuation rows", async subcategory => {
    const asset = subcategory === "SPANDUK" ? "nota-spanduk.png" : "nota-percetakan.png";
    const artwork = `data:image/png;base64,${readFileSync(resolve("public/images/printing-receipts", asset)).toString("base64")}`;
    const pdf = await createPrintingReceiptPdf(receipt(subcategory), { total: 55500, amountPaid: 20000 }, artwork);
    expect(pdf.getNumberOfPages()).toBe(subcategory === "SPANDUK" ? 2 : 3);
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(subcategory === "SPANDUK" ? 215 : 148, 1);
    expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(subcategory === "SPANDUK" ? 110 : 210, 1);
    const output = pdf.output();
    expect(output).toContain("SP-20261020-009");
    expect(output).toContain(subcategory === "SPANDUK" ? "Cetak 7" : "Cetak 14");
    expect(output.match(/\(55.500\)/g)).toHaveLength(1);
    if (subcategory === "SPANDUK") { expect(output).toContain("35.500"); expect(output).toContain("20.000"); }
  });
});
