"use client";

import React from "react";
import { formatRupiah } from "@/lib/utils";
import type { ActiveDpTransaction } from "../types";

interface ActiveDpListProps<T extends ActiveDpTransaction> {
  data: T[];
  loading?: boolean;
  onSelect?: (tx: T) => void;
}

function ActiveDpListInner<T extends ActiveDpTransaction>({
  data,
  loading,
  onSelect,
}: ActiveDpListProps<T>) {
  if (loading) {
    return (
      <ul className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <li
            key={i}
            className="h-12 rounded-lg bg-surface-50 animate-pulse"
          />
        ))}
      </ul>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-surface-500 text-center py-6">
        Tidak ada transaksi DP aktif.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-surface-100">
      {data.map((dp, idx) => {
        const total = Number(dp.total || 0);
        const paid = Number(dp.paidAmount || 0);
        const remaining = Math.max(0, total - paid);
        const progress = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
        const interactive = Boolean(onSelect);
        const handleClick = () => onSelect?.(dp);
        const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
          if (!interactive) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect?.(dp);
          }
        };

        return (
          <li key={dp.id || idx}>
            <div
              role={interactive ? "button" : undefined}
              tabIndex={interactive ? 0 : undefined}
              onClick={interactive ? handleClick : undefined}
              onKeyDown={interactive ? handleKeyDown : undefined}
              className={`py-3 px-2 -mx-2 rounded-lg flex items-center gap-3 transition-colors duration-150 ${
                interactive
                  ? "cursor-pointer hover:bg-surface-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                  : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-brand-700 truncate">
                    {dp.invoiceNumber || "—"}
                  </p>
                  <p className="text-sm font-bold text-surface-900 tabular-nums shrink-0">
                    {formatRupiah(total)}
                  </p>
                </div>
                <p className="text-[11px] text-surface-500 truncate mt-0.5">
                  {dp.customerName || "Pelanggan"}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div
                    className="flex-1 h-1.5 rounded-full bg-surface-100 overflow-hidden"
                    aria-label={`Progress pembayaran ${progress.toFixed(0)}%`}
                  >
                    <span
                      className="block h-full rounded-full bg-amber-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-red-600 tabular-nums shrink-0">
                    Kurang {formatRupiah(remaining)}
                  </span>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export const ActiveDpList = React.memo(ActiveDpListInner) as typeof ActiveDpListInner;

export default ActiveDpList;
