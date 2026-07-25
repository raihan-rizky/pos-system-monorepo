"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info } from "lucide-react";
import { ChartAiInsightButton } from "@/features/chart-ai-insight/ChartAiInsightButton";
import type { InventorySummary } from "../types/inventory-management";

const HEALTH_METRICS = [
  {
    name: "Akurasi Inventaris",
    color: "#10b981",
    desc: "Sesuai vs Selisih",
    calc: "Persentase produk aktif yang tidak mengalami penyesuaian stok manual (selisih) pada hari ini.",
  },
  {
    name: "Ketersediaan Stok",
    color: "#3b82f6",
    desc: "Tersedia vs Kosong",
    calc: "Persentase item produk yang jumlah stoknya berada di atas batas minimum (tidak kosong/low-stock).",
  },
  {
    name: "Rasio Fulfillment",
    color: "#f59e0b",
    desc: "Selesai vs Pending",
    calc: "Persentase Surat Jalan dan Permintaan Internal yang telah berhasil dipenuhi (Confirmed/Approved) dibandingkan total permintaan aktif.",
  },
] as const;

function getHealthMetricValue(
  summary: InventorySummary,
  metricName: (typeof HEALTH_METRICS)[number]["name"],
): number {
  if (metricName === "Akurasi Inventaris") {
    return summary.chartData?.health.accuracy ?? 0;
  }
  if (metricName === "Ketersediaan Stok") {
    return summary.chartData?.health.availability ?? 0;
  }
  return summary.chartData?.health.fulfillment ?? 0;
}

export function InventoryOverviewCharts({
  summary,
}: {
  summary: InventorySummary;
}) {
  const inboundOutbound = summary.chartData?.inboundOutbound ?? [];

  return (
    <>
      <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2">
        <div className="mb-4 flex items-center gap-1.5">
          <h2 className="flex-1 text-base font-bold text-slate-900">
            Volume Inbound vs Outbound (7 Hari)
          </h2>
          <div className="group relative flex items-center">
            <Info className="h-4 w-4 cursor-help text-slate-400 transition-colors hover:text-slate-600" />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
              <div className="rounded-md bg-slate-900 p-2.5 text-center text-xs leading-relaxed text-white shadow-xl">
                Dihitung dari total kuantitas barang yang diterima (inbound)
                dan barang yang dikeluarkan (outbound) per harinya.
                <div className="absolute left-1/2 top-full -mt-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-900" />
              </div>
            </div>
          </div>
          <ChartAiInsightButton
            chartTitle="Volume Inbound vs Outbound (7 Hari)"
            chartContext={JSON.stringify(inboundOutbound)}
          />
        </div>
        <div className="h-64 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={inboundOutbound}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
              />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#64748b" }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#64748b" }}
              />
              <Tooltip
                cursor={{ fill: "#f8fafc" }}
                contentStyle={{
                  borderRadius: "8px",
                  border: "none",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
              />
              <Bar
                dataKey="inbound"
                name="Inbound"
                fill="#8b5cf6"
                radius={[4, 4, 0, 0]}
                maxBarSize={20}
                isAnimationActive={false}
              />
              <Bar
                dataKey="outbound"
                name="Outbound"
                fill="#f43f5e"
                radius={[4, 4, 0, 0]}
                maxBarSize={20}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-5 text-base font-bold text-slate-900">
          Kesehatan Gudang
        </h2>
        <div className="flex flex-1 flex-col justify-center gap-6 pb-2">
          {HEALTH_METRICS.map((metric) => {
            const value = getHealthMetricValue(summary, metric.name);

            return (
              <div key={metric.name} className="flex items-center gap-4">
                <div className="relative flex shrink-0 items-center justify-center">
                  <PieChart width={56} height={56}>
                    <Pie
                      data={[{ value }, { value: 100 - value }]}
                      cx="50%"
                      cy="50%"
                      innerRadius={20}
                      outerRadius={26}
                      startAngle={90}
                      endAngle={-270}
                      dataKey="value"
                      stroke="none"
                      isAnimationActive={false}
                    >
                      <Cell fill={metric.color} />
                      <Cell fill="#f1f5f9" />
                    </Pie>
                  </PieChart>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="text-[11px] font-black text-slate-800">
                      {value}%
                    </span>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate text-sm font-bold text-slate-900">
                      {metric.name}
                    </h3>
                    <div className="group relative flex shrink-0 items-center">
                      <Info className="h-3.5 w-3.5 cursor-help text-slate-400 transition-colors hover:text-slate-600" />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-48 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                        <div className="whitespace-normal rounded-md bg-slate-900 p-2 text-center text-[10px] leading-relaxed text-white shadow-xl">
                          {metric.calc}
                          <div className="absolute left-1/2 top-full -mt-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-900" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {metric.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default InventoryOverviewCharts;
