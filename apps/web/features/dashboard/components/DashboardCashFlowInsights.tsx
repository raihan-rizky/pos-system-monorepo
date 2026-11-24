import { ChartPie, ReceiptText } from "lucide-react";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import type { CashFlowSummary } from "@/features/keuangan/hooks/useKeuangan";
import { formatRupiahPrecise } from "@/lib/utils";

const percent = new Intl.NumberFormat("id-ID", { style: "percent", maximumFractionDigits: 1 });

function formatShare(amount: number, total: number) {
  const share = amount / total;
  return share > 0 && share < 0.001 ? "<0,1%" : percent.format(share);
}

export function DashboardCashFlowInsights({ summary }: { summary: CashFlowSummary }) {
  const { income, expense } = summary;
  if (expense.incomplete || expense.total === null || expense.total <= 0) return null;

  const { manual, transfer, manualPayable, giroPayment, giroDue, overpayment } = expense.components;
  const ranked: Array<[label: string, amount: number]> = [
    ["Giro jatuh tempo", Math.round((giroPayment + giroDue) * 100) / 100],
    ["Belanja transfer", transfer],
    ["Pengeluaran manual", manual],
    ["Pembayaran hutang manual", manualPayable ?? 0],
    ["Kelebihan pembayaran", overpayment],
    ["Pembayaran pembelian yang dibatalkan", expense.correctionOutflow ?? 0],
  ];
  ranked.sort((left, right) => right[1] - left[1]);
  const [label, amount] = ranked[0];
  const expenseShare = income.total > 0 ? formatShare(expense.total, income.total) : null;

  return (
    <section aria-label="Insight arus kas" className="mt-3 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-3 sm:px-4">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {expenseShare !== null && (
          <div className="min-w-0">
            <dt className="flex items-center gap-2 text-xs font-medium text-surface-600">
              <ChartPie className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
              Beban pengeluaran
              <InfoTooltip
                title="Beban pengeluaran"
                description={`Total pengeluaran ÷ total pemasukan × 100%. Bulan ini: ${formatRupiahPrecise(expense.total)} ÷ ${formatRupiahPrecise(income.total)} × 100% = ${expenseShare}.`}
              />
            </dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-brand-950">
              {`${expenseShare} dari pemasukan`}
            </dd>
          </div>
        )}
        {amount > 0 && (
          <div className="min-w-0">
            <dt className="flex items-center gap-2 text-xs font-medium text-surface-600">
              <ReceiptText className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
              {amount === ranked[1][1] ? "Salah satu komponen pengeluaran terbesar" : "Komponen pengeluaran terbesar"}
              <InfoTooltip
                title="Komponen pengeluaran terbesar"
                description={`Komponen dipilih dari nominal tertinggi. Porsinya: ${formatRupiahPrecise(amount)} ÷ ${formatRupiahPrecise(expense.total)} × 100% = ${formatShare(amount, expense.total)}. Giro menggabungkan bagian yang dibayar dan sisa tagihan yang sudah jatuh tempo.`}
              />
            </dt>
            <dd className="mt-1 text-sm text-surface-700">
              <span className="font-semibold tabular-nums text-brand-950 [overflow-wrap:anywhere]">
                {`${label} · ${formatRupiahPrecise(amount)}`}
              </span>
              <span className="mt-0.5 block text-xs tabular-nums">{`${formatShare(amount, expense.total)} dari total pengeluaran`}</span>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
