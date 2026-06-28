"use client";

import React from "react";
import dynamic from "next/dynamic";
import { formatRupiah } from "@/lib/utils";
import type { RevenueChartPoint } from "../types";
import { ChartAiInsightButton } from "@/features/chart-ai-insight/ChartAiInsightButton";

const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false },
);
const AreaChart = dynamic(
  () => import("recharts").then((m) => m.AreaChart),
  { ssr: false },
);
const Area = dynamic(() => import("recharts").then((m) => m.Area), {
  ssr: false,
});
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), {
  ssr: false,
});
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), {
  ssr: false,
});
const CartesianGrid = dynamic(
  () => import("recharts").then((m) => m.CartesianGrid),
  { ssr: false },
);
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), {
  ssr: false,
});

interface RevenueTrendChartProps {
  data: RevenueChartPoint[];
  loading?: boolean;
}

function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}jt`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}rb`;
  return String(value);
}

export const RevenueTrendChart: React.FC<RevenueTrendChartProps> = React.memo(
  function RevenueTrendChart({ data, loading }) {
    if (loading) {
      return (
        <div className="h-[300px] w-full rounded-xl bg-surface-50 animate-pulse" />
      );
    }
    if (!data || data.length === 0) {
      return (
        <div className="h-[300px] w-full rounded-xl border border-dashed border-surface-200 flex items-center justify-center text-sm text-surface-500">
          Belum ada data revenue dalam 7 hari terakhir.
        </div>
      );
    }
    return (
      <div className="relative">
        <div className="absolute right-0 top-0 z-10">
          <ChartAiInsightButton
            chartTitle="Tren Revenue 7 Hari"
            chartContext={JSON.stringify(data)}
          />
        </div>
        <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%" minHeight={300}>
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="dash-revenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0c98e9" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#0c98e9" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="dash-profit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748B", fontSize: 11 }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748B", fontSize: 11 }}
              tickFormatter={compactNumber}
              dx={-6}
            />
            <CartesianGrid
              vertical={false}
              stroke="#E2E8F0"
              strokeDasharray="4 4"
            />
            <Tooltip
              cursor={{ stroke: "#CBD5E1", strokeDasharray: "4 4" }}
              contentStyle={{
                backgroundColor: "#fff",
                borderRadius: 12,
                border: "1px solid #E2E8F0",
                boxShadow: "0 10px 15px -3px rgba(0,0,0,0.08)",
                fontSize: 12,
              }}
              labelStyle={{
                fontWeight: 700,
                color: "#0F172A",
                marginBottom: 4,
              }}
              formatter={(value: unknown, name: unknown) => [
                formatRupiah(Number(value)),
                typeof name === "string"
                  ? name.charAt(0).toUpperCase() + name.slice(1)
                  : "",
              ]}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#0c98e9"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#dash-revenue)"
            />
            <Area
              type="monotone"
              dataKey="profit"
              stroke="#10b981"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#dash-profit)"
            />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      </div>
    );
  },
);

export default RevenueTrendChart;
