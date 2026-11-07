import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("KPI pengeluaran pada Laporan Keuangan", () => {
  it("keeps six KPI cards without estimated net profit and margin, with a missing-cost warning", () => {
    const content = readFileSync(
      join(process.cwd(), "app/(main)/financial-report/page.tsx"),
      "utf8",
    );

    expect(content).toContain('label="Pengeluaran"');
    expect(content).not.toContain('label="Laba Bersih (Estimasi)"');
    expect(content).not.toContain('label="Margin"');
    expect(content.match(/<KpiCard\s/g)).toHaveLength(6);
    for (const label of ["Omzet", "Terkumpul", "Laba Kotor", "Outstanding DP", "Loss Stok"]) {
      expect(content).toContain(`label="${label}"`);
    }
    expect(content).toContain("summary?.expenseTotal");
    expect(content).toContain("incompleteExpenseCount");
    expect(content).toContain("Harga modal tidak tersedia saat approval");
  });
});
