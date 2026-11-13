import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("KPI pengeluaran pada Laporan Keuangan", () => {
  it("declares the Piutang card conditionally alongside the six standard KPI cards", () => {
    const content = readFileSync(
      join(process.cwd(), "app/(main)/financial-report/page.tsx"),
      "utf8",
    );

    expect(content).toContain('label="Pengeluaran"');
    expect(content).not.toContain('label="Laba Bersih (Estimasi)"');
    expect(content).not.toContain('label="Margin"');
    expect(content.match(/<KpiCard\s/g)).toHaveLength(7);
    for (const label of ["Omzet", "Terkumpul", "Laba Kotor", "Outstanding DP", "Loss Stok"]) {
      expect(content).toContain(`label="${label}"`);
    }
    expect(content).toContain("summary?.expenseTotal");
    expect(content).toContain("incompleteExpenseCount");
    expect(content).toContain("Harga modal tidak tersedia saat approval");
    expect(content).toContain('label="Piutang"');
    expect(content).toContain("report?.summary.receivableBalance !== undefined");
    expect(content).toContain("Sisa transaksi berstatus DP. Tidak termasuk Tempo atau Piutang Manual.");
  });

  it("requests the Owner's Sales preview with the effective Sales view", () => {
    const page = readFileSync(
      join(process.cwd(), "app/(main)/financial-report/page.tsx"),
      "utf8",
    );
    const hook = readFileSync(
      join(process.cwd(), "features/financial-report/hooks/useFinancialReport.ts"),
      "utf8",
    );

    expect(page).toContain(
      "fullReportPreview={<FullFinancialReport previewSales />}",
    );
    expect(hook).toContain(
      'if (params.view === "sales") searchParams.set("view", "sales");',
    );
  });
});
