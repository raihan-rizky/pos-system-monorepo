import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createPrintingReceiptPdf } from "../export-pdf";
import { buildPrintingReceiptPages, getPrintingReceiptLayout } from "../layout";
import { buildPrintingReceiptPresentation } from "../presentation";
import type { PrintingReceipt, PrintingReceiptLine } from "../types";

const item = (id: number, name = "Cetak contoh"): PrintingReceiptLine => ({
  id: String(id), name, material: "", quantity: 2, price: 15000, stockLink: null,
});
const receipt = (subcategory: PrintingReceipt["subcategory"], lines: PrintingReceiptLine[]): PrintingReceipt => ({
  id: "automatic-rows", storeId: "store", number: "NOTA-CONTOH", revision: 1, subcategory,
  transactionId: "sale", createdAt: "2026-10-21", updatedAt: "2026-10-21",
  document: { customerName: "", customerPhone: "", customerId: null, date: "2026-10-21", note: "",
    completionDate: "", completionTime: "", receiver: "", setter: "", signatory: "", lines },
});

describe("automatic printing receipt rows", () => {
  it.each(["SPANDUK", "PERCETAKAN", "PLAT", "STEMPEL", "PRINT"] as const)("grows %s names at their original font size and moves the following item", subcategory => {
    const name = "Spanduk promosi pembukaan toko cabang Jakarta ukuran tiga kali satu meter ".repeat(3);
    const record = receipt(subcategory, [item(1, name), item(2)]);
    const { pages, appendixPages } = buildPrintingReceiptPresentation(record);
    expect(pages).toHaveLength(1);
    expect(appendixPages).toHaveLength(0);
    const first = pages[0].fields.find(field => field.key === "1-name")!;
    const second = pages[0].fields.find(field => field.key === "2-name")!;
    expect(first.fittedFontSize).toBe(subcategory === "SPANDUK" ? 9 : 10);
    expect(first.textLines.join(" ").replace(/\s/g, "")).toBe(name.replace(/\s/g, ""));
    expect(first.displayValue).not.toMatch(/\.\.\.|\[\d+\]/);
    expect(first.height).toBeGreaterThan(getPrintingReceiptLayout(subcategory).rowHeight);
    expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  });

  it.each(["SPANDUK", "PRINT"] as const)("wraps unbroken %s names without losing characters", subcategory => {
    const name = "1".repeat(240);
    const { pages, appendixPages } = buildPrintingReceiptPresentation(receipt(subcategory, [item(1, name)]));
    const field = pages[0].fields.find(field => field.key === "1-name")!;
    expect(pages).toHaveLength(1);
    expect(appendixPages).toHaveLength(0);
    expect(field.textLines.join("")).toBe(name);
    expect(field.fittedFontSize).toBe(subcategory === "SPANDUK" ? 9 : 10);
  });

  it("uses trailing blank draft rows as spare space without changing persisted data", () => {
    const lines = [item(1, "Nama panjang untuk promosi toko baru di Jakarta ".repeat(4)),
      ...Array.from({ length: 5 }, (_, index) => ({ ...item(index + 2, ""), quantity: null, price: null }))];
    const record = receipt("SPANDUK", lines);
    const before = JSON.stringify(record);
    const pages = buildPrintingReceiptPages(record);
    expect(pages).toHaveLength(1);
    expect(JSON.stringify(record)).toBe(before);
    expect(pages[0].lines[0].height).toBeGreaterThan(5.55);
    expect(pages[0].lines.length).toBeLessThan(6);
    expect(pages[0].lines.length).toBeGreaterThan(1);
  });

  it("keeps entered quantities and stock links when deciding whether a row is blank", () => {
    const lines = [item(1, "Nama panjang untuk promosi toko baru di Jakarta ".repeat(4)),
      ...Array.from({ length: 5 }, (_, index) => item(index + 2, ""))];
    const pages = buildPrintingReceiptPages(receipt("SPANDUK", lines));
    expect(pages).toHaveLength(2);
    expect(pages.flatMap(page => page.lines.map(row => row.line.id))).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it.each(["SPANDUK", "PRINT"] as const)("moves a complete %s item to the next page when it cannot fit below prior items", subcategory => {
    const count = subcategory === "SPANDUK" ? 5 : 12;
    const record = receipt(subcategory, [...Array.from({ length: count }, (_, index) => item(index + 1)), item(count + 1, "Baris pertama\nBaris kedua\nBaris ketiga")]);
    const { pages } = buildPrintingReceiptPresentation(record);
    expect(pages).toHaveLength(2);
    expect(pages[0].lines).toHaveLength(count);
    expect(pages[1].lines).toHaveLength(1);
    expect(pages[1].lines[0].number).toBe(count + 1);
    expect(pages.map(page => page.showTotals)).toEqual([false, true]);
  });

  it("places A5 material below the whole name and keeps the next item below both", () => {
    const record = receipt("PRINT", [{ ...item(1, "Nama barang panjang ".repeat(12)), material: "Bahan tambahan ".repeat(7) }, item(2)]);
    const { pages } = buildPrintingReceiptPresentation(record);
    const name = pages[0].fields.find(field => field.key === "1-name")!;
    const material = pages[0].fields.find(field => field.key === "1-material")!;
    const second = pages[0].fields.find(field => field.key === "2-name")!;
    expect(material.y).toBeGreaterThanOrEqual(name.y + name.height);
    expect(second.y).toBeGreaterThanOrEqual(material.y + material.height);
    expect(material.fittedFontSize).toBe(7);
  });

  it.each(["SPANDUK", "PRINT"] as const)("continues an exceptionally tall %s item on receipt pages with every character and one amount", async subcategory => {
    const name = "NAMA_PANJANG_".repeat(180) + "AKHIRNAMA";
    const record = receipt(subcategory, [item(1, name), item(2, "ITEMBERIKUTNYA")]);
    const { pages, appendixPages } = buildPrintingReceiptPresentation(record);
    expect(pages.length).toBeGreaterThan(1);
    expect(appendixPages).toHaveLength(0);
    const names = pages.flatMap(page => page.fields.filter(field => field.lineId === "1" && field.lineField === "name"));
    expect(names.flatMap(field => field.textLines).join("")).toBe(name);
    expect(names.every(field => field.fittedFontSize === (subcategory === "SPANDUK" ? 9 : 10))).toBe(true);
    expect(pages.flatMap(page => page.fields).filter(field => field.key === "1-total" && field.value === "30.000")).toHaveLength(1);
    expect(pages.filter(page => page.showTotals)).toHaveLength(1);
    const artwork = `data:image/png;base64,${readFileSync(resolve("public/images/printing-receipts", subcategory === "SPANDUK" ? "nota-spanduk.png" : "nota-percetakan.png")).toString("base64")}`;
    const pdf = await createPrintingReceiptPdf(record, null, artwork);
    expect(pdf.getNumberOfPages()).toBe(pages.length);
    // A marker in an unbroken value may cross PDF text operators at a line break.
    const printedText = Array.from(pdf.output().matchAll(/\(([^()]*)\) Tj/g), match => match[1]).join("");
    expect(printedText).toContain("AKHIRNAMA");
    expect(pdf.output()).toContain("ITEMBERIKUTNYA");
    expect(pdf.output()).not.toContain("Lampiran nota");
  });

  it("restores spare rows when a name becomes short again", () => {
    const record = receipt("SPANDUK", [item(1, "Nama barang panjang ".repeat(10)), item(2)]);
    const tall = buildPrintingReceiptPages(record);
    record.document.lines[0].name = "Pendek";
    const short = buildPrintingReceiptPages(record);
    expect(short[0].lines[1].y).toBeCloseTo(40.65, 2);
    expect(tall[0].lines[1].y).toBeGreaterThan(short[0].lines[1].y);
  });

  it("keeps the empty A5 material input below the entire editable name", () => {
    const { pages } = buildPrintingReceiptPresentation(receipt("PRINT", [item(1, "Nama panjang untuk bahan menyusul ".repeat(8)), item(2)]));
    const name = pages[0].fields.find(field => field.key === "1-name")!;
    const material = pages[0].fields.find(field => field.key === "1-material")!;
    const next = pages[0].fields.find(field => field.key === "2-name")!;
    expect(material.y).toBeGreaterThanOrEqual(name.y + name.height);
    expect(material.height).toBeGreaterThan(3);
    expect(next.y).toBeGreaterThanOrEqual(material.y + material.height);
  });

  it("retains both A5 text inputs when only material is entered", () => {
    const { pages } = buildPrintingReceiptPresentation(receipt("PRINT", [{ ...item(1, ""), material: "Kertas ivory" }]));
    const name = pages[0].fields.find(field => field.key === "1-name")!;
    const material = pages[0].fields.find(field => field.key === "1-material")!;
    expect(name).toBeDefined();
    expect(material.y).toBeGreaterThanOrEqual(name.y + name.height);
  });
});
