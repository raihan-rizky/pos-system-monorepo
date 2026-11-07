import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx-js-style";
import { buildMonthlyWorkbook, serializeMonthlyWorkbook } from "../monthly-workbook";
import type { MonthlyFinancialReport } from "../monthly-report-types";

function report(overrides: Record<string, unknown> = {}): MonthlyFinancialReport {
  return {
    year: 2026, month: 11, from: "2026-11-01", to: "2026-11-30",
    income: [{ id: "income", date: "2026-11-01", reference: "I-1", description: "Penjualan", amounts: { CETAK: 200_000, PLAT: 0, STEMPEL: 0, SPANDUK: 0, ATK: 0, PRINT: 0, UNMAPPED: 0 } }],
    expenses: [{ id: "manual", date: "2026-11-01", description: "Pengeluaran manual", amount: 10_000, group: "OTHER" }],
    purchaseExpenses: [
      { id: "giro", date: "2026-11-15", description: "Belanja giro", amount: 100_000, group: "OTHER", purchase: { reference: "PB-1", method: "GIRO", dueDate: "2026-11-15", supplier: "Pemasok A" } },
      { id: "transfer", date: "2026-11-05", description: "Belanja transfer", amount: 5_000, group: "OTHER", purchase: { reference: "PB-2", method: "TRANSFER", dueDate: null, supplier: "Pemasok B" } },
    ],
    giroPayments: [{ id: "payment", date: "2026-11-10", amount: 30_000, reference: "PB-1", supplier: "Pemasok A", group: "OTHER" }],
    cashIncomplete: false,
    receivables: [], inventoryBalance: null, openingInventoryBalance: null,
    supplierDebtBalance: 70_000,
    supplierDebts: [{ id: "debt", date: "2026-10-15", dueDate: "2026-11-15", supplier: "Pemasok A", note: "Giro PB-1", amount: 70_000 }],
    warnings: [], ...overrides,
  } as unknown as MonthlyFinancialReport;
}

function values(sheet: XLSX.WorkSheet): unknown[] {
  return Object.entries(sheet).filter(([key]) => !key.startsWith("!")).map(([, cell]) => cell.v);
}

describe("workbook payments and giro schedules", () => {
  it("explains unavailable HPP history without asking for base-unit repairs", () => {
    const overview = buildMonthlyWorkbook(report()).Sheets["LAP KEU"];
    for (const cell of [overview.D8, overview.D17]) {
      expect(cell.c?.[0]?.t).toContain("HPP");
      expect(cell.c?.[0]?.t).toContain("riwayat");
      expect(cell.c?.[0]?.t).not.toContain("periksa satuan dasar");
      expect(cell.v ?? "").toBe("");
    }
  });

  it("keeps RP manual, shows the giro schedule and debt, and counts only real cash", () => {
    const workbook = buildMonthlyWorkbook(report());
    const rp = workbook.Sheets["RP NOVEMBER"];
    expect(values(rp)).toContain("Pengeluaran manual");
    expect(values(rp)).not.toContain("Belanja giro");
    expect(values(rp)).not.toContain("Belanja transfer");
    const purchases = workbook.Sheets["PENGELUARAN BELANJA"];
    expect(values(purchases)).toContain(100_000);
    expect(values(purchases)).toContain(30_000);
    expect(values(workbook.Sheets["PIUTANG & HUTANG"])).toContain(70_000);
    expect(workbook.Sheets.NOVEMBER.K18.v).toBe(30_000);
    expect(workbook.Sheets.BERSIH.F25.v).toBe(45_000);
    expect(workbook.Sheets.BERSIH.F27.v).toBe(155_000);
    expect(workbook.Sheets["LAP KEU"].G29.v).toBe(155_000);
  });

  it("leaves affected totals unavailable when a giro history is unknown even after serialization", () => {
    const input = report({ cashIncomplete: true, supplierDebtBalance: null });
    const wb = XLSX.read(serializeMonthlyWorkbook(input), { type: "array", cellFormula: true });
    expect(wb.Sheets.BERSIH.F25?.v ?? "").toBe("");
    expect(wb.Sheets.BERSIH.F27?.v ?? "").toBe("");
    expect(wb.Sheets["LAP KEU"].G29?.v ?? "").toBe("");
    expect(wb.Sheets["LAP KEU"].D13?.v ?? "").toBe("");
    expect(wb.Sheets["PIUTANG & HUTANG"].G16?.f ?? "").not.toContain("SUM(");
    expect(values(wb.Sheets["PENGELUARAN BELANJA"]).join(" ")).toMatch(/belum lengkap|belum diketahui/i);
  });

  it("counts an early payment even if its scheduled giro is in another month", () => {
    const wb = buildMonthlyWorkbook(report({ purchaseExpenses: [], giroPayments: [{ id: "early", date: "2026-11-10", amount: 30_000, reference: "PB-1", supplier: "Pemasok A", group: "OTHER" }] }));
    expect(wb.Sheets.NOVEMBER.K18.v).toBe(30_000);
    expect(wb.Sheets.BERSIH.F25.v).toBe(40_000);
  });

  it("uses actual correction payments for cash while keeping the corrected purchase value", () => {
    const wb = buildMonthlyWorkbook(report({
      purchaseExpenses: [{ id: "transfer", date: "2026-11-05", description: "Belanja terkoreksi", amount: 70_000, group: "OTHER", purchase: { reference: "PB-2", method: "TRANSFER", dueDate: null, supplier: "Pemasok B" } }],
      giroPayments: [],
      purchasePayments: [{ id: "original-transfer", date: "2026-11-05", amount: 100_000, method: "TRANSFER", reference: "PB-2", supplier: "Pemasok B", group: "OTHER" }],
    }));
    expect(values(wb.Sheets["PENGELUARAN BELANJA"])).toContain(70_000);
    expect(wb.Sheets.NOVEMBER.K13.v).toBe(100_000);
    expect(wb.Sheets.BERSIH.F25.v).toBe(110_000);
  });
});
