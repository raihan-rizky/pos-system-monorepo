"use client";

import React, { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { useShiftHistory } from "@/hooks/useShift";
import { formatRupiah, formatDate } from "@/lib/utils";

export default function ShiftHistoryPage() {
  const [page, setPage] = useState(1);
  const { data: result, isLoading } = useShiftHistory(page, 10);

  const shifts = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;

  const startItem = total === 0 ? 0 : (page - 1) * 10 + 1;
  const endItem = Math.min(page * 10, total);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-surface-50">
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col ml-0 md:ml-[72px] overflow-hidden pb-16 md:pb-0">
        <header className="px-4 md:px-8 py-4 md:py-6 bg-white border-b border-surface-100">
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-surface-900">Riwayat Shift Kasir</h1>
            <p className="text-sm text-surface-500 mt-1">Daftar rekapan sesi kasir dan selisih kas laci uang</p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
            {isLoading ? (
              <div className="p-8 flex justify-center text-surface-400 font-medium">Loading shift data...</div>
            ) : shifts.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-surface-400">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-3 opacity-50">
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
                <p className="font-medium text-surface-600">Belum ada riwayat shift.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-surface-50 border-b border-surface-200 text-surface-600">
                        <th className="py-4 px-6 font-semibold">Waktu Mulai</th>
                        <th className="py-4 px-6 font-semibold">Waktu Selesai</th>
                        <th className="py-4 px-6 font-semibold">Kasir</th>
                        <th className="py-4 px-6 font-semibold">Modal Laci</th>
                        <th className="py-4 px-6 font-semibold">Tutup Laci</th>
                        <th className="py-4 px-6 font-semibold">Catatan</th>
                        <th className="py-4 px-6 font-semibold text-right">Selisih</th>
                        <th className="py-4 px-6 font-semibold text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {shifts.map((shift) => (
                        <tr key={shift.id} className="hover:bg-surface-50 transition-colors">
                          <td className="py-4 px-6 text-surface-900">{formatDate(shift.openedAt)}</td>
                          <td className="py-4 px-6 text-surface-600">{shift.closedAt ? formatDate(shift.closedAt) : "-"}</td>
                          <td className="py-4 px-6 font-medium text-surface-900">{shift.cashier?.name || "Kasir"}</td>
                          <td className="py-4 px-6 font-bold text-surface-900">{formatRupiah(shift.openingBalance)}</td>
                          <td className="py-4 px-6 font-bold text-surface-900">{shift.closingBalance != null ? formatRupiah(shift.closingBalance) : "-"}</td>
                          <td className="py-4 px-6 text-surface-500 max-w-[150px] truncate" title={shift.note || ""}>{shift.note || "-"}</td>
                          <td className="py-4 px-6 text-right font-extrabold">
                            {shift.discrepancy != null ? (
                              <span className={shift.discrepancy === 0 ? "text-success-600" : shift.discrepancy < 0 ? "text-danger-600" : "text-amber-600"}>
                                {shift.discrepancy > 0 ? "+" : ""}{formatRupiah(shift.discrepancy)}
                              </span>
                            ) : "-"}
                          </td>
                          <td className="py-4 px-6 text-center">
                            <span className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider inline-flex justify-center min-w-[80px] ${shift.status === "OPEN" ? "bg-brand-50 text-brand-700 border border-brand-200" : "bg-surface-100 text-surface-600 border border-surface-200"}`}>
                              {shift.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-surface-100">
                  <p className="text-sm text-surface-500">
                    Menampilkan <span className="font-semibold text-surface-900">{startItem}–{endItem}</span> dari <span className="font-semibold text-surface-900">{total}</span>
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="px-3 py-2 rounded-xl border border-surface-200 text-sm font-medium hover:bg-surface-50 disabled:opacity-40 transition-colors"
                    >Prev</button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="px-3 py-2 rounded-xl border border-surface-200 text-sm font-medium hover:bg-surface-50 disabled:opacity-40 transition-colors"
                    >Next</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
