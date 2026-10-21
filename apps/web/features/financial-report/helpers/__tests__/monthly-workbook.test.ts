import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx-js-style";
import { buildMonthlyWorkbook, monthlySheetNames, serializeMonthlyWorkbook } from "../monthly-workbook";
import type { MonthlyFinancialReport } from "../monthly-report-types";

function report(): MonthlyFinancialReport {
  return {
    year: 2026, month: 9, from: "2026-09-01", to: "2026-09-30",
    income: [
      { id: "sale-1", date: "2026-09-01", reference: "INV-CONTOH", description: "=SUM(A1:A2)", amounts: { CETAK: 100, PLAT: 20, STEMPEL: 10, SPANDUK: 40, ATK: 50, PRINT: 60, UNMAPPED: 7.25 } },
      { id: "sale-2", date: "2026-09-30", reference: "INV-DUA", description: "Pesanan contoh", amounts: { CETAK: 0, PLAT: 0, STEMPEL: 0, SPANDUK: 0, ATK: 12.35, PRINT: 0, UNMAPPED: 0 } },
    ],
    expenses: [
      { id: "e1", date: "2026-09-01", description: "=HYPERLINK(\"https://example.invalid\")", amount: 30.1, group: "OTHER" },
      { id: "e2", date: "2026-09-01", description: "Gaji tercatat", amount: 40, group: "SALARY" },
      { id: "e3", date: "2026-09-30", description: "Belanja kertas", amount: 15.5, group: "CETAK_PLAT", purchase: { reference: "PB-CONTOH", method: "GIRO", dueDate: "2026-10-02", supplier: "Supplier contoh" } },
    ],
    receivables: [{ id: "r1", date: "2026-09-15", dueDate: "2026-10-15", reference: "INV-PIUTANG", description: "Pekerjaan contoh", customer: "Pelanggan contoh", amount: 90.75 }],
    inventoryBalance: null, supplierDebtBalance: null, warnings: ["Data contoh untuk pengujian."],
  };
}

function archiveText(bytes: Uint8Array, path: string): string {
  const archive = XLSX.CFB.read(bytes, { type: "array" });
  const entry = XLSX.CFB.find(archive, `/${path}`);
  expect(entry, path).toBeTruthy();
  return new TextDecoder().decode(new Uint8Array(entry.content));
}

