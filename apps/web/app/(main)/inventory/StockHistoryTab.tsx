"use client";

import React, { useMemo } from "react";
import { useInventoryLogs, InventoryLog } from "@/hooks/useInventoryLogs";
import { RefreshCw, TrendingUp, TrendingDown, Activity, Archive, PackagePlus, PackageMinus, Settings2 } from "lucide-react";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

/** Group logs by day and compute daily IN / OUT / NET totals */
function useDailyStats(logs: InventoryLog[]) {
  return useMemo(() => {
    const map = new Map<string, { date: string; inQty: number; outQty: number; adjustQty: number }>();

    for (const log of logs) {
      const day = new Date(log.createdAt).toISOString().slice(0, 10);
      const entry = map.get(day) || { date: day, inQty: 0, outQty: 0, adjustQty: 0 };

      if (log.type === "IN") entry.inQty += log.quantity;
      else if (log.type === "OUT") entry.outQty += log.quantity;
      else entry.adjustQty += log.quantity;

      map.set(day, entry);
    }

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [logs]);
}

/** Simple bar chart rendered with CSS — no charting library needed */
function MiniBarChart({ data }: { data: { date: string; inQty: number; outQty: number }[] }) {
  const maxVal = Math.max(1, ...data.map((d) => Math.max(d.inQty, d.outQty)));

  // Show at most last 14 days to keep it readable
  const displayData = data.slice(-14);

  return (
    <div className="flex items-end gap-1.5 h-40 px-2">
      {displayData.map((d) => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          {/* Bars */}
          <div className="flex gap-[2px] items-end w-full h-28">
            <div
              className="flex-1 bg-emerald-400 rounded-t-md transition-all duration-500 min-h-[2px]"
              style={{ height: `${(d.inQty / maxVal) * 100}%` }}
              title={`In: ${d.inQty}`}
            />
            <div
              className="flex-1 bg-amber-400 rounded-t-md transition-all duration-500 min-h-[2px]"
              style={{ height: `${(d.outQty / maxVal) * 100}%` }}
              title={`Out: ${d.outQty}`}
            />
          </div>
          {/* Date label */}
          <span className="text-[9px] font-bold text-slate-400 tabular-nums whitespace-nowrap">
            {formatDate(d.date)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Top movers — products with the most stock changes */
function TopMovers({ logs }: { logs: InventoryLog[] }) {
  const movers = useMemo(() => {
    const map = new Map<string, { product: InventoryLog["product"]; totalIn: number; totalOut: number }>();
    for (const log of logs) {
      const entry = map.get(log.productId) || { product: log.product, totalIn: 0, totalOut: 0 };
      if (log.type === "IN") entry.totalIn += log.quantity;
      else if (log.type === "OUT") entry.totalOut += log.quantity;
      map.set(log.productId, entry);
    }
    return Array.from(map.values())
      .map((m) => ({ ...m, totalMoves: m.totalIn + m.totalOut }))
      .sort((a, b) => b.totalMoves - a.totalMoves)
      .slice(0, 5);
  }, [logs]);

  if (movers.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Top Movers (60d)</h3>
      <div className="flex flex-col gap-2">
        {movers.map((m, i) => {
          const maxBar = Math.max(1, movers[0].totalMoves);
          return (
            <div key={m.product.id} className="flex items-center gap-3">
              <span className="w-5 text-[10px] font-black text-slate-300 tabular-nums text-right">{i + 1}</span>
              <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-sm">
                {m.product.imageUrl
                  ? <img src={m.product.imageUrl} alt="" className="w-full h-full object-cover rounded-lg" />
                  : (m.product.category?.icon || "📦")}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{m.product.name}</p>
                <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-blue-400 transition-all duration-700"
                    style={{ width: `${(m.totalMoves / maxBar) * 100}%` }}
                  />
                </div>
              </div>
              <div className="text-right shrink-0 tabular-nums">
                <span className="text-xs font-bold text-emerald-600">+{m.totalIn}</span>
                <span className="text-slate-300 mx-1">/</span>
                <span className="text-xs font-bold text-amber-600">−{m.totalOut}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function StockHistoryTab() {
  const { data, isLoading, isError } = useInventoryLogs({ limit: 100, days: 60 });
  const logs = data?.logs || [];
  const dailyStats = useDailyStats(logs);

  // Summary stats
  const totalIn = logs.filter((l) => l.type === "IN").reduce((s, l) => s + l.quantity, 0);
  const totalOut = logs.filter((l) => l.type === "OUT").reduce((s, l) => s + l.quantity, 0);
  const totalAdj = logs.filter((l) => l.type === "ADJUSTMENT").reduce((s, l) => s + l.quantity, 0);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
        <p className="text-sm font-medium">Loading stock history…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-red-400">
        <p className="text-sm font-medium">Failed to load stock history</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <Archive className="w-8 h-8 text-slate-300" />
        </div>
        <p className="font-bold text-slate-700">No stock history yet</p>
        <p className="text-sm mt-1">Start recording inventory changes to see trends here.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="relative overflow-hidden rounded-2xl p-5 bg-emerald-50/60 border border-emerald-100/60">
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-emerald-200/30 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center">
              <PackagePlus className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-[10px] font-black text-emerald-600/70 uppercase tracking-widest">Total In</p>
              <p className="text-2xl font-black text-emerald-700 tabular-nums">+{totalIn}</p>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl p-5 bg-amber-50/60 border border-amber-100/60">
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-amber-200/30 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center">
              <PackageMinus className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-[10px] font-black text-amber-600/70 uppercase tracking-widest">Total Out</p>
              <p className="text-2xl font-black text-amber-700 tabular-nums">−{totalOut}</p>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl p-5 bg-blue-50/60 border border-blue-100/60">
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-blue-200/30 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center">
              <Settings2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-[10px] font-black text-blue-600/70 uppercase tracking-widest">Adjustments</p>
              <p className="text-2xl font-black text-blue-700 tabular-nums">±{totalAdj}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Daily Movement Chart ── */}
      {dailyStats.length > 0 && (
        <div className="bg-white/60 rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-black text-slate-800">Daily Stock Movement</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-400 mr-1 align-middle" /> In
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-400 mx-1 ml-3 align-middle" /> Out
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <Activity className="w-4 h-4" />
              <span className="text-xs font-bold">{dailyStats.length} days</span>
            </div>
          </div>
          <MiniBarChart data={dailyStats} />
        </div>
      )}

      {/* ── Top Movers ── */}
      <div className="bg-white/60 rounded-2xl border border-slate-100 p-5">
        <TopMovers logs={logs} />
      </div>
    </div>
  );
}
