"use client";

import React from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { formatRupiah, formatRupiahCompact } from "@/lib/utils";
import type { TrendSeries } from "@/features/financial-report/helpers/report-core";

interface TrendChartProps {
  trend: TrendSeries | undefined;
  loading?: boolean;
}

const SERIES = [
  { key: "omzet", label: "Omzet", color: "#0c98e9" }, // brand-500
  { key: "cost", label: "Cost (HPP + Loss Stok)", color: "#f59e0b" }, // amber-500
  { key: "labaKotor", label: "Laba Kotor", color: "#10b981" }, // emerald-500
] as const;

const GRANULARITY_LABEL: Record<string, string> = {
  daily: "Per hari",
  weekly: "Per minggu",
  monthly: "Per bulan",
};

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  color: string;
  payload: { label: string };
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const label = payload[0]?.payload?.label ?? "";
  const byKey = new Map(payload.map((item) => [item.dataKey, item]));
  return (
    <div
      role="tooltip"
      className="rounded-xl border border-surface-200 bg-white px-3 py-2.5 shadow-lg"
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-surface-500">
        {label}
      </p>
      <ul className="mt-1.5 space-y-1">
        {SERIES.map((series) => {
          const item = byKey.get(series.key);
          const value = typeof item?.value === "number" ? item.value : 0;
          return (
            <li
              key={series.key}
              className="flex items-center justify-between gap-4 text-xs"
            >
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: series.color }}
                />
                <span className="text-surface-600">{series.label}</span>
              </span>
              <span className="tabular-nums font-semibold text-surface-900">
                {formatRupiah(value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChartLegend({
  payload,
}: {
  payload?: Array<{ dataKey: string }>;
}) {
  void payload;
  return (
    <ul className="mt-1 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[11px] font-semibold text-surface-600">
      {SERIES.map((series) => (
        <li key={series.key} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: series.color }}
          />
          {series.label}
        </li>
      ))}
    </ul>
  );
}

export const TrendChart: React.FC<TrendChartProps> = React.memo(
  function TrendChart({ trend, loading }) {
    const granularityLabel = trend
      ? (GRANULARITY_LABEL[trend.granularity] ?? "")
      : "";

    const hasData = React.useMemo(() => {
      if (!trend) return false;
      return trend.points.some(
        (p) => p.omzet !== 0 || p.cost !== 0 || p.labaKotor !== 0,
      );
    }, [trend]);

    return (
      <section
        aria-label="Tren Omzet, Cost, dan Laba Kotor"
        className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden"
      >
        <header className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
          <span
            className="w-1.5 h-5 rounded-full bg-brand-500"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-surface-900">
              Tren Omzet, Cost & Laba Kotor
            </h2>
            {granularityLabel && (
              <p className="text-[11px] text-surface-500 mt-0.5">
                {granularityLabel}
              </p>
            )}
          </div>
        </header>

        <div className="px-3 py-4 md:px-5">
          {loading ? (
            <div
              role="status"
              aria-label="Memuat grafik tren"
              className="h-[260px] md:h-[280px] rounded-xl bg-surface-100 animate-pulse"
            />
          ) : !trend || trend.points.length === 0 || !hasData ? (
            <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-center">
              <span
                aria-hidden="true"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-100 text-surface-400"
              >
                <TrendingUp className="h-5 w-5" />
              </span>
              <p className="text-sm text-surface-500">
                Belum ada data di periode ini.
              </p>
            </div>
          ) : (
            <div className="h-[260px] md:h-[280px]" data-testid="trend-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={trend.points}
                  margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e2e8f0"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="#94a3b8"
                    tick={{ fontSize: 11 }}
                    tickMargin={8}
                    interval="preserveStartEnd"
                    minTickGap={32}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fontSize: 11 }}
                    tickFormatter={formatRupiahCompact}
                    width={56}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ stroke: "#cbd5e1", strokeDasharray: "3 3" }}
                  />
                  <Legend content={<ChartLegend />} verticalAlign="top" />
                  {SERIES.map((series) => (
                    <Line
                      key={series.key}
                      type="monotone"
                      dataKey={series.key}
                      name={series.label}
                      stroke={series.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>
    );
  },
);

export default TrendChart;