describe("monthly workbook", () => {
  it("uses exactly seven ordered month-specific sheets and rejects invalid months", () => {
    expect(monthlySheetNames(9)).toEqual(["LAP KEU", "BERSIH", "SEPTEMBER", "RC SEPTEMBER", "RP SEPTEMBER", "PENGELUARAN BELANJA", "PIUTANG & HUTANG"]);
    expect(monthlySheetNames(8)[2]).toBe("AGUSTUS");
    expect(() => monthlySheetNames(0)).toThrow();
    expect(() => monthlySheetNames(13)).toThrow();
    expect(() => monthlySheetNames(1.5)).toThrow();
    const wb = buildMonthlyWorkbook(report());
    expect(wb.SheetNames).toEqual(monthlySheetNames(9));
    expect(wb.SheetNames.join(" ")).not.toMatch(/NON TELADAN|GAJI/);
  });

  it("keeps capital editable and incomplete balances blank while guarding dependent formulas", () => {
    const ws = buildMonthlyWorkbook(report()).Sheets["LAP KEU"];
    expect(ws.D8.v).toBe("");
    expect(ws.D8.f).toBeUndefined();
    expect(ws.D8.c?.[0].t).toContain("Isi modal awal");
    expect(ws.D17.v).toBe("");
    expect(ws.D17.c?.[0].t).toContain("Belum tersedia");
    expect(ws.F11.f).toContain("ISNUMBER(D8)");
    expect(ws.F11.v).toBe("");
    expect(ws.G21.v).toBe("");
    expect(ws.D32.v).toBe("");
    expect(ws.G29.f).toBe("E24-E26");
    expect(ws.G29.v).toBe(214);
    expect(ws["!protect"]).toBeUndefined();
  });

  it("links details and summaries with numeric caches and exposes unclassified receipts", () => {
    const wb = buildMonthlyWorkbook(report());
    const rc = wb.Sheets["RC SEPTEMBER"];
    expect(rc.H5.v).toBe("Perlu pemetaan");
    expect(rc.I7.f).toBe("SUM(B7:H7)");
    expect(rc.I7.v).toBe(287.25);
    expect(rc.A7.c?.[0].t).toContain("INV-CONTOH");
    const net = wb.Sheets.BERSIH;
    expect(net.F24.v).toBe(299.6);
    expect(net.F25.v).toBe(85.6);
    expect(net.F27.v).toBe(214);
    expect(net.F32.v).toBe(90.75);
    expect(net.F34.v).toBe("");
    const daily = wb.Sheets.SEPTEMBER;
    expect(daily.A9.z).toBe("dd/mm/yyyy");
    expect(daily.B9.f).toContain("SUMIF");
    expect(daily.B9.v).toBe(100);
    expect(daily.K9.v).toBe(30.1);
    expect(daily.L9.v).toBe(40);
    expect(daily.B10.v).toBe(0);
    expect(daily.F38.v).toBe(12.35);
    expect(daily.H38.v).toBe(15.5);
    expect(daily["!ref"]).not.toContain("1890");
  });

  it("retains salary expense, counts purchases once, and keeps input-like text as strings", () => {
    const wb = buildMonthlyWorkbook(report());
    const expense = wb.Sheets["RP SEPTEMBER"];
    expect(expense.B7.t).toBe("s");
    expect(expense.B7.f).toBeUndefined();
    expect(expense.B7.v).toContain("=HYPERLINK");
    expect(expense.E8.v).toBe(40);
    expect(expense.D8.v).toBe(0);
    expect(expense.F8.v).toBe(40);
    expect(wb.Sheets.BERSIH.F25.v).toBe(85.6);
  });

  it("handles empty months and current months without phantom rows or absent totals", () => {
    const data = { ...report(), to: "2026-09-04", income: [], expenses: [], receivables: [], warnings: [] };
    const wb = buildMonthlyWorkbook(data);
    expect(wb.Sheets.BERSIH.F24.v).toBe(0);
    expect(wb.Sheets.BERSIH.F25.v).toBe(0);
    expect(wb.Sheets.SEPTEMBER.A12.v).toBeTypeOf("number");
    expect(wb.Sheets.SEPTEMBER.A13.v).toBe("TOTAL");
    expect(wb.Sheets["LAP KEU"].D9.v).toBe(0);
  });

  it("keeps long invoice descriptions visible and repeats neutral purchase headings", () => {
    const data = report();
    data.receivables[0].description = "Pekerjaan cetak dengan spesifikasi dan daftar produk yang panjang. ".repeat(8);
    const wb = buildMonthlyWorkbook(data);
    expect(wb.Sheets["PIUTANG & HUTANG"]["!rows"]?.[6].hpt).toBeGreaterThan(100);
    const purchasePrint = wb.Workbook?.Names?.find(name => name.Sheet === 5 && name.Name === "_xlnm.Print_Titles");
    expect(purchasePrint?.Ref).toBe("'PENGELUARAN BELANJA'!$1:$5");
    expect(wb.Sheets["PENGELUARAN BELANJA"].A5.v).toBe("No");
  });

  it("provides explicit light backgrounds for empty and numeric report cells", () => {
    const wb = buildMonthlyWorkbook(report());
    expect(wb.Sheets["LAP KEU"].A1.s.fill.fgColor.rgb).toBe("FFFFFF");
    expect(wb.Sheets.SEPTEMBER.B9.s.fill.fgColor.rgb).toBe("FFFFFF");
  });

  it("serializes real XLSX formulas, stable print ranges, frozen headers and auto recalculation", () => {
    const bytes = serializeMonthlyWorkbook(report());
    const wb = XLSX.read(bytes, { type: "array", cellFormula: true, cellNF: true });
    expect(wb.SheetNames).toEqual(monthlySheetNames(9));
    expect(wb.Sheets["LAP KEU"].D8.v ?? "").toBe("");
    expect(wb.Sheets.BERSIH.F27.v).toBe(214);
    expect(wb.Sheets.BERSIH.F27.f).toBe("F24-F25");
    const xml = archiveText(bytes, "xl/worksheets/sheet3.xml");
    expect(xml).toContain('state="frozen"');
    expect(xml).toContain('topLeftCell="B9"');
    expect(xml).toContain('showGridLines="0"');
    expect(xml).toContain('orientation="landscape"');
    expect(xml).toContain('fitToHeight="0"');
    expect(xml).toContain('fitToWidth="1"');
    expect(xml.indexOf("<headerFooter>")).toBeLessThan(xml.indexOf("<ignoredErrors>"));
    const commentedXml = archiveText(bytes, "xl/worksheets/sheet1.xml");
    expect(commentedXml.indexOf("<headerFooter>")).toBeLessThan(commentedXml.indexOf("<legacyDrawing"));
    const workbook = archiveText(bytes, "xl/workbook.xml");
    expect(workbook).toContain('fullCalcOnLoad="1"');
    expect(workbook).toContain('_xlnm.Print_Area');
    expect(workbook).toContain('_xlnm.Print_Titles');
    expect(workbook).not.toContain("#REF!");
    expect(archiveText(bytes, "xl/worksheets/sheet5.xml")).not.toContain("<f>HYPERLINK");
  });
});
