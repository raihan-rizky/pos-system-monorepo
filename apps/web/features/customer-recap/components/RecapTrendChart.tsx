"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  CustomerDetailRecapData,
  CustomerRecapData,
} from "../types/customer-recap";

type PageTrend = CustomerRecapData["trend"];
type DetailTrend = CustomerDetailRecapData["trend"];

interface RecapTrendChartProps {
  trend: PageTrend | DetailTrend;
  mode: "page" | "detail";
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function RecapTrendChart({ trend, mode }: RecapTrendChartProps) {
  const isPageMode = mode === "page";
  const data = trend.points.map((point) => ({
    bucketKey: point.bucketKey,
    label: point.label,
    primary:
      isPageMode
        ? (point as PageTrend["points"][number]).newCustomers
        : (point as DetailTrend["points"][number]).spent,
    secondary: isPageMode
      ? (point as PageTrend["points"][number]).returningCustomers
      : point.orderCount,
  }));
  const heading = isPageMode
    ? "Pelanggan baru dan kembali"
    : "Omzet dan jumlah order";
  const primaryName = isPageMode ? "Pelanggan Baru" : "Omzet";
  const secondaryName = isPageMode ? "Pelanggan Kembali" : "Order";

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
        Tren Periode
      </p>
      <h3 className="mt-1 text-sm font-black text-slate-900">
        {heading}
      </h3>
      <div className="mt-4 h-64 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" minTickGap={24} />
            <YAxis
              yAxisId="primary"
              allowDecimals={!isPageMode}
              tickFormatter={(value) =>
                isPageMode ? String(value) : `${Number(value) / 1000}k`
              }
            />
            {!isPageMode ? (
              <YAxis yAxisId="secondary" orientation="right" allowDecimals={false} />
            ) : null}
            <Tooltip
              formatter={(value, name) =>
                name === secondaryName || isPageMode
                  ? [Number(value), String(name)]
                  : [formatCurrency(Number(value)), primaryName]
              }
            />
            <Line
              yAxisId="primary"
              type="monotone"
              dataKey="primary"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              name={primaryName}
            />
            <Line
              yAxisId={isPageMode ? "primary" : "secondary"}
              type="monotone"
              dataKey="secondary"
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={false}
              name={secondaryName}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default RecapTrendChart;
