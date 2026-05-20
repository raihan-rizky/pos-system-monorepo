"use client";

import React, { useMemo } from "react";
import { formatRupiah } from "@/lib/utils";
import type { PaymentMixRow } from "../types";

interface PaymentMixCardProps {
  rows: PaymentMixRow[];
  loading?: boolean;
}

const METHOD_COLOR: Record<string, string> = {
  CASH: "#10B981",
  TRANSFER: "#3B82F6",
  QRIS: "#8B5CF6",
  DEBIT: "#6366F1",
  KREDIT: "#F59E0B",
};
const FALLBACK_COLOR = "#64748B";

function methodColor(name: string): string {
  return METHOD_COLOR[name.toUpperCase()] ?? FALLBACK_COLOR;
}

export const PaymentMixCard: React.FC<PaymentMixCardProps> = React.memo(
  function PaymentMixCard({ rows, loading }) {
    const sorted = useMemo(
      () =>
        (rows ?? [])
          .filter((row) => row.revenue > 0)
          .slice()
          .sort((a, b) => b.revenue - a.revenue),
      [rows],
    );

    const total = useMemo(
      () => sorted.reduce((sum, row) => sum + row.revenue, 0),
      [sorted],
    );

    if (loading) {
      return (
        <div className="space-y-4">
          <div className="h-2.5 w-full rounded-full bg-surface-100 animate-pulse" />
          <ul className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <li
                key={i}
                className="h-10 rounded-md bg-surface-50 animate-pulse"
              />
            ))}
          </ul>
        </div>
      );
    }

    if (sorted.length === 0) {
      return (
        <p className="text-sm text-surface-500 text-center py-10">
          Belum ada transaksi hari ini.
        </p>
      );
    }

    return (
      <div className="space-y-4">
        <div
          role="img"
          aria-label="Komposisi revenue per metode pembayaran hari ini"
          className="flex h-2.5 rounded-full overflow-hidden border border-surface-200"
        >
          {sorted.map((row) => {
            const pct = total > 0 ? (row.revenue / total) * 100 : 0;
            if (pct <= 0) return null;
            return (
              <span
                key={row.method}
                title={`${row.method} · ${pct.toFixed(1)}%`}
                style={{
                  width: `${pct}%`,
                  backgroundColor: methodColor(row.method),
                }}
              />
            );
          })}
        </div>

        <ul className="divide-y divide-surface-100">
          {sorted.map((row) => {
            const pct = total > 0 ? (row.revenue / total) * 100 : 0;
            return (
              <li
                key={row.method}
                className="py-2.5 flex items-center gap-3"
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: methodColor(row.method) }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-surface-900 truncate">
                      {row.method}
                    </p>
                    <p className="text-sm font-semibold text-surface-900 tabular-nums shrink-0">
                      {formatRupiah(row.revenue)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[11px] text-surface-500">
                    {row.transactionCount} transaksi · {pct.toFixed(1)}%
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  },
);

export default PaymentMixCard;
