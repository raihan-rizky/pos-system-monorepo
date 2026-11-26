import { formatRupiahPrecise } from "@/lib/utils";
import type { DailyIncomeResponse } from "./daily-income";
import type { ExportInput, ReportPdfPageMode } from "./journal-export";
import { buildReportBreakdownTables, type FinancialReportResponse } from "./report-breakdowns";

type AmountRow = [name: string, amount: string];

export type DailyReportDocument = {
  dateLabel: string;
  journal: ExportInput & { details: NonNullable<ExportInput["details"]> };
};

function amountRow(name: string, amount: number): AmountRow {
  return [name, formatRupiahPrecise(amount)];
}

export function buildDailyReportDocument(
  date: string,
  income: DailyIncomeResponse | undefined,
  financial: FinancialReportResponse | undefined,
  journal: ExportInput | undefined,
  pageMode: ReportPdfPageMode,
  { canReadExpenses, canReadProfit }: { canReadExpenses: boolean; canReadProfit: boolean },
): DailyReportDocument | undefined {
  if (income?.date !== date || income.total === undefined || financial?.dateFrom !== date || financial.dateTo !== date
    || journal?.from !== date || journal.to !== date || (pageMode === "single" && !financial.summaryCatalog)) {
    return undefined;
  }

  const totalPengeluaran = canReadExpenses ? -financial.summary.expenseTotal : 0;
  return {
    dateLabel: new Intl.DateTimeFormat("id-ID", {
      dateStyle: "full",
      timeZone: "Asia/Jakarta",
    }).format(new Date(date + "T00:00:00+07:00")) + " WIB",
    journal: {
      ...journal,
      period: "daily",
      rows: canReadExpenses ? journal.rows : journal.rows.filter(row => row.status !== "Pengeluaran"),
      footer: {
        ...journal.footer,
        totalPemasukan: income.total,
        totalPengeluaran,
        grandTotal: income.total + totalPengeluaran,
      },
      details: {
        showExpenseTotals: canReadExpenses,
        note: "Total pemasukan memakai uang yang diterima pada tanggal pilihan.",
        tables: [
          {
            title: "Ringkasan Penjualan",
            headers: ["Rincian", "Nominal"],
            rows: [
              amountRow("Omzet", financial.summary.revenue),
              ...(canReadProfit ? [amountRow("Laba Kotor", financial.summary.grossProfit)] : []),
            ],
          },
          ...buildReportBreakdownTables(financial, income.paymentMethods ?? [], pageMode === "single" ? financial.summaryCatalog : undefined),
        ],
      },
    },
  };
}
