import React from "react";
import { Card } from "@pos/ui";
import { formatRupiah, formatDate } from "@/lib/utils";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";

// Mapping colors for production stages
const STATUS_COLORS: Record<string, string> = {
  PENDING: "#94a3b8", // Slate 400 #94a3b8
  DESIGNING: "#8b5cf6", // Blue 500 #3b82f6
  PRINTING: "#3b82f6", // Amber 500 #f59e0b
  FINISHING: "#f59e0b", // Violet 500 #8b5cf6
  READY_PICKUP: "#10b981", // Emerald 500 #10b981
  DELIVERED: "#06b6d4", // Cyan 500 #06b6d4
  UNKNOWN: "#cbd5e1", // Slate 300
};

// Make sure to add this type or use it implicitly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function TopSalespersonsWidget({ data }: { data: any[] }) {
  return (
    <Card>
      <h2 className="text-base font-bold text-surface-900 mb-4">
        🏆 Top Salesperson
      </h2>
      {data?.length ? (
        <div className="space-y-3">
          {data.map((sp, idx) => (
            <div
              key={sp.id || idx}
              className="flex items-center justify-between border-b border-surface-50 pb-2 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold">
                  {idx + 1}
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-900">
                    {sp.name}
                  </p>
                  <p className="text-xs text-surface-400">
                    {sp.txCount} transaksi
                  </p>
                </div>
              </div>
              <p className="text-sm font-semibold text-surface-900">
                {formatRupiah(sp.revenue)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-surface-400">Belum ada data sales</p>
      )}
    </Card>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function TopCustomersWidget({ data }: { data: any[] }) {
  return (
    <Card>
      <h2 className="text-base font-bold text-surface-900 mb-4">
        👑 Top Customer (30 Hari)
      </h2>
      {data?.length ? (
        <div className="space-y-3">
          {data.map((c, idx) => (
            <div
              key={c.id || idx}
              className="flex items-center justify-between border-b border-surface-50 pb-2 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-accent-100 text-accent-600 flex items-center justify-center text-xs font-bold">
                  {idx + 1}
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-900">
                    {c.name}
                  </p>
                  <p className="text-xs text-surface-400">{c.phone || "-"}</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-surface-900">
                {formatRupiah(c.totalSpent)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-surface-400">Belum ada data pelanggan</p>
      )}
    </Card>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ProductionStatusWidget({ data }: { data: any[] }) {
  // Format data for chart and handle label mapping
  const chartData =
    data?.map((ps) => ({
      name: (ps.status || "UNKNOWN").replace(/_/g, " "),
      value: ps.count,
      rawStatus: ps.status || "UNKNOWN",
    })) || [];

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-surface-900">
          🏭 Status Produksi
        </h2>
      </div>
      <div className="h-[240px] w-full">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      STATUS_COLORS[entry.rawStatus] || STATUS_COLORS.UNKNOWN
                    }
                  />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "none",
                  boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                }}
              />
              <Legend
                verticalAlign="bottom"
                align="center"
                layout="horizontal"
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span className="text-[10px] font-medium text-surface-600 capitalize">
                    {value.toLowerCase()}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-surface-400">
              Tidak ada order dalam produksi
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ActiveDPWidget({
  data,
  onSelect,
}: {
  data: any[];
  onSelect?: (tx: any) => void;
}) {
  return (
    <Card>
      <h2 className="text-base font-bold text-surface-900 mb-4">
        ⏳ Down Payment Aktif
      </h2>
      {data?.length ? (
        <div className="space-y-3">
          {data.map((dp, idx) => (
            <div
              key={dp.id || idx}
              className={`flex items-center justify-between border-b border-surface-50 pb-2 last:border-0 last:pb-0 ${onSelect ? "cursor-pointer hover:bg-surface-50 -mx-2 px-2 rounded-lg transition-colors" : ""}`}
              onClick={() => onSelect?.(dp)}
            >
              <div>
                <p className="text-sm font-medium text-brand-600">
                  {dp.invoiceNumber}
                </p>
                <p className="text-xs text-surface-400">
                  {dp.customerName || "Customer"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-surface-900">
                  {formatRupiah(dp.total)}
                </p>
                <p className="text-xs text-danger-500">
                  Kurang: {formatRupiah(dp.total - dp.paidAmount)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-surface-400">Tidak ada transaksi DP aktif</p>
      )}
    </Card>
  );
}
