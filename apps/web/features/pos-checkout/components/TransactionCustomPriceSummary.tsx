import type { Transaction } from "@/hooks/useTransactions";
import { formatRupiah } from "@/lib/utils";
import { TRANSACTION_CUSTOM_PRICE_RULE_ID } from "../helpers/transaction-custom-price";
import { TransactionCustomPriceBadge } from "./TransactionCustomPriceBadge";

export function TransactionCustomPriceSummary({ items }: { items: Transaction["items"] }) {
  const customItems = items.filter(item => item.pricingRuleId === TRANSACTION_CUSTOM_PRICE_RULE_ID);
  if (customItems.length === 0) return null;
  return (
    <section aria-label="Harga custom pada nota" className="print:hidden rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <TransactionCustomPriceBadge />
        <span className="text-xs font-medium text-amber-900">{customItems.length} item pada nota ini</span>
      </div>
      <ul className="mt-3 space-y-3">
        {customItems.map(item => (
          <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
            <span className="min-w-0 break-words font-semibold text-surface-900">{item.productName}</span>
            <span className="text-xs text-surface-600">
              {item.originalUnitPrice != null && <span className="mr-2 line-through decoration-surface-400">{formatRupiah(Number(item.originalUnitPrice))}</span>}
              <span className="font-bold text-amber-900">{formatRupiah(Number(item.unitPrice))}</span> / {item.product?.unit ?? "satuan"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-amber-800">Harga hanya berlaku pada nota ini. Harga produk tetap sama.</p>
    </section>
  );
}
