"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
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

interface ChartDatum {
  bucketKey: string;
  label: string;
  barValue: number;
  lineValue: number;
  barLabel: string;
  barColor: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCompactCurrency(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) return `${Math.round(amount / 1_000_000)}jt`;
  if (Math.abs(amount) >= 1_000) return `${Math.round(amount / 1_000)}rb`;
  return String(Math.round(amount));
}

function formatDays(days: number): string {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(days)} hari`;
}

export const RecapTrendChart: React.FC<RecapTrendChartProps> = ({ trend, mode }) => {
  const isPageMode = mode === "page";
  const data: ChartDatum[] = trend.points.map((point) => {
    const detailPoint = point as DetailTrend["points"][number];
    const debtPaidOffAmount = isPageMode ? 0 : detailPoint.debtPaidOffAmount;
    const hasPaidOffDebt = !isPageMode && debtPaidOffAmount > 0;

    return {
      bucketKey: point.bucketKey,
      label: point.label,
      barValue: isPageMode
        ? (point as PageTrend["points"][number]).transactionCount
        : hasPaidOffDebt
          ? debtPaidOffAmount
          : detailPoint.runningDebtRemaining,
      lineValue: isPageMode
        ? (point as PageTrend["points"][number]).averageOrderValue
        : detailPoint.averagePaymentDays,
      barLabel: isPageMode
        ? "Jumlah Transaksi"
        : hasPaidOffDebt
          ? "Sisa utang yang dilunasi"
          : "Sisa Piutang Berjalan",
      barColor: hasPaidOffDebt ? "#16a34a" : "#2563eb",
    };
  });
  const heading = isPageMode
    ? "Jumlah transaksi dan rata-rata nilai belanja"
    : "Sisa piutang dan rata-rata waktu pelunasan";
  const barName = isPageMode ? "Jumlah Transaksi" : "Sisa Piutang Berjalan";
  const lineName = isPageMode ? "Rata-rata Nilai Belanja" : "Rata-rata Waktu Pelunasan";

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
        Tren Periode
      </p>
      <h3 className="mt-1 text-sm font-black text-slate-900">
        {heading}
      </h3>
      {isPageMode ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-slate-600">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-[2px] bg-[#2563eb]"></div>
            <span>Jumlah Transaksi</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-0.5 w-3 bg-[#0f766e]"></div>
            <span>Rata-rata Nilai Belanja</span>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-slate-600">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-[2px] bg-[#2563eb]"></div>
            <span>Piutang Berjalan</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-[2px] bg-[#16a34a]"></div>
            <span>Piutang Dilunasi</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-0.5 w-3 bg-[#0f766e]"></div>
            <span>Waktu Pelunasan</span>
          </div>
        </div>
      )}
      <div className="mt-4 h-72 min-w-0 overflow-hidden sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, left: 0, right: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" minTickGap={24} />
            <YAxis
              yAxisId="bar"
              allowDecimals={false}
              width={isPageMode ? 34 : 48}
              tickFormatter={(value) =>
                isPageMode ? String(value) : formatCompactCurrency(Number(value))
              }
            />
            <YAxis
              yAxisId="line"
              orientation="right"
              width={isPageMode ? 48 : 42}
              allowDecimals={!isPageMode}
              tickFormatter={(value) =>
                isPageMode ? formatCompactCurrency(Number(value)) : String(Number(value))
              }
            />
            <Tooltip
              formatter={(value, name, entry) => {
                const payload =
                  entry && typeof entry === "object" && "payload" in entry
                    ? (entry as { payload?: ChartDatum }).payload
                    : undefined;

                return name === barName
                  ? [
                      isPageMode ? Number(value) : formatCurrency(Number(value)),
                      payload?.barLabel ?? String(name),
                    ]
                  : [
                      isPageMode ? formatCurrency(Number(value)) : formatDays(Number(value)),
                      String(name),
                    ];
              }}
            />
            <Bar
              yAxisId="bar"
              dataKey="barValue"
              fill="#2563eb"
              radius={[6, 6, 0, 0]}
              maxBarSize={42}
              name={barName}
            >
              {data.map((point) => (
                <Cell key={point.bucketKey} fill={point.barColor} />
              ))}
            </Bar>
            <Line
              yAxisId="line"
              type="monotone"
              dataKey="lineValue"
              stroke="#0f766e"
              strokeWidth={2}
              dot={false}
              name={lineName}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RecapTrendChart;
