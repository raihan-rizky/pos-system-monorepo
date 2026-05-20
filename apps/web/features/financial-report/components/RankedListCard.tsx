"use client";

import React, { useMemo } from "react";
import { formatRupiah } from "@/lib/utils";

export interface RankedRow {
  key: string;
  name: string;
  primaryValue: number;
  secondaryValue?: number;
  countLabel?: string;
}

export type RankedAccent = "brand" | "success" | "warning";

interface RankedListCardProps {
  title: string;
  rows: RankedRow[];
  accent?: RankedAccent;
  emptyText?: string;
  maxRows?: number;
  loading?: boolean;
}

const accentBar: Record<RankedAccent, string> = {
  brand: "bg-brand-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
};

const rankBadge: Record<number, string> = {
  1: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  2: "bg-surface-100 text-surface-700 ring-1 ring-surface-200",
  3: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
};

export const RankedListCard: React.FC<RankedListCardProps> = React.memo(
  function RankedListCard({
    title,
    rows,
    accent = "brand",
    emptyText = "Tidak ada data pada periode ini.",
    maxRows = 8,
    loading,
  }) {
    const visible = useMemo(() => rows.slice(0, maxRows), [rows, maxRows]);
    const max = useMemo(
      () => visible.reduce((m, r) => Math.max(m, r.primaryValue), 0),
      [visible],
    );

    return (
      <section className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
        <header className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`w-1.5 h-5 rounded-full ${accentBar[accent]}`}
          />
          <h2 className="text-sm font-semibold text-surface-900">{title}</h2>
          {!loading && rows.length > 0 && (
            <span className="ml-auto text-[11px] font-medium text-surface-500">
              {rows.length} entri
            </span>
          )}
        </header>

        {loading ? (
          <ul className="divide-y divide-surface-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-full bg-surface-100 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-2/3 rounded bg-surface-100 animate-pulse" />
                    <div className="h-1.5 w-full rounded-full bg-surface-100 animate-pulse" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : visible.length === 0 ? (
          <p className="text-sm text-surface-500 text-center px-5 py-10">
            {emptyText}
          </p>
        ) : (
          <ol className="divide-y divide-surface-100">
            {visible.map((row, idx) => {
              const rank = idx + 1;
              const pct = max > 0 ? (row.primaryValue / max) * 100 : 0;
              return (
                <li key={row.key} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      aria-label={`Peringkat ${rank}`}
                      className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
                        rankBadge[rank] ?? "bg-surface-50 text-surface-500"
                      }`}
                    >
                      {rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-surface-900 truncate">
                          {row.name}
                        </p>
                        <p className="text-sm font-semibold text-surface-900 tabular-nums shrink-0">
                          {formatRupiah(row.primaryValue)}
                        </p>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <div
                          className="flex-1 h-1.5 rounded-full bg-surface-100 overflow-hidden"
                          aria-hidden="true"
                        >
                          <span
                            className={`block h-full rounded-full ${accentBar[accent]}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-surface-500 shrink-0">
                          {row.countLabel && <span>{row.countLabel}</span>}
                          {row.secondaryValue !== undefined && (
                            <span className="tabular-nums font-semibold text-emerald-700">
                              {formatRupiah(row.secondaryValue)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    );
  },
);

export default RankedListCard;
