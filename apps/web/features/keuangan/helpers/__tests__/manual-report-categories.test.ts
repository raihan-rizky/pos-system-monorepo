import { describe, expect, it } from "vitest";
import { isManualExpenseReportCategory, isManualReceiptReportCategory } from "../manual-report-categories";

describe("manual finance report categories", () => {
  it.each(["CETAK", "PLAT", "STEMPEL", "SPANDUK", "ATK", "PRINT"])("accepts receipt category %s", (category) => {
    expect(isManualReceiptReportCategory(category)).toBe(true);
  });

  it.each(["CETAK_PLAT", "SPANDUK", "ATK", "SALARY"])("accepts expense category %s", (category) => {
    expect(isManualExpenseReportCategory(category)).toBe(true);
  });

  it.each(["", "UNMAPPED", "OTHER", "atk", null, undefined, 1])("rejects an invalid category %s", (category) => {
    expect(isManualReceiptReportCategory(category)).toBe(false);
    expect(isManualExpenseReportCategory(category)).toBe(false);
  });
});
