import { ChevronDown } from "lucide-react";
import { formatRupiahPrecise } from "@/lib/utils";
import { calculateNetCashFlow } from "../helpers/keuangan-core";

type Income = {
  total: number;
  supplierRefund?: number;
  components: { sales: number; manualIncome: number; manualReceivable: number } | null;
};

type Expense = {
  total: number | null;
  incomplete: boolean;
  correctionOutflow?: number;
  components?: {
    manual: number;
    transfer: number;
    giroPayment: number;
    giroDue: number;
    overpayment: number;
    manualPayable?: number;
  };
};

type CalculationRow = [label: string, amount: number];

export function FinanceCalculationDetails({ income, expense, variant = "finance" }: {
  income?: Income;
  expense?: Expense;
  variant?: "finance" | "dashboard";
}) {
  const isDashboard = variant === "dashboard";
  const net = calculateNetCashFlow(income?.total, expense?.total);
  const incomeRows: CalculationRow[] | undefined = income?.components ? [
    ["Penerimaan penjualan", income.components.sales],
    ["Pemasukan manual", income.components.manualIncome],
    ["Pelunasan piutang manual", income.components.manualReceivable],
  ] : undefined;
  if (income?.supplierRefund) incomeRows?.push(["Pengembalian dana pemasok", income.supplierRefund]);

  const expenseRows: CalculationRow[] | undefined = expense?.components ? [
    ["Pengeluaran manual setelah kembalian", expense.components.manual],
    ["Belanja transfer", expense.components.transfer],
    ["Pembayaran hutang manual yang belum terhubung ke transfer", expense.components.manualPayable ?? 0],
    ["Giro jatuh tempo dengan pembayaran tercatat", expense.components.giroPayment],
    ["Sisa giro jatuh tempo", expense.components.giroDue],
    ["Kelebihan pembayaran belum dikembalikan", expense.components.overpayment],
  ] : undefined;
  if (expense?.correctionOutflow) expenseRows?.push(["Pembayaran pembelian yang dibatalkan", expense.correctionOutflow]);

  const rowListClass = isDashboard ? "mt-2 divide-y divide-surface-100" : "mt-1 space-y-1";
  const rowClass = isDashboard ? "grid grid-cols-[minmax(0,1fr)_fit-content(47%)] items-baseline gap-3 py-2.5 [overflow-wrap:anywhere]" : "flex justify-between gap-4";
  const amountClass = isDashboard ? "text-right font-medium tabular-nums text-surface-900" : "tabular-nums";

  return (
    <details className={isDashboard
      ? "group mt-4 rounded-xl border border-surface-200 bg-white text-sm text-surface-700"
      : "mt-3 rounded-xl border border-surface-200 bg-white/80 p-3 text-sm text-surface-700"}
    >
      <summary className={isDashboard
        ? "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 font-semibold text-brand-800 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 [&::-webkit-details-marker]:hidden sm:px-4"
        : "cursor-pointer font-semibold text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"}
      >
        Lihat cara perhitungan
        {isDashboard && <ChevronDown className="h-4 w-4 shrink-0 group-open:rotate-180" aria-hidden="true" />}
      </summary>

      <div className={isDashboard ? "space-y-3 border-t border-surface-200 px-3 py-3 sm:px-4" : "mt-3 space-y-4"}>
        {income && expense && (
          <div className={isDashboard ? "rounded-lg bg-brand-50 px-3 py-2.5 text-brand-950" : "rounded-lg bg-surface-50 p-3"}>
            <p className="font-semibold">Pemasukan − Pengeluaran = {isDashboard ? "Arus Kas Bersih" : "Net Cash Flow"}</p>
            <p className="mt-1 tabular-nums [overflow-wrap:anywhere]">
              {formatRupiahPrecise(income.total)} − {expense.total === null ? "Belum tersedia" : formatRupiahPrecise(expense.total)} = {net === null ? "Belum tersedia" : formatRupiahPrecise(net)}
            </p>
          </div>
        )}
        <div className={isDashboard ? "grid gap-3 md:grid-cols-2" : "space-y-4"}>
          {income && (
            <div className={isDashboard ? "min-w-0 rounded-lg border border-surface-200 px-3 py-3" : undefined}>
              <p className={isDashboard ? "font-semibold text-emerald-800" : "font-semibold"}>Pemasukan</p>
              {incomeRows ? (
                <dl className={rowListClass}>
                  {incomeRows.map(([label, amount]) => (
                    <div key={label} className={rowClass}>
                      <dt>{label}</dt>
                      <dd className={amountClass}>{formatRupiahPrecise(amount)}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="mt-1 text-surface-500">Rincian pemasukan belum tersedia.</p>}
            </div>
          )}
          {expense && (
            <div className={isDashboard ? "min-w-0 rounded-lg border border-surface-200 px-3 py-3" : undefined}>
              <p className={isDashboard ? "font-semibold text-red-800" : "font-semibold"}>Pengeluaran</p>
              {expenseRows ? (
                <dl className={rowListClass}>
                  {expenseRows.map(([label, amount]) => (
                    <div key={label} className={rowClass}>
                      <dt>{label}</dt>
                      <dd className={amountClass}>{formatRupiahPrecise(amount)}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="mt-1 text-surface-500">Rincian pengeluaran belum tersedia.</p>}
              <p className={isDashboard ? "mt-2 border-t border-surface-100 pt-2.5 text-xs leading-relaxed text-surface-600" : "mt-2 text-xs text-surface-500"}>
                Setiap bagian giro masuk mulai tanggal jatuh temponya (WIB), termasuk yang sudah dibayar lebih awal. Kelebihan pembayaran masuk pada tanggal pembayaran.
              </p>
              {expense.incomplete && !isDashboard && (
                <p role="status" className="mt-2 text-xs text-amber-700">Riwayat pengeluaran belum lengkap. Periksa riwayat giro; nominal di atas hanya bagian yang diketahui.</p>
              )}
            </div>
          )}
        </div>
        {expense && !isDashboard && <p className="text-xs text-surface-500">Persentase kategori = total kategori ÷ total pengeluaran × 100%.</p>}
      </div>
    </details>
  );
}
