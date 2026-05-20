"use client";

import React from "react";
import { formatRupiah } from "@/lib/utils";

interface ShiftRow {
  id: string;
  cashierName: string;
  status: string;
  openingBalance: number;
  expectedBalance: number;
  closingBalance: number;
  discrepancy: number;
}

interface ShiftReconciliationCardProps {
  shifts: ShiftRow[];
  loading?: boolean;
}

function statusBadgeClass(status: string): string {
  const upper = status.toUpperCase();
  if (upper === "OPEN" || upper === "ACTIVE") {
    return "bg-blue-50 text-blue-700 ring-1 ring-blue-200";
  }
  if (upper === "CLOSED") {
    return "bg-surface-100 text-surface-700 ring-1 ring-surface-200";
  }
  if (upper === "PENDING") {
    return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  }
  return "bg-surface-50 text-surface-600 ring-1 ring-surface-200";
}

function discrepancyBadgeClass(value: number): string {
  if (value < 0) return "bg-red-50 text-red-600 ring-1 ring-red-100";
  if (value > 0) return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
  return "bg-surface-50 text-surface-600 ring-1 ring-surface-100";
}

export const ShiftReconciliationCard: React.FC<ShiftReconciliationCardProps> =
  React.memo(function ShiftReconciliationCard({ shifts, loading }) {
    return (
      <section className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
        <header className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-1.5 h-5 rounded-full bg-surface-400"
          />
          <h2 className="text-sm font-semibold text-surface-900">
            Rekonsiliasi Shift
          </h2>
          {!loading && shifts.length > 0 && (
            <span className="ml-auto text-[11px] font-medium text-surface-500">
              {shifts.length} shift
            </span>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-50/60 text-left">
                <th
                  scope="col"
                  className="px-5 py-3 font-semibold text-surface-600"
                >
                  Kasir
                </th>
                <th
                  scope="col"
                  className="px-5 py-3 font-semibold text-surface-600"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-5 py-3 text-right font-semibold text-surface-600"
                >
                  Modal
                </th>
                <th
                  scope="col"
                  className="px-5 py-3 text-right font-semibold text-surface-600"
                >
                  Expected
                </th>
                <th
                  scope="col"
                  className="px-5 py-3 text-right font-semibold text-surface-600"
                >
                  Closing
                </th>
                <th
                  scope="col"
                  className="px-5 py-3 text-right font-semibold text-surface-600"
                >
                  Selisih
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-5 py-4">
                      <div className="h-5 w-full rounded bg-surface-50 animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : shifts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-sm text-surface-500"
                  >
                    Tidak ada shift pada periode ini.
                  </td>
                </tr>
              ) : (
                shifts.map((shift) => (
                  <tr key={shift.id} className="hover:bg-surface-50/60 transition-colors">
                    <td className="px-5 py-3 font-semibold text-surface-900">
                      {shift.cashierName}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${statusBadgeClass(shift.status)}`}
                      >
                        {shift.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-surface-700">
                      {formatRupiah(shift.openingBalance)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-surface-700">
                      {formatRupiah(shift.expectedBalance)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-surface-700">
                      {formatRupiah(shift.closingBalance)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold tabular-nums ${discrepancyBadgeClass(shift.discrepancy)}`}
                      >
                        {formatRupiah(shift.discrepancy)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  });

export default ShiftReconciliationCard;
