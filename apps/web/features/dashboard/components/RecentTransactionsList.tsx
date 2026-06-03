"use client";

import React from "react";
import { CheckCircle2, Clock, Hourglass, XCircle, Undo2 } from "lucide-react";
import { formatRupiah, formatDate } from "@/lib/utils";
import type { Transaction } from "@/hooks/useTransactions";

interface RecentTransactionsProps {
  transactions: Transaction[];
  loading?: boolean;
  onSelect?: (tx: Transaction) => void;
  maxRows?: number;
}

const STATUS_META: Record<
  string,
  { label: string; tone: string; icon: React.ReactNode }
> = {
  COMPLETED: {
    label: "Lunas",
    tone: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    icon: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />,
  },
  DP: {
    label: "DP",
    tone: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
    icon: <Hourglass className="h-3 w-3" aria-hidden="true" />,
  },
  PENDING_APPROVAL: {
    label: "Pending",
    tone: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
    icon: <Clock className="h-3 w-3" aria-hidden="true" />,
  },
  VOIDED: {
    label: "Void",
    tone: "bg-surface-100 text-surface-600 ring-1 ring-surface-200",
    icon: <XCircle className="h-3 w-3" aria-hidden="true" />,
  },
  REFUNDED: {
    label: "Refund",
    tone: "bg-red-50 text-red-700 ring-1 ring-red-100",
    icon: <Undo2 className="h-3 w-3" aria-hidden="true" />,
  },
};

function statusMeta(status: string) {
  return (
    STATUS_META[status] ?? {
      label: status,
      tone: "bg-surface-100 text-surface-700 ring-1 ring-surface-200",
      icon: null,
    }
  );
}

export const RecentTransactionsList: React.FC<RecentTransactionsProps> =
  React.memo(function RecentTransactionsList({
    transactions,
    loading,
    onSelect,
    maxRows = 6,
  }) {
    if (loading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: maxRows }).map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-lg bg-surface-50 animate-pulse"
            />
          ))}
        </div>
      );
    }

    if (!transactions || transactions.length === 0) {
      return (
        <p className="text-sm text-surface-500 text-center py-8">
          Belum ada transaksi.
        </p>
      );
    }

    const visible = transactions.slice(0, maxRows);

    return (
      <div className="w-full">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th
                  scope="col"
                  className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-surface-500"
                >
                  Invoice
                </th>
                <th
                  scope="col"
                  className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-surface-500"
                >
                  Pelanggan
                </th>
                <th
                  scope="col"
                  className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-surface-500"
                >
                  Tanggal
                </th>
                <th
                  scope="col"
                  className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-surface-500"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-5 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-surface-500"
                >
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {visible.map((tx) => {
                const meta = statusMeta(tx.status);
                const interactive = Boolean(onSelect);
                return (
                  <tr
                    key={tx.id}
                    className={`transition-colors duration-150 ${
                      interactive
                        ? "cursor-pointer hover:bg-surface-50 focus-within:bg-surface-50"
                        : ""
                    }`}
                    onClick={interactive ? () => onSelect?.(tx) : undefined}
                    onKeyDown={
                      interactive
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onSelect?.(tx);
                            }
                          }
                        : undefined
                    }
                    tabIndex={interactive ? 0 : undefined}
                    role={interactive ? "button" : undefined}
                  >
                    <td className="px-5 py-3 font-mono text-xs font-bold text-brand-700 whitespace-nowrap">
                      {tx.invoiceNumber}
                    </td>
                    <td className="px-5 py-3 text-surface-700 truncate max-w-[160px]">
                      {tx.customerName || (
                        <span className="italic text-surface-400">Walk-in</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-surface-500 whitespace-nowrap">
                      {formatDate(new Date(tx.createdAt))}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${meta.tone}`}
                      >
                        {meta.icon}
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-surface-900 tabular-nums whitespace-nowrap">
                      {formatRupiah(Number(tx.total))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="flex flex-col gap-3 md:hidden">
          {visible.map((tx) => {
            const meta = statusMeta(tx.status);
            const interactive = Boolean(onSelect);
            return (
              <div
                key={tx.id}
                className={`bg-white rounded-xl p-4 shadow-sm border border-surface-100 transition-colors duration-150 ${
                  interactive ? "cursor-pointer hover:border-brand-300 active:bg-surface-50" : ""
                }`}
                onClick={interactive ? () => onSelect?.(tx) : undefined}
                onKeyDown={
                  interactive
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelect?.(tx);
                        }
                      }
                    : undefined
                }
                tabIndex={interactive ? 0 : undefined}
                role={interactive ? "button" : undefined}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex flex-col">
                    <span className="font-mono text-[13px] font-bold text-brand-700">
                      {tx.invoiceNumber}
                    </span>
                    <span className="text-[11px] text-surface-500 mt-0.5">
                      {formatDate(new Date(tx.createdAt))}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${meta.tone}`}
                  >
                    {meta.icon}
                    {meta.label}
                  </span>
                </div>
                
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-50">
                  <div className="text-sm font-medium text-surface-700 truncate max-w-[150px]">
                    {tx.customerName || (
                      <span className="italic text-surface-400">Walk-in</span>
                    )}
                  </div>
                  <div className="text-right font-black text-surface-900 tabular-nums">
                    {formatRupiah(Number(tx.total))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  });

export default RecentTransactionsList;
