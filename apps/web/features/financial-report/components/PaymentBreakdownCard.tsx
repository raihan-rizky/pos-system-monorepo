"use client";

import React, { useMemo } from "react";
import { formatRupiah } from "@/lib/utils";

interface PaymentRow {
  method: string;
  transactionCount: number;
  revenue: number;
  collected: number;
}

interface PaymentBreakdownCardProps {
  rows: PaymentRow[];
  totalRevenue: number;
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

export const PaymentBreakdownCard: React.FC<PaymentBreakdownCardProps> =
  React.memo(function PaymentBreakdownCard({ rows, totalRevenue, loading }) {
    const sorted = useMemo(
      () => [...rows].sort((a, b) => b.revenue - a.revenue),
      [rows],
    );
    const denom = useMemo(() => {
      if (totalRevenue > 0) return totalRevenue;
      return rows.reduce((sum, r) => sum + r.revenue, 0);
    }, [rows, totalRevenue]);

    return (
      <section className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
        <header className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
          <span className="w-1.5 h-5 rounded-full bg-brand-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-surface-900">
            Metode Pembayaran
          </h2>
          {!loading && sorted.length > 0 && (
            <span className="ml-auto text-[11px] font-medium text-surface-500">
              {sorted.length} metode
            </span>
          )}
        </header>

        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <div className="h-3 w-full rounded-full bg-surface-100 animate-pulse" />
          ) : sorted.length > 0 ? (
            <div
              role="img"
              aria-label="Komposisi revenue per metode pembayaran"
              className="flex h-3 rounded-full overflow-hidden border border-surface-200"
            >
              {sorted.map((row) => {
                const pct = denom > 0 ? (row.revenue / denom) * 100 : 0;
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
          ) : null}

          {loading ? (
            <ul className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <li
                  key={i}
                  className="h-10 rounded-md bg-surface-50 animate-pulse"
                />
              ))}
            </ul>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-surface-500 text-center py-8">
              Belum ada pembayaran pada periode ini.
            </p>
          ) : (
            <ul className="divide-y divide-surface-100">
              {sorted.map((row) => {
                const pct = denom > 0 ? (row.revenue / denom) * 100 : 0;
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
                      <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-surface-500">
                        <span>
                          {row.transactionCount} transaksi · {pct.toFixed(1)}%
                        </span>
                        <span className="tabular-nums font-semibold text-emerald-700">
                          {formatRupiah(row.collected)} terkumpul
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    );
  });

export default PaymentBreakdownCard;
