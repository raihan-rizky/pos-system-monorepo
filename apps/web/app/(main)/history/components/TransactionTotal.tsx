import type { Transaction } from "@/hooks/useTransactions";
import { formatRupiah } from "@/lib/utils";

export function TransactionTotal({ transaction }: { transaction: Transaction }) {
  const total = Number(transaction.total);
  const showDP = transaction.status === "DP" && transaction.paymentMethod !== "TEMPO";

  return (
    <div className="min-w-0 tabular-nums">
      {showDP && (
        <div className="mb-0.5 text-xs font-normal text-surface-500">Total transaksi</div>
      )}
      <div>{formatRupiah(total)}</div>
      {showDP && (
        <dl aria-label="Rincian pembayaran DP" className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-normal leading-relaxed text-surface-600">
          <div className="inline-flex flex-wrap items-baseline gap-x-1">
            <dt>DP masuk</dt>
            <dd className="font-semibold text-surface-700">{formatRupiah(Number(transaction.amountPaid))}</dd>
          </div>
          <div className="inline-flex flex-wrap items-baseline gap-x-1 text-amber-700">
            <dt>Sisa</dt>
            <dd className="font-semibold">{formatRupiah(Math.max(0, total - Number(transaction.amountPaid)))}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
