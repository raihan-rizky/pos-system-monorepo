import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("KPI pengeluaran pada Laporan Keuangan", () => {
  it("renders expense and estimated net profit with a visible missing-cost warning", () => {
    const content = readFileSync(
      join(process.cwd(), "app/(main)/financial-report/page.tsx"),
      "utf8",
    );

    expect(content).toContain('label="Pengeluaran"');
    expect(content).toContain('label="Laba Bersih (Estimasi)"');
    expect(content).toContain("summary?.expenseTotal");
    expect(content).toContain("summary?.estimatedNetProfit");
    expect(content).toContain("incompleteExpenseCount");
    expect(content).toContain("Harga modal tidak tersedia saat approval");
  });
});
