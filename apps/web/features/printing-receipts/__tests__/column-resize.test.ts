import { describe, expect, it } from "vitest";
import { createEmptyPrintingReceiptDocument, parsePrintingReceiptDocument } from "../domain";
import { buildPrintingReceiptPages, getPrintingReceiptLayout, getPrintingReceiptPageFields, getReceiptColumnWidths, resizeReceiptColumnBoundary } from "../layout";
import { buildPrintingReceiptPresentation } from "../presentation";
import { PRINTING_SUBCATEGORIES, type PrintingReceipt } from "../types";

const receipt = (subcategory: PrintingReceipt["subcategory"] = "SPANDUK"): PrintingReceipt => ({
  id: "nota-contoh", storeId: "store", number: "CONTOH", revision: 1, subcategory, transactionId: null,
  createdAt: "2026-10-21", updatedAt: "2026-10-21", document: { ...createEmptyPrintingReceiptDocument(),
    lines: [{ id: "1", name: "Contoh cetakan", material: "Flexi luar ruang premium ".repeat(3), quantity: 2, price: 15000, stockLink: null }] },
});
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe("per-receipt column widths", () => {
  it("roundtrips widths through the actual persisted JSON parser without adding defaults to old receipts", () => {
    const document = receipt().document;
    const widths = [6.85, 88.9, 27.6, 11.35, 23.45, 27.35];
    expect(parsePrintingReceiptDocument(JSON.parse(JSON.stringify({ ...document, columnWidths: widths }))).columnWidths).toEqual(widths);
    expect(parsePrintingReceiptDocument(document)).not.toHaveProperty("columnWidths");
  });
  it.each([[1, 2, 3], [0, 30, 20, 50], [NaN, 30, 20, 50], [Infinity, 30, 20, 50], [400, 30, 20, 50], ["20", 30, 20, 50]].map(widths => ({ widths })))("rejects malformed persisted widths with an Indonesian error: $widths", ({ widths }) => {
    expect(() => parsePrintingReceiptDocument({ ...receipt().document, columnWidths: widths })).toThrow(/Lebar kolom/);
  });
  it("clamps only the adjacent pair and keeps total, other columns and source array unchanged", () => {
    const widths = getReceiptColumnWidths("SPANDUK");
    const original = [...widths];
    const wider = resizeReceiptColumnBoundary("SPANDUK", widths, 1, -20);
    expect(wider).toEqual([6.85, 88.9, 27.6, 11.35, 23.45, 27.35]);
    expect(sum(wider)).toBeCloseTo(185.5, 8);
    expect(widths).toEqual(original);
    expect(resizeReceiptColumnBoundary("SPANDUK", widths, 1, 999)[2]).toBe(6);
    expect(resizeReceiptColumnBoundary("SPANDUK", widths, 1, -999)[1]).toBe(30);
    expect(resizeReceiptColumnBoundary("SPANDUK", widths, -1, 4)).toEqual(original);
    expect(resizeReceiptColumnBoundary("SPANDUK", widths, 5, 4)).toEqual(original);
  });
  it("returns independent defaults and rejects category count, wrong total and undersized arrays", () => {
    const a = getReceiptColumnWidths("SPANDUK");
    a[0] = 900;
    expect(getReceiptColumnWidths("SPANDUK")[0]).toBe(6.85);
    for (const bad of [[20, 60, 26, 31.8], [6, 30, 6, 8, 14, 16], [5, 110.75, 7.6, 11.35, 23.45, 27.35], [NaN, 108.9, 7.6, 11.35, 23.45, 27.35]]) {
      expect(getReceiptColumnWidths("SPANDUK", bad)).toEqual(getReceiptColumnWidths("SPANDUK"));
      expect(getPrintingReceiptLayout("SPANDUK", bad)).toEqual(getPrintingReceiptLayout("SPANDUK"));
    }
  });
  it.each(PRINTING_SUBCATEGORIES)("derives %s header and cell geometry from one fixed set of boundaries", subcategory => {
    const record = receipt(subcategory);
    const defaults = getReceiptColumnWidths(subcategory);
    record.document.columnWidths = resizeReceiptColumnBoundary(subcategory, defaults, 1, -10);
    const layout = getPrintingReceiptLayout(subcategory, record.document.columnWidths);
    const page = buildPrintingReceiptPages(record)[0];
    const keys = subcategory === "SPANDUK" ? ["index", "name", "material", "quantity", "price", "total"] as const : ["quantity", "name", "price", "total"] as const;
    expect(page.header.columnXs).toEqual(page.table.columnXs);
    expect(page.header.redraw).toBe(true);
    expect(page.header.rules.filter(rule => rule.x1 === rule.x2).map(rule => rule.x1)).toEqual(page.table.columnXs);
    expect(page.table.x).toBe(subcategory === "SPANDUK" ? 21.25 : 5.45);
    expect(page.table.width).toBeCloseTo(subcategory === "SPANDUK" ? 185.5 : 137.8, 8);
    keys.forEach((key, index) => {
      expect(layout.columns[key].x).toBeCloseTo(page.table.columnXs[index] + .35, 6);
      expect(layout.columns[key].width).toBeCloseTo(record.document.columnWidths![index] - .7, 6);
    });
    expect(layout.fields).toEqual(getPrintingReceiptLayout(subcategory).fields);
    expect(getPrintingReceiptPageFields(record, page).find(field => field.key === "1-name")?.x).toBe(layout.columns.name.x);
    if (subcategory !== "SPANDUK") {
      expect(layout.columns.material.x).toBe(layout.columns.name.x);
      expect(layout.columns.material.width).toBe(layout.columns.name.width);
      expect(page.header.labels.map(label => label.value)).toEqual(["Byknya", "Nama Barang", "Harga", "Satuan", "Jumlah"]);
    }
  });
  it("wraps Bahan less and needs fewer receipt pages when widened without changing text or fonts", () => {
    const narrow = receipt();
    const wide = structuredClone(narrow);
    wide.document.columnWidths = resizeReceiptColumnBoundary("SPANDUK", getReceiptColumnWidths("SPANDUK"), 1, -30);
    const before = buildPrintingReceiptPages(narrow);
    const after = buildPrintingReceiptPages(wide);
    expect(after.length).toBeLessThan(before.length);
    expect(after.flatMap(page => page.lines.flatMap(row => row.materialLines)).length).toBeLessThan(before.flatMap(page => page.lines.flatMap(row => row.materialLines)).length);
    expect(after.flatMap(page => page.lines.flatMap(row => row.materialLines)).join("")).toBe(narrow.document.lines[0].material);
    expect(wide.document.lines).toEqual(narrow.document.lines);
    expect(buildPrintingReceiptPresentation(wide).pages[0].fields.find(field => field.lineField === "material")?.fittedFontSize).toBe(getPrintingReceiptLayout("SPANDUK").columns.quantity.fontSize);
    expect(narrow.document).not.toHaveProperty("columnWidths");
  });
  it("uses a consistent resized header on continuation pages and falls back safely on corrupt stored arrays", () => {
    const record = receipt();
    record.document.lines[0].name = "Nama panjang untuk nota ".repeat(100);
    record.document.columnWidths = resizeReceiptColumnBoundary("SPANDUK", getReceiptColumnWidths("SPANDUK"), 1, -70);
    const pages = buildPrintingReceiptPages(record);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every(page => JSON.stringify(page.header) === JSON.stringify(pages[0].header))).toBe(true);
    record.document.columnWidths = [2, 3];
    expect(buildPrintingReceiptPages(record)[0].table.columnXs).toEqual(buildPrintingReceiptPages(receipt())[0].table.columnXs);
  });
});
