import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx-js-style";
import { buildMonthlyWorkbook, serializeMonthlyWorkbook } from "../monthly-workbook";
import type { MonthlyFinancialReport } from "../monthly-report-types";

function report(): MonthlyFinancialReport {
  return {
    year: 2026, month: 9, from: "2026-09-01", to: "2026-09-30",
    income: [], expenses: [],
    receivables: [{ id: "r", date: "2026-09-01", dueDate: null, reference: "R", description: "Contoh", customer: "Pelanggan", amount: 150 }],
    openingInventoryBalance: 1000,
    inventoryBalance: 375,
    supplierDebtBalance: 120.5,
    supplierDebts: [{ id: "d", date: "2026-09-02", dueDate: null, supplier: "Pemasok", note: null, amount: 120.5 }],
    warnings: [],
  };
}

describe("automatic monthly balances", () => {
  it("populates balances and caches the screenshot's arithmetic", () => {
    const workbook = buildMonthlyWorkbook(report());
    const overview = workbook.Sheets["LAP KEU"];
    const debts = workbook.Sheets["PIUTANG & HUTANG"];
    expect(overview.D8.v).toBe(1000);
    expect(overview.D9.v).toBe(150);
    expect(overview.F11.v).toBe(1150);
    expect(overview.F15.v).toBe(120.5);
    expect(overview.F19.v).toBe(375);
    expect(overview.G21.f).toBe('IF(COUNT(F11,F15,F19)=3,F11-F15-F19,"")');
    expect(overview.G21.v).toBe(654.5);
    expect(debts.D14.v).toBe(120.5);
    expect(debts.E14.v).toBe("Pemasok");
    expect(debts.G16.v).toBe(120.5);
  });

  it("keeps an unavailable opening or closing value distinct from zero", () => {
    for (const missing of ["openingInventoryBalance", "inventoryBalance"] as const) {
      const data = report();
      data[missing] = null;
      const overview = buildMonthlyWorkbook(data).Sheets["LAP KEU"];
      expect(overview[missing === "openingInventoryBalance" ? "D8" : "D17"].v).toBe("");
      expect(overview.G21.v).toBe("");
      expect(overview.D32.v).toBe("");
    }
  });

  it("treats a recorded zero debt and zero inventory as valid numbers", () => {
    const data = report();
    data.openingInventoryBalance = 0;
    data.inventoryBalance = 0;
    data.supplierDebtBalance = 0;
    data.supplierDebts = [];
    const workbook = buildMonthlyWorkbook(data);
    expect(workbook.Sheets["LAP KEU"].F11.v).toBe(150);
    expect(workbook.Sheets["LAP KEU"].F15.v).toBe(0);
    expect(workbook.Sheets["LAP KEU"].F19.v).toBe(0);
    expect(workbook.Sheets["LAP KEU"].G21.v).toBe(150);
    expect(workbook.Sheets["PIUTANG & HUTANG"].G16.v).toBe(0);
  });

  it("preserves the calculated values and formula when written to an Excel file", () => {
    const bytes = serializeMonthlyWorkbook(report());
    const workbook = XLSX.read(bytes, { type: "array", cellFormula: true });
    expect(workbook.Sheets["LAP KEU"].G21.v).toBe(654.5);
    expect(workbook.Sheets["LAP KEU"].G21.f).toContain("F11-F15-F19");
    expect(workbook.Sheets["PIUTANG & HUTANG"].D14.v).toBe(120.5);
  });
});
