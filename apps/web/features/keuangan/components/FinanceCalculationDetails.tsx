import { formatRupiahPrecise } from "@/lib/utils";

type Income = { total: number; supplierRefund?: number; components: { sales: number; manualIncome: number; manualReceivable: number } | null };
type Expense = { total: number | null; incomplete: boolean; correctionOutflow?: number; components?: {
  manual: number; transfer: number; giroPayment: number; giroDue: number; overpayment: number;
} };

export function FinanceCalculationDetails({ income, expense }: { income?: Income; expense?: Expense }) {
  const net = income && expense?.total != null ? Math.round((income.total - expense.total) * 100) / 100 : null;
  return <details className="mt-3 rounded-xl border border-surface-200 bg-white/80 p-3 text-sm text-surface-700">
    <summary className="cursor-pointer font-semibold text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">Lihat cara perhitungan</summary>
    <div className="mt-3 space-y-4">
      {income && expense && <div className="rounded-lg bg-surface-50 p-3"><p className="font-semibold">Pemasukan − Pengeluaran = Net Cash Flow</p>
        <p className="mt-1 tabular-nums">{formatRupiahPrecise(income.total)} − {expense.total === null ? "Belum tersedia" : formatRupiahPrecise(expense.total)} = {net === null ? "Belum tersedia" : formatRupiahPrecise(net)}</p></div>}
      {income && <div><p className="font-semibold">Pemasukan</p>{income.components ? <dl className="mt-1 space-y-1">
        <div className="flex justify-between gap-4"><dt>Penerimaan penjualan</dt><dd className="tabular-nums">{formatRupiahPrecise(income.components.sales)}</dd></div>
        <div className="flex justify-between gap-4"><dt>Pemasukan manual</dt><dd className="tabular-nums">{formatRupiahPrecise(income.components.manualIncome)}</dd></div>
        <div className="flex justify-between gap-4"><dt>Pelunasan piutang manual</dt><dd className="tabular-nums">{formatRupiahPrecise(income.components.manualReceivable)}</dd></div>
        {Boolean(income.supplierRefund) && <div className="flex justify-between gap-4"><dt>Pengembalian dana pemasok</dt><dd className="tabular-nums">{formatRupiahPrecise(income.supplierRefund!)}</dd></div>}
      </dl> : <p className="mt-1 text-surface-500">Rincian pemasukan belum tersedia.</p>}</div>}
      {expense && <div><p className="font-semibold">Pengeluaran</p>{expense.components ? <dl className="mt-1 space-y-1">
        <div className="flex justify-between gap-4"><dt>Pengeluaran manual setelah kembalian</dt><dd className="tabular-nums">{formatRupiahPrecise(expense.components.manual)}</dd></div>
        <div className="flex justify-between gap-4"><dt>Belanja transfer</dt><dd className="tabular-nums">{formatRupiahPrecise(expense.components.transfer)}</dd></div>
        <div className="flex justify-between gap-4"><dt>Giro jatuh tempo dengan pembayaran tercatat</dt><dd className="tabular-nums">{formatRupiahPrecise(expense.components.giroPayment)}</dd></div>
        <div className="flex justify-between gap-4"><dt>Sisa giro jatuh tempo</dt><dd className="tabular-nums">{formatRupiahPrecise(expense.components.giroDue)}</dd></div>
        <div className="flex justify-between gap-4"><dt>Kelebihan pembayaran belum dikembalikan</dt><dd className="tabular-nums">{formatRupiahPrecise(expense.components.overpayment)}</dd></div>
        {Boolean(expense.correctionOutflow) && <div className="flex justify-between gap-4"><dt>Pembayaran pembelian yang dibatalkan</dt><dd className="tabular-nums">{formatRupiahPrecise(expense.correctionOutflow!)}</dd></div>}
      </dl> : <p className="mt-1 text-surface-500">Rincian pengeluaran belum tersedia.</p>}<p className="mt-2 text-xs text-surface-500">Setiap bagian giro masuk mulai tanggal jatuh temponya (WIB), termasuk yang sudah dibayar lebih awal. Kelebihan pembayaran masuk pada tanggal pembayaran.</p>
        {expense.incomplete && <p role="status" className="mt-2 text-xs text-amber-700">Riwayat pengeluaran belum lengkap. Periksa riwayat giro; nominal di atas hanya bagian yang diketahui.</p>}</div>}
      {expense && <p className="text-xs text-surface-500">Persentase kategori = total kategori ÷ total pengeluaran × 100%.</p>}
    </div>
  </details>;
}
