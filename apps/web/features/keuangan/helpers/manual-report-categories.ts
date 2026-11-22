export const MANUAL_RECEIPT_REPORT_CATEGORIES = [
  "CETAK", "PLAT", "STEMPEL", "SPANDUK", "ATK", "PRINT",
] as const;

export const MANUAL_EXPENSE_REPORT_CATEGORIES = [
  "CETAK_PLAT", "SPANDUK", "ATK", "SALARY",
] as const;

export type ManualReceiptReportCategory = (typeof MANUAL_RECEIPT_REPORT_CATEGORIES)[number];
export type ManualExpenseReportCategory = (typeof MANUAL_EXPENSE_REPORT_CATEGORIES)[number];

export const MANUAL_RECEIPT_REPORT_LABELS: Record<ManualReceiptReportCategory, string> = {
  CETAK: "Cetak", PLAT: "Plat", STEMPEL: "Stempel", SPANDUK: "Spanduk", ATK: "ATK", PRINT: "Print",
};

export const MANUAL_EXPENSE_REPORT_LABELS: Record<ManualExpenseReportCategory, string> = {
  CETAK_PLAT: "Cetak / Plat", SPANDUK: "Spanduk", ATK: "ATK", SALARY: "Gaji / Mingguan",
};

export function isManualReceiptReportCategory(value: unknown): value is ManualReceiptReportCategory {
  return typeof value === "string" && (MANUAL_RECEIPT_REPORT_CATEGORIES as readonly string[]).includes(value);
}

export function isManualExpenseReportCategory(value: unknown): value is ManualExpenseReportCategory {
  return typeof value === "string" && (MANUAL_EXPENSE_REPORT_CATEGORIES as readonly string[]).includes(value);
}
