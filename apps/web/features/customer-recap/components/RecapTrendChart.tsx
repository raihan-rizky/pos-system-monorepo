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
  const data = trend.points.map((point) => ({
    bucketKey: point.bucketKey,
    label: point.label,
    amount:
      mode === "page"
        ? (point as PageTrend["points"][number]).revenue
        : (point as DetailTrend["points"][number]).spent,
    orderCount: point.orderCount,
  }));

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
        Tren Periode
      </p>
      <h3 className="mt-1 text-sm font-black text-slate-900">
        Omzet dan jumlah order
      </h3>
      <div className="mt-4 h-64 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" minTickGap={24} />
            <YAxis
              yAxisId="amount"
              tickFormatter={(value) => `${Number(value) / 1000}k`}
            />
            <YAxis yAxisId="orders" orientation="right" allowDecimals={false} />
            <Tooltip
              formatter={(value, name) =>
                name === "Order"
                  ? [Number(value), "Order"]
                  : [formatCurrency(Number(value)), "Omzet"]
              }
            />
            <Line
              yAxisId="amount"
              type="monotone"
              dataKey="amount"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              name="Omzet"
            />
            <Line
              yAxisId="orders"
              type="monotone"
              dataKey="orderCount"
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={false}
              name="Order"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default RecapTrendChart;
