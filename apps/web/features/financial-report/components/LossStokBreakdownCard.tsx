"use client";

import React, { useMemo } from "react";
import { formatRupiah } from "@/lib/utils";
import type { LossBucket, LossReason } from "../helpers/report-core";

interface LossStokBreakdownCardProps {
  rows: LossBucket[];
  loading?: boolean;
}

const REASON_META: Record<
  LossReason,
  { label: string; color: string; order: number; hint?: string }
> = {
  WASTE: { label: "Waste / Rusak", color: "#DC2626", order: 1 },
  USAGE: { label: "Pemakaian", color: "#F59E0B", order: 2 },
  OPNAME: { label: "Opname", color: "#6366F1", order: 3 },
  MANUAL_ADJUSTMENT: { label: "Penyesuaian", color: "#8B5CF6", order: 4 },
  UNCLASSIFIED: {
    label: "Tidak terklasifikasi",
    color: "#94A3B8",
    order: 5,
    hint: "Belum ditandai oleh staff",
  },
};

export const LossStokBreakdownCard: React.FC<LossStokBreakdownCardProps> =
  React.memo(function LossStokBreakdownCard({ rows, loading }) {
    const sorted = useMemo(
      () =>
        [...rows]
          .filter((row) => row.entryCount > 0)
          .sort((a, b) => REASON_META[a.reason].order - REASON_META[b.reason].order),
      [rows],
    );

    const totalNet = useMemo(
      () => sorted.reduce((sum, row) => sum + row.netValue, 0),
      [sorted],
    );
    const totalEntries = useMemo(
      () => sorted.reduce((sum, row) => sum + row.entryCount, 0),
      [sorted],
    );

    return (
      <section className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
        <header className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
          <span
            className="w-1.5 h-5 rounded-full bg-amber-500"
            aria-hidden="true"
          />
          <h2 className="text-sm font-semibold text-surface-900">
            Loss Stok per Kategori
          </h2>
          {!loading && sorted.length > 0 && (
            <span className="ml-auto text-[11px] font-medium text-surface-500">
              {sorted.length} kategori
            </span>
          )}
        </header>

        <div className="px-5 py-4">
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
              Tidak ada loss stok pada periode ini.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-surface-100">
                {sorted.map((row) => {
                  const meta = REASON_META[row.reason];
                  const muted = row.reason === "UNCLASSIFIED";
                  return (
                    <li
                      key={row.reason}
                      className="py-2.5 flex items-center gap-3"
                    >
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: meta.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <p
                            className={`text-sm font-semibold truncate ${
                              muted ? "text-surface-500" : "text-surface-900"
                            }`}
                          >
                            {meta.label}
                          </p>
                          <p
                            className={`text-sm font-semibold tabular-nums shrink-0 ${
                              muted
                                ? "text-surface-500"
                                : row.netValue < 0
                                  ? "text-emerald-700"
                                  : "text-surface-900"
                            }`}
                          >
                            {formatRupiah(row.netValue)}
                          </p>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-surface-500">
                          <span>{meta.hint ?? `${row.entryCount} entri`}</span>
                          {meta.hint && (
                            <span>{row.entryCount} entri</span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 pt-3 border-t border-surface-200 flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wider text-surface-500">
                  Total Net
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] text-surface-500">
                    {totalEntries} entri
                  </span>
                  <span
                    className={`text-base font-bold tabular-nums ${
                      totalNet < 0 ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {formatRupiah(totalNet)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    );
  });

export default LossStokBreakdownCard;
