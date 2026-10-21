import { describe, expect, it } from "vitest";
import { buildPrintingReceiptPages, getPrintingReceiptLayout, getPrintingReceiptPageFields, getPrintingReceiptTotals, getPrintingReceiptWatermark } from "../layout";
import type { PrintingReceipt, PrintingReceiptLine } from "../types";

const line = (id: number): PrintingReceiptLine => ({
  id: String(id), name: `Cetak ${id}`, material: "Flexi", quantity: 2, price: 15_000, stockLink: null,
});
const receipt = (subcategory: PrintingReceipt["subcategory"], count: number): PrintingReceipt => ({
  id: "nota-1", storeId: "toko-1", number: "SP-20261020-001", revision: 1, subcategory,
  transactionId: null, createdAt: "2026-10-20T01:00:00Z", updatedAt: "2026-10-20T01:00:00Z",
  document: { customerName: "Budi", customerPhone: "", customerId: null, date: "2026-10-20", note: "",
    completionDate: "", completionTime: "", receiver: "", setter: "", signatory: "", lines: Array.from({ length: count }, (_, i) => line(i)) },
});

describe("printing receipt layout", () => {
  it("keeps the spanduk receiver on the Nama line with blank space above for a signature", () => {
    const record = receipt("SPANDUK", 7);
    record.document.receiver = "test";
    for (const page of buildPrintingReceiptPages(record)) {
      const fields = getPrintingReceiptPageFields(record, page);
      const receiver = fields.find(field => field.key === "receiver")!;
      const signatory = fields.find(field => field.key === "signatory")!;
      expect(receiver.value).toBe("test");
      expect(receiver.y).toBe(signatory.y);
      expect(receiver.height).toBe(signatory.height);
      expect(receiver.y).toBeGreaterThanOrEqual(95.5);
      expect(receiver.y + receiver.height).toBeLessThanOrEqual(99);
      expect(receiver.x).toBeGreaterThanOrEqual(125);
      expect(receiver.x + receiver.width).toBeLessThanOrEqual(152);
    }
  });
  it("keeps the spanduk signatory on the Nama line with blank space above for a signature", () => {
    const record = receipt("SPANDUK", 7);
    record.document.signatory = "Sakhila";
    for (const page of buildPrintingReceiptPages(record)) {
      const signatory = getPrintingReceiptPageFields(record, page).find(field => field.key === "signatory")!;
      expect(signatory.value).toBe("Sakhila");
      expect(signatory.y).toBeGreaterThanOrEqual(95.5);
      expect(signatory.y + signatory.height).toBeLessThanOrEqual(99);
      // Keep the printed Nama label and WA mark outside the writable name area.
      expect(signatory.x).toBeGreaterThanOrEqual(174.8);
      expect(signatory.x + signatory.width).toBeLessThanOrEqual(201);
    }
  });
  it.each([
    ["SPANDUK", 0, [0]], ["SPANDUK", 6, [6]], ["SPANDUK", 7, [6, 1]], ["SPANDUK", 12, [6, 6]],
    ["PERCETAKAN", 0, [0]], ["PERCETAKAN", 13, [13]], ["PERCETAKAN", 14, [13, 1]], ["PERCETAKAN", 26, [13, 13]],
    ["PLAT", 0, [0]], ["PLAT", 13, [13]], ["PLAT", 14, [13, 1]], ["PLAT", 26, [13, 13]],
    ["STEMPEL", 0, [0]], ["STEMPEL", 13, [13]], ["STEMPEL", 14, [13, 1]], ["STEMPEL", 26, [13, 13]],
    ["PRINT", 0, [0]], ["PRINT", 13, [13]], ["PRINT", 14, [13, 1]], ["PRINT", 26, [13, 13]],
  ] as const)("keeps %s with %s rows intact at page boundaries", (subcategory, count, expectedCounts) => {
    const pages = buildPrintingReceiptPages(receipt(subcategory, count));
    expect(pages.map(page => page.lines.length)).toEqual(expectedCounts);
    expect(pages.flatMap(page => page.lines.map(item => item.line.id))).toEqual(Array.from({ length: count }, (_, index) => String(index)));
    expect(pages.flatMap(page => page.lines.map(item => item.number))).toEqual(Array.from({ length: count }, (_, index) => index + 1));
    expect(pages.filter(page => page.showTotals)).toHaveLength(1);
    expect(pages.at(-1)?.showTotals).toBe(true);
  });
  it("preserves the original physical sizes and row capacities", () => {
    expect(getPrintingReceiptLayout("SPANDUK")).toMatchObject({ width: 215, height: 110, rowsPerPage: 6 });
    for (const category of ["PERCETAKAN", "PLAT", "STEMPEL", "PRINT"] as const) {
      expect(getPrintingReceiptLayout(category)).toMatchObject({ width: 148, height: 210, rowsPerPage: 13 });
    }
  });
  it("keeps every extra row and places overall totals only on the last page", () => {
    for (const [category, count, perPage] of [["SPANDUK", 14, 6], ["PRINT", 28, 13]] as const) {
      const pages = buildPrintingReceiptPages(receipt(category, count));
      expect(pages.map(page => page.lines.length)).toEqual([perPage, perPage, 2]);
      expect(pages.flatMap(page => page.lines.map(item => item.line.id))).toEqual(Array.from({ length: count }, (_, i) => String(i)));
      expect(pages.map(page => page.showTotals)).toEqual([false, false, true]);
      expect(pages[2].lines[0].number).toBe(perPage * 2 + 1);
    }
  });
  it("renders an empty persisted draft as one blank page", () => {
    expect(buildPrintingReceiptPages(receipt("SPANDUK", 0))).toMatchObject([{ lines: [], showTotals: true }]);
  });
  it("replaces the A5 sample number with the real document number", () => {
    const layout = getPrintingReceiptLayout("PRINT");
    expect(layout.numberMask).toMatchObject({ x: 22, y: 40, width: 17, height: 5 });
    expect(buildPrintingReceiptPages(receipt("PRINT", 1))[0].number).toBe("SP-20261020-001");
  });
  it("places a larger blue No. Nota label and number below the store address on every spanduk page", () => {
    const record = receipt("SPANDUK", 7);
    for (const page of buildPrintingReceiptPages(record)) {
      const fields = getPrintingReceiptPageFields(record, page);
      const label = fields.find(field => field.key === "number-label")!;
      const number = fields.find(field => field.key === "number")!;
      expect(label.value).toBe("No. Nota:");
      expect(label).toMatchObject({ color: "#373396", fontSize: 9, bold: true });
      expect(label.x).toBeLessThan(25);
      expect(label.y).toBeGreaterThanOrEqual(24.5);
      expect(label.x + label.width).toBeLessThanOrEqual(number.x);
      expect(number.y).toBe(label.y);
      expect(number.fontSize).toBe(9);
      expect(number.x + number.width).toBeLessThan(95);
      expect(number.y + number.height).toBeLessThan(29.5);
      expect(number.value).toBe(record.number);
    }
  });
  it("uses latest transaction payments for total, DP and outstanding amount", () => {
    expect(getPrintingReceiptTotals(receipt("SPANDUK", 2))).toEqual({ subtotal: 60_000, total: 60_000, paid: 0, remaining: 60_000 });
    expect(getPrintingReceiptTotals(receipt("SPANDUK", 2), { total: 55_500, amountPaid: 20_000 })).toEqual({ subtotal: 60_000, total: 55_500, paid: 20_000, remaining: 35_500 });
    expect(getPrintingReceiptTotals(receipt("SPANDUK", 2), { total: 55_500, amountPaid: 60_000 }).remaining).toBe(0);
  });
  it("marks drafts, approval documents and cancelled snapshots", () => {
    expect(getPrintingReceiptWatermark(receipt("SPANDUK", 1))).toBe("DRAFT");
    const processed = { ...receipt("SPANDUK", 1), transactionId: "sale" };
    expect(getPrintingReceiptWatermark(processed, { status: "PENDING_APPROVAL" })).toBe("MENUNGGU PERSETUJUAN");
    expect(getPrintingReceiptWatermark(processed, { status: "VOIDED" })).toBe("DIBATALKAN");
    expect(getPrintingReceiptWatermark(processed, { status: "REFUNDED" })).toBe("DIREFUND");
    expect(getPrintingReceiptWatermark(processed, { status: "DP" })).toBeNull();
    expect(getPrintingReceiptWatermark(processed, { status: "COMPLETED" })).toBeNull();
  });
});
