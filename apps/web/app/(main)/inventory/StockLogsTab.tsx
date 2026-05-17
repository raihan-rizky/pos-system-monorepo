"use client";

import React, { useState } from "react";
import { useInventoryLogs, InventoryLog } from "@/hooks/useInventoryLogs";
import { PackagePlus, PackageMinus, Settings2, RefreshCw, ChevronLeft, ChevronRight, Filter, Calendar, Archive } from "lucide-react";

const typeConfig: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  IN:         { label: "Stock In",    icon: <PackagePlus  className="w-4 h-4" />, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-100" },
  OUT:        { label: "Stock Out",   icon: <PackageMinus className="w-4 h-4" />, color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-100" },
  ADJUSTMENT: { label: "Adjustment",  icon: <Settings2    className="w-4 h-4" />, color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-100" },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function relativeTime(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffM = Math.floor((now - then) / 60000);
  if (diffM < 1) return "Just now";
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return formatDate(dateStr);
}

export default function StockLogsTab() {
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, isError } = useInventoryLogs({
    type: typeFilter || undefined,
    page,
    limit,
    days: 60,
  });

  const logs = data?.logs || [];
  const pagination = data?.pagination;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Last 60 Days</span>
          {pagination && (
            <span className="ml-2 px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">
              {pagination.total} entries
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          {[
            { id: "", label: "All" },
            { id: "IN", label: "Stock In" },
            { id: "OUT", label: "Stock Out" },
            { id: "ADJUSTMENT", label: "Adjust" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => { setTypeFilter(f.id); setPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                typeFilter === f.id
                  ? "bg-slate-900 text-white shadow-md"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
          <p className="text-sm font-medium">Loading stock logs…</p>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-red-400">
          <p className="text-sm font-medium">Failed to load stock logs</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <Archive className="w-8 h-8 text-slate-300" />
          </div>
          <p className="font-bold text-slate-700">No stock movements found</p>
          <p className="text-sm mt-1">No inventory changes recorded in the last 60 days.</p>
        </div>
      ) : (
        <>
          {/* ── Desktop Table ── */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Date</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Product</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Type</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-widest text-right">Qty</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Note</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: InventoryLog) => {
                  const cfg = typeConfig[log.type];
                  return (
                    <tr key={log.id} className="group border-b border-slate-50 hover:bg-blue-50/30 transition-colors duration-150">
                      <td className="py-3 px-4 align-middle">
                        <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatDate(log.createdAt)}</p>
                        <p className="text-[11px] text-slate-400 tabular-nums">{formatTime(log.createdAt)}</p>
                      </td>
                      <td className="py-3 px-4 align-middle">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                            {log.product.imageUrl
                              ? <img src={log.product.imageUrl} alt="" className="w-full h-full object-cover" />
                              : <span className="text-lg">{log.product.category?.icon || "📦"}</span>}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 text-sm">{log.product.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold tracking-wider">{log.product.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 align-middle">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 align-middle text-right">
                        <span className={`text-sm font-black tabular-nums ${
                          log.type === "IN" ? "text-emerald-600" : log.type === "OUT" ? "text-amber-600" : "text-blue-600"
                        }`}>
                          {log.type === "IN" ? "+" : log.type === "OUT" ? "−" : "±"}{log.quantity}
                        </span>
                        <span className="text-xs text-slate-400 ml-1">{log.product.unit}</span>
                      </td>
                      <td className="py-3 px-4 align-middle">
                        <p className="text-sm text-slate-500 max-w-[200px] truncate">{log.note || "—"}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Mobile Cards ── */}
          <div className="flex flex-col gap-3 md:hidden">
            {logs.map((log: InventoryLog) => {
              const cfg = typeConfig[log.type];
              return (
                <div key={log.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                        {log.product.imageUrl
                          ? <img src={log.product.imageUrl} alt="" className="w-full h-full object-cover rounded-xl" />
                          : <span className="text-lg">{log.product.category?.icon || "📦"}</span>}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 text-sm truncate">{log.product.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold">{relativeTime(log.createdAt)}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-base font-black tabular-nums ${
                        log.type === "IN" ? "text-emerald-600" : log.type === "OUT" ? "text-amber-600" : "text-blue-600"
                      }`}>
                        {log.type === "IN" ? "+" : log.type === "OUT" ? "−" : "±"}{log.quantity}
                      </span>
                      <span className={`ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${cfg.color} ${cfg.bg} ${cfg.border} border`}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                  {log.note && (
                    <p className="mt-2 pt-2 border-t border-slate-50 text-xs text-slate-500 truncate">{log.note}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Pagination ── */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-400 font-medium">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
