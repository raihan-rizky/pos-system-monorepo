import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as XLSX from "xlsx-js-style";
import { describe, expect, it } from "vitest";
import { serializeMonthlyWorkbook } from "../helpers/monthly-workbook";
import type { MonthlyFinancialReport } from "../helpers/monthly-report-types";

describe.skipIf(process.env.FINANCE_EXCEL_TEST !== "1")("recalculation in desktop Excel", () => {
  it("recalculates scheduled and paid giro separately and keeps incomplete balances blank", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "giro-excel-test-"));
    const known = path.join(dir, "known.xlsx");
    const unknown = path.join(dir, "unknown.xlsx");
    const input: MonthlyFinancialReport = {
      year: 2026, month: 11, from: "2026-11-01", to: "2026-11-30",
      income: [{ id: "sale", date: "2026-11-01", reference: "I-1", description: "Penjualan", amounts: { CETAK: 200000, PLAT: 0, STEMPEL: 0, SPANDUK: 0, ATK: 0, PRINT: 0, UNMAPPED: 0 } }],
      expenses: [{ id: "manual", date: "2026-11-01", description: "Manual", categoryName: "Kemasan", amount: 10000, group: "OTHER" }],
      purchaseExpenses: [
        { id: "giro", date: "2026-11-15", description: "Giro", amount: 100000, group: "OTHER", purchase: { reference: "PB-1", method: "GIRO", dueDate: "2026-11-15", supplier: "A" } },
        { id: "transfer", date: "2026-11-05", description: "Transfer", amount: 5000, group: "OTHER", purchase: { reference: "PB-2", method: "TRANSFER", dueDate: null, supplier: "B" } },
      ],
      giroPayments: [{ id: "payment", date: "2026-11-10", amount: 30000, reference: "PB-1", supplier: "A", group: "OTHER" }],
      cashIncomplete: false, receivables: [], openingInventoryBalance: 100000, inventoryBalance: 50000, supplierDebtBalance: 70000,
      supplierDebts: [{ id: "debt", date: "2026-10-01", dueDate: "2026-11-15", supplier: "A", note: "Giro PB-1", amount: 70000 }], warnings: [],
    };
    try {
      writeFileSync(known, serializeMonthlyWorkbook(input));
      writeFileSync(unknown, serializeMonthlyWorkbook({ ...input, cashIncomplete: true, supplierDebtBalance: null }));
      const script = `$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject Excel.Application
try {
  $app.Visible = $false
  $app.DisplayAlerts = $false
  foreach ($filePath in @($env:GIRO_EXCEL_KNOWN, $env:GIRO_EXCEL_UNKNOWN)) {
    $book = $app.Workbooks.Open($filePath, 0, $false)
    try { $app.CalculateFullRebuild(); $book.Save() } finally { $book.Close($false) }
  }
} finally { $app.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($app) }
`;
      const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { encoding: "utf8", timeout: 60000, env: { ...process.env, GIRO_EXCEL_KNOWN: known, GIRO_EXCEL_UNKNOWN: unknown } });
      expect(result.error?.message).toBeUndefined();
      expect(result.status, result.stderr || result.stdout).toBe(0);
      const complete = XLSX.readFile(known, { cellFormula: true });
      expect(complete.Sheets["RP NOVEMBER"].G7.v).toBe("Kemasan");
      expect(complete.Sheets.NOVEMBER.K9.v).toBe(10000);
      expect(complete.Sheets.NOVEMBER.K18.v).toBe(30000);
      expect(complete.Sheets.BERSIH.F25.v).toBe(45000);
      expect(complete.Sheets.BERSIH.F27.v).toBe(155000);
      expect(complete.Sheets["LAP KEU"].G29.v).toBe(155000);
      expect(complete.Sheets["LAP KEU"].D13.v).toBe(70000);
      const incomplete = XLSX.readFile(unknown, { cellFormula: true });
      expect(incomplete.Sheets.BERSIH.F25?.v ?? "").toBe("");
      expect(incomplete.Sheets.BERSIH.F27?.v ?? "").toBe("");
      expect(incomplete.Sheets["LAP KEU"].D13?.v ?? "").toBe("");
      expect(incomplete.Sheets["LAP KEU"].G29?.v ?? "").toBe("");
    } finally {
      for (const file of [known, unknown]) { try { unlinkSync(file); } catch { /* already absent */ } }
      rmdirSync(dir);
    }
  }, 75000);
});
